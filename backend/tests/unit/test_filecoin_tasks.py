"""Durable task inputs and explicit task-boundary restart, without paid storage."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
from types import SimpleNamespace

import pytest

from quantum_backend_v2.application.peer_tasks import PeerTaskDispatcher
from quantum_backend_v2.artifacts.filecoin import FilecoinReceipt, FilecoinStore
from quantum_backend_v2.protocols.compute import ComputeTaskRequest, ComputeTaskResponse

pytestmark = pytest.mark.anyio


class MemoryStore(FilecoinStore):
    def __init__(self):
        self.data = {}
        self.uploads = 0
        self.corrupt = False
        self.fail_upload = False

    async def upload(self, data):
        self.uploads += 1
        if self.fail_upload:
            raise OSError("storage outcome unknown")
        receipt = FilecoinReceipt(
            piece_cid="bafkzcibfixture",
            sha256=hashlib.sha256(data).hexdigest(),
            size_bytes=len(data),
        )
        self.data[receipt.sha256] = data
        return receipt

    async def command(self, command, **arguments):
        assert command == "download"
        data = b"corrupt" if self.corrupt else self.data[arguments["sha256"]]
        return {"data_base64": base64.b64encode(data).decode()}


class Network:
    def __init__(self, peer="peer-a"):
        self.peer = SimpleNamespace(peer_id=peer, health_status="healthy", network_addresses=())
        self.registry = SimpleNamespace(list_peers=lambda include_stale=False: [self.peer])
        self.calls = []

    async def request_peer_rpc(self, **kwargs):
        request = ComputeTaskRequest.model_validate_json(kwargs["payload"])
        self.calls.append(request.input["n"])
        return (
            ComputeTaskResponse(
                task_id=request.task_id,
                executing_peer_id=self.peer.peer_id,
                ok=True,
                output={"double": request.input["n"] * 2},
            )
            .model_dump_json()
            .encode()
        )

    def dispatcher(self):
        return PeerTaskDispatcher(
            discovery_service=self, protocol_id="/test", local_peer_id="coordinator"
        )


def no_local(_):
    raise AssertionError("a checkpoint error must not rerun the task locally")


async def test_checkpoint_resume_skips_completed_inputs_on_a_replacement_peer():
    store = MemoryStore()
    original = Network()
    published = []

    async def interrupt_after_saved(receipt):
        published.append(receipt)
        raise OSError("coordinator stopped after saving")

    with pytest.raises(RuntimeError, match="checkpoint"):
        await original.dispatcher().run(
            "test.double",
            [{"n": 1}, {"n": 2}],
            run_locally=no_local,
            filecoin_store=store,
            checkpoint_namespace="user/run-one",
            on_checkpoint=interrupt_after_saved,
        )
    assert original.calls == [1]
    assert store.uploads == 1

    replacement = Network("peer-replacement")

    async def save(receipt):
        published.append(receipt)

    outcomes = await replacement.dispatcher().run(
        "test.double",
        [{"n": 1}, {"n": 2}],
        run_locally=no_local,
        filecoin_store=store,
        checkpoint_namespace="user/run-one",
        checkpoint_receipt=published[-1],
        on_checkpoint=save,
    )
    assert replacement.calls == [2]
    assert [o.output["double"] for o in outcomes] == [2, 4]
    assert [o.executed_by for o in outcomes] == ["peer-a", "peer-replacement"]
    assert store.uploads == 2


async def test_verified_dataset_supplies_the_actual_dispatched_inputs():
    from quantum_backend_v2.application.filecoin_tasks import create_dataset

    store, network = MemoryStore(), Network()
    receipt = await store.upload(create_dataset("test.double", [{"n": 3}]))
    result = await network.dispatcher().run(
        "test.double",
        None,
        run_locally=no_local,
        filecoin_store=store,
        dataset_receipt=receipt,
    )
    assert network.calls == [3]
    assert result[0].output == {"double": 6}
    assert store.uploads == 1  # reading a dataset does not enable checkpoint writes


@pytest.mark.parametrize("mismatch", ["input", "kind", "namespace", "groups"])
async def test_checkpoint_identity_mismatch_prevents_any_execution(mismatch):
    store, network = MemoryStore(), Network()
    published = []

    async def save(receipt):
        published.append(receipt)

    await network.dispatcher().run(
        "test.double",
        [{"n": 1}, {"n": 2}],
        run_locally=no_local,
        filecoin_store=store,
        checkpoint_namespace="user/run-one",
        on_checkpoint=save,
    )
    new_network = Network("new-peer")
    with pytest.raises(ValueError, match="checkpoint"):
        await new_network.dispatcher().run(
            "test.other" if mismatch == "kind" else "test.double",
            [{"n": 9}, {"n": 2}] if mismatch == "input" else [{"n": 1}, {"n": 2}],
            run_locally=no_local,
            filecoin_store=store,
            checkpoint_namespace="user/run-two" if mismatch == "namespace" else "user/run-one",
            checkpoint_receipt=published[-1],
            on_checkpoint=save,
            groups=["same", "same"] if mismatch == "groups" else None,
        )
    assert new_network.calls == []


async def test_corrupt_dataset_bytes_are_rejected_before_computation():
    from quantum_backend_v2.application.filecoin_tasks import create_dataset

    store, network = MemoryStore(), Network()
    receipt = await store.upload(create_dataset("test.double", [{"n": 3}]))
    store.corrupt = True
    with pytest.raises(ValueError, match="match"):
        await network.dispatcher().run(
            "test.double",
            None,
            run_locally=no_local,
            filecoin_store=store,
            dataset_receipt=receipt,
        )
    assert network.calls == []


async def test_resume_keeps_group_winners_and_does_not_run_sibling_starts():
    store, network = MemoryStore(), Network()
    published = []

    async def interrupt(receipt):
        published.append(receipt)
        raise OSError("stop")

    task_inputs = [{"n": 1}, {"n": 2}, {"n": 3}]
    with pytest.raises(RuntimeError, match="checkpoint"):
        await network.dispatcher().run(
            "test.double",
            task_inputs,
            run_locally=no_local,
            groups=["a", "a", "b"],
            filecoin_store=store,
            checkpoint_namespace="user/group-run",
            on_checkpoint=interrupt,
        )

    async def save(receipt):
        published.append(receipt)

    replacement = Network("new-peer")
    results = await replacement.dispatcher().run(
        "test.double",
        task_inputs,
        run_locally=no_local,
        groups=["a", "a", "b"],
        filecoin_store=store,
        checkpoint_namespace="user/group-run",
        checkpoint_receipt=published[-1],
        on_checkpoint=save,
    )
    assert replacement.calls == [3]
    assert results[0].output == {"double": 2}
    assert results[1] is None
    assert results[2].output == {"double": 6}


async def test_storage_failure_does_not_repeat_computation_or_upload():
    store, network = MemoryStore(), Network()
    store.fail_upload = True

    async def save(_):
        raise AssertionError("upload failed, so there is no receipt")

    with pytest.raises(RuntimeError, match="checkpoint"):
        await network.dispatcher().run(
            "test.double",
            [{"n": 1}, {"n": 2}],
            run_locally=no_local,
            filecoin_store=store,
            checkpoint_namespace="user/run-fails",
            on_checkpoint=save,
        )
    assert network.calls == [1]
    assert store.uploads == 1


async def test_local_fallback_receives_the_verified_dataset():
    from quantum_backend_v2.application.filecoin_tasks import create_dataset

    store = MemoryStore()
    receipt = await store.upload(create_dataset("test.double", [{"n": 4}]))
    calls = []

    def run_local(value):
        calls.append(value)
        return {"double": value["n"] * 2}

    results = await PeerTaskDispatcher(discovery_service=None).run(
        "test.double",
        None,
        run_locally=run_local,
        filecoin_store=store,
        dataset_receipt=receipt,
    )
    assert calls == [{"n": 4}]
    assert results[0].output == {"double": 8}


async def test_completed_resume_neither_computes_nor_uploads_again():
    store, network = MemoryStore(), Network()
    published = []

    async def save(receipt):
        published.append(receipt)

    options = dict(
        filecoin_store=store,
        checkpoint_namespace="owner/completed",
        on_checkpoint=save,
    )
    await network.dispatcher().run("test.double", [{"n": 1}], run_locally=no_local, **options)
    store.fail_upload = True
    fresh = Network("new-peer")
    outcomes = await fresh.dispatcher().run(
        "test.double",
        [{"n": 1}],
        run_locally=no_local,
        checkpoint_receipt=published[-1],
        **options,
    )
    assert outcomes[0].output == {"double": 2}
    assert fresh.calls == []
    assert store.uploads == 1


@pytest.mark.parametrize("invalid", ["index", "duplicate_group", "nonfinite_output"])
async def test_hash_valid_but_invalid_checkpoint_is_rejected(invalid):
    store, network = MemoryStore(), Network()
    published = []

    async def save(receipt):
        published.append(receipt)

    options = dict(
        filecoin_store=store,
        checkpoint_namespace="owner/structure",
        on_checkpoint=save,
        groups=["one", "one"],
    )
    await network.dispatcher().run(
        "test.double",
        [{"n": 1}, {"n": 2}],
        run_locally=no_local,
        **options,
    )
    payload = json.loads(store.data[published[-1].sha256])
    if invalid == "index":
        payload["completed"]["2"] = payload["completed"].pop("0")
    elif invalid == "duplicate_group":
        payload["completed"]["1"] = payload["completed"]["0"]
    else:
        payload["completed"]["0"]["output"] = {"energy": float("nan")}
    malformed = await store.upload(json.dumps(payload).encode())
    fresh = Network()
    with pytest.raises(ValueError):
        await fresh.dispatcher().run(
            "test.double",
            [{"n": 1}, {"n": 2}],
            run_locally=no_local,
            checkpoint_receipt=malformed,
            **options,
        )
    assert fresh.calls == []


async def test_receipt_callback_failure_exposes_uploaded_checkpoint_for_recovery():
    from quantum_backend_v2.application.filecoin_tasks import CheckpointPersistenceError

    store, network = MemoryStore(), Network()

    async def failed_callback(_):
        raise OSError("database unavailable")

    with pytest.raises(CheckpointPersistenceError) as failure:
        await network.dispatcher().run(
            "test.double",
            [{"n": 1}],
            run_locally=no_local,
            filecoin_store=store,
            checkpoint_namespace="owner/callback",
            on_checkpoint=failed_callback,
        )
    assert failure.value.receipt is not None
    assert json.loads(await store.download(failure.value.receipt))["completed"]["0"]["output"] == {
        "double": 2
    }
    assert store.uploads == 1


async def test_concurrent_storage_failure_stops_other_checkpoint_uploads():
    class UncertainStore(MemoryStore):
        async def upload(self, data):
            self.uploads += 1
            await asyncio.sleep(0.01)
            raise OSError("transaction outcome unknown")

    store, network = UncertainStore(), Network()
    peers = [
        SimpleNamespace(peer_id=f"peer-{n}", health_status="healthy", network_addresses=())
        for n in range(3)
    ]
    network.registry.list_peers = lambda include_stale=False: peers

    async def save(_):
        raise AssertionError("no confirmed upload")

    with pytest.raises(RuntimeError, match="checkpoint"):
        await network.dispatcher().run(
            "test.double",
            [{"n": n} for n in range(6)],
            run_locally=no_local,
            filecoin_store=store,
            checkpoint_namespace="owner/parallel",
            on_checkpoint=save,
        )
    assert sorted(network.calls) == [0, 1, 2]
    assert store.uploads == 1
