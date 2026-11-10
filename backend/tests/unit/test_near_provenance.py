"""NEAR registry RPC and operator evidence checks, with no paid network calls."""

from __future__ import annotations

import asyncio
import base64
import copy
import json
import threading
from datetime import datetime, timezone
from types import SimpleNamespace

import httpx
import pytest

from quantum_backend_v2.application.near_provenance import (
    NearManifest,
    attach_manifest,
    prepare_manifest,
)
from quantum_backend_v2.config.models import AppSettings, NearRegistrySettings
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.merkle import MerkleTree
from quantum_backend_v2.provenance.models import ChainAnchor
from quantum_backend_v2.provenance.near_registry import NearRegistryAdapter
from quantum_backend_v2.provenance.verification import (
    RunEvidence,
    build_result_bundle,
    verify_bundle,
)

ROOT = "ab" * 32
TX = "B" * 44
PROFILE = "qmesh-provenance-sha256-v1"
SETTINGS = NearRegistrySettings(contract_id="registry.testnet", publisher_id="publisher.testnet")


def anchor(root=ROOT, count=1):
    return ChainAnchor(
        chain="near:testnet", tx_hash=TX, merkle_root=root, leaf_index=0, leaf_count=count
    )


class Node:
    def __init__(self, root=ROOT, count=1):
        self.network = "testnet"
        self.record = dict(
            merkle_root=root,
            leaf_count=count,
            hash_profile=PROFILE,
            publisher_id="publisher.testnet",
            block_height="100",
            timestamp_ns="1",
        )
        self.transaction = {
            "hash": TX,
            "signer_id": "publisher.testnet",
            "receiver_id": "registry.testnet",
            "actions": [
                {
                    "FunctionCall": {
                        "method_name": "anchor",
                        "args": base64.b64encode(
                            json.dumps(
                                dict(merkle_root=root, leaf_count=count, hash_profile=PROFILE)
                            ).encode()
                        ).decode(),
                        "gas": 30_000_000_000_000,
                        "deposit": "10000000000000000000000",
                    }
                }
            ],
        }
        self.finality = "FINAL"
        self.status = None
        self.receipt_status = None
        self.receipt_executor = "registry.testnet"
        self.receipt_id = "registry-receipt"
        self.error = None
        self.methods = []

    def respond(self, request):
        body = json.loads(request.content)
        method, params = body["method"], body["params"]
        self.methods.append(method)
        if self.error:
            return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "error": self.error})
        if method == "status":
            result = {"chain_id": self.network}
        elif method == "tx":
            assert params == {
                "tx_hash": TX,
                "sender_account_id": "publisher.testnet",
                "wait_until": "FINAL",
            }
            success = {"SuccessValue": base64.b64encode(json.dumps(self.record).encode()).decode()}
            result = dict(
                final_execution_status=self.finality,
                transaction=self.transaction,
                status=self.status if self.status is not None else success,
                transaction_outcome={
                    "outcome": {"status": {"SuccessReceiptId": "registry-receipt"}}
                },
                receipts_outcome=[
                    {
                        "id": self.receipt_id,
                        "outcome": {
                            "executor_id": self.receipt_executor,
                            "status": self.receipt_status
                            if self.receipt_status is not None
                            else success,
                        },
                    }
                ],
            )
        elif method == "query":
            assert params["request_type"] == "call_function"
            assert params["account_id"] == "registry.testnet"
            assert params["method_name"] == "get_anchor"
            assert params["finality"] == "final"
            assert json.loads(base64.b64decode(params["args_base64"])) == {
                "merkle_root": self.record["merkle_root"]
            }
            result = {"result": list(json.dumps(self.record).encode()), "block_height": 120}
        else:
            raise AssertionError(method)
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": 1, "result": result})


def check(node, reference=None):
    with httpx.Client(transport=httpx.MockTransport(node.respond)) as client:
        adapter = NearRegistryAdapter(SETTINGS, client=client)
        return asyncio.run(adapter.contains_root(reference or anchor()))


def test_final_transaction_and_registry_record_are_both_required():
    node = Node()
    assert check(node)
    assert sorted(node.methods) == ["query", "status", "tx"]


@pytest.mark.parametrize(
    "change",
    [
        lambda n: n.transaction.update(receiver_id="other.testnet"),
        lambda n: n.transaction.update(signer_id="other.testnet"),
        lambda n: n.transaction.update(hash="C" * 44),
        lambda n: n.transaction["actions"][0]["FunctionCall"].update(method_name="other"),
        lambda n: n.transaction["actions"].append({"Transfer": {"deposit": "1"}}),
        lambda n: n.transaction["actions"][0]["FunctionCall"].update(args="e30="),
        lambda n: n.record.update(leaf_count=2),
        lambda n: n.record.update(publisher_id="other.testnet"),
        lambda n: n.record.update(hash_profile="other"),
        lambda n: setattr(n, "status", {"Failure": {}}),
        lambda n: setattr(n, "receipt_status", {"Failure": {}}),
    ],
)
def test_mismatching_or_failed_execution_never_verifies(change):
    node = Node()
    change(node)
    assert not check(node)


def test_nonfinal_unknown_and_wrong_network_are_unavailable():
    node = Node()
    for finality in ("INCLUDED", "EXECUTED_OPTIMISTIC", "NONE"):
        node.finality = finality
        with pytest.raises(OSError):
            check(node)
    node.finality = "FINAL"
    node.error = {"name": "UNKNOWN_TRANSACTION", "message": "credential-secret"}
    with pytest.raises(OSError, match="unavailable") as exc:
        check(node)
    assert "credential-secret" not in str(exc.value)
    node.error = None
    node.network = "mainnet"
    with pytest.raises(OSError):
        check(node)


def test_invalid_hash_and_chain_fail_before_network():
    node = Node()
    assert not check(node, anchor().model_copy(update={"chain": "near:mainnet"}))
    assert not check(node, anchor().model_copy(update={"tx_hash": "invalid hash"}))
    assert not node.methods


@pytest.mark.parametrize(
    "change",
    [
        lambda n: setattr(n, "status", ["SuccessValue"]),
        lambda n: setattr(n, "receipt_status", ["SuccessValue"]),
        lambda n: setattr(n, "receipt_executor", "other.testnet"),
        lambda n: setattr(n, "receipt_id", "unlinked-receipt"),
        lambda n: n.transaction.update(actions=[[]]),
    ],
)
def test_incomplete_or_malformed_receipts_are_unavailable(change):
    node = Node()
    change(node)
    with pytest.raises(OSError):
        check(node)


def test_malformed_rpc_result_becomes_unavailable_check_in_report():
    def malformed(request):
        if json.loads(request.content)["method"] == "tx":
            return httpx.Response(200, json={"result": []})
        return Node().respond(request)

    with httpx.Client(transport=httpx.MockTransport(malformed)) as client:
        adapter = NearRegistryAdapter(SETTINGS, client=client)
        with pytest.raises(OSError):
            asyncio.run(adapter.contains_root(anchor()))


def test_rpc_reads_are_concurrent_and_allow_realistic_latency():
    node = Node()
    ready = threading.Barrier(3)

    def respond(request):
        assert request.extensions["timeout"]["read"] >= 5.0
        ready.wait(timeout=2)
        return node.respond(request)

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        assert asyncio.run(NearRegistryAdapter(SETTINGS, client=client).contains_root(anchor()))


def test_invalid_rpc_port_is_rejected_during_configuration():
    with pytest.raises(ValueError):
        NearRegistrySettings(rpc_url="https://example.test:bad")


def test_settings_are_opt_in_and_reject_partial_or_non_testnet_configuration():
    assert not AppSettings.from_env({}).near_registry.configured
    configured = AppSettings.from_env(
        {
            "QB2_NEAR_REGISTRY_CONTRACT": "registry.testnet",
            "QB2_NEAR_REGISTRY_PUBLISHER": "publisher.testnet",
        }
    )
    assert configured.near_registry.configured
    for values in (
        {"contract_id": "registry.testnet"},
        {"contract_id": "registry.near", "publisher_id": "publisher.testnet"},
        {"rpc_url": "http://untrusted.example"},
    ):
        with pytest.raises(ValueError):
            NearRegistrySettings(**values)


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, length):
        return copy.deepcopy(self.rows[:length])


class Collection:
    def __init__(self):
        self.rows = {}
        self.writes = 0
        self.conflict = False
        self.run = RunEvidence(
            "workflow-1",
            "circuit-execution",
            "owner-1",
            {"circuit": "h q[0];"},
            "plan-1",
            {"fragment_results": []},
        )
        bundle = build_result_bundle(
            self.run, created_at=datetime(2026, 11, 10, tzinfo=timezone.utc)
        )
        self.rows[bundle.bundle_id] = dict(
            bundle_id=bundle.bundle_id,
            workflow_run_id=bundle.workflow_run_id,
            payload=bundle.model_dump(mode="json"),
            content_hash=bundle_hash(bundle),
            anchor_batch_id="existing-evm-batch",
        )

    def find(self, query):
        return Cursor([self.rows[key] for key in query["bundle_id"]["$in"] if key in self.rows])

    async def update_one(self, query, update):
        self.writes += 1
        row = self.rows[query["bundle_id"]]
        if self.conflict or row["payload"] != query["payload"]:
            return SimpleNamespace(matched_count=0)
        value = update["$addToSet"]["payload.anchors"]
        if value not in row["payload"]["anchors"]:
            row["payload"]["anchors"].append(value)
        return SimpleNamespace(matched_count=1)


def test_prepare_validates_committed_bundles_and_manifest():
    collection = Collection()
    ids = list(collection.rows)
    manifest = asyncio.run(prepare_manifest(collection, ids, SETTINGS))
    assert manifest.merkle_root == MerkleTree([collection.rows[ids[0]]["content_hash"]]).root
    assert NearManifest.model_validate_json(manifest.model_dump_json()) == manifest
    with pytest.raises(ValueError):
        asyncio.run(prepare_manifest(collection, ids * 2, SETTINGS))
    with pytest.raises(ValueError):
        asyncio.run(prepare_manifest(collection, ["missing"], SETTINGS))
    for update in ({"merkle_root": ROOT}, {"leaf_count": 2}, {"hash_profile": "other"}):
        with pytest.raises(ValueError):
            NearManifest.model_validate({**manifest.model_dump(), **update})
    collection.rows[ids[0]]["payload"]["summary"]["result_hash"] = ROOT
    with pytest.raises(ValueError):
        asyncio.run(prepare_manifest(collection, ids, SETTINGS))


def test_attach_verifies_before_writing_and_is_idempotent():
    collection = Collection()
    manifest = asyncio.run(prepare_manifest(collection, list(collection.rows), SETTINGS))
    node = Node(manifest.merkle_root)
    with httpx.Client(transport=httpx.MockTransport(node.respond)) as client:
        adapter = NearRegistryAdapter(SETTINGS, client=client)
        asyncio.run(attach_manifest(collection, manifest, TX, adapter))
        asyncio.run(attach_manifest(collection, manifest, TX, adapter))
    row = next(iter(collection.rows.values()))
    assert len(row["payload"]["anchors"]) == 1
    assert row["anchor_batch_id"] == "existing-evm-batch"
    assert row["payload"]["anchors"][0]["chain"] == "near:testnet"
    assert collection.writes == 1


def test_failed_verification_tampering_and_concurrent_changes_do_not_attach():
    for failure in ("rpc", "commitment", "config", "concurrency"):
        collection = Collection()
        manifest = asyncio.run(prepare_manifest(collection, list(collection.rows), SETTINGS))
        node = Node(manifest.merkle_root)
        if failure == "rpc":
            node.status = {"Failure": {}}
        elif failure == "commitment":
            next(iter(collection.rows.values()))["content_hash"] = ROOT
        elif failure == "config":
            manifest = manifest.model_copy(update={"contract_id": "other.testnet"})
        else:
            collection.conflict = True
        with httpx.Client(transport=httpx.MockTransport(node.respond)) as client:
            adapter = NearRegistryAdapter(SETTINGS, client=client)
            with pytest.raises(ValueError):
                asyncio.run(attach_manifest(collection, manifest, TX, adapter))
        assert not next(iter(collection.rows.values()))["payload"]["anchors"]
        if failure != "concurrency":
            assert collection.writes == 0


def test_near_anchor_participates_in_existing_verification_report():
    collection = Collection()
    row = next(iter(collection.rows.values()))
    manifest = asyncio.run(prepare_manifest(collection, list(collection.rows), SETTINGS))
    node = Node(manifest.merkle_root)
    with httpx.Client(transport=httpx.MockTransport(node.respond)) as client:
        adapter = NearRegistryAdapter(SETTINGS, client=client)
        asyncio.run(attach_manifest(collection, manifest, TX, adapter))
        from quantum_backend_v2.provenance.models import ProvenanceBundle

        bundle = ProvenanceBundle.model_validate(row["payload"])
        report = asyncio.run(
            verify_bundle(
                bundle,
                expected_hash=row["content_hash"],
                run=collection.run,
                anchor_adapters={"near:testnet": adapter},
            )
        )
        assert report.status == "verified"


def test_partial_batch_can_resume_without_touching_storage_or_evm_claims():
    from quantum_backend_v2.provenance.models import ProvenanceBundle

    class InterruptedCollection(Collection):
        async def update_one(self, query, update):
            if query["bundle_id"] == "provenance-workflow-2" and self.conflict:
                self.conflict = False
                return SimpleNamespace(matched_count=0)
            return await super().update_one(query, update)

    collection = InterruptedCollection()
    row = next(iter(collection.rows.values()))
    row["payload"]["storage"] = [{"backend": "fixture", "cid": "fixture-cid"}]
    row["payload"]["anchors"] = [
        anchor()
        .model_copy(
            update={
                "chain": "eip155:11155111",
                "tx_hash": "fixture-evm-transaction",
            }
        )
        .model_dump(mode="json")
    ]
    second = copy.deepcopy(row)
    second["bundle_id"] = second["payload"]["bundle_id"] = "provenance-workflow-2"
    second["workflow_run_id"] = second["payload"]["workflow_run_id"] = "workflow-2"
    second["content_hash"] = bundle_hash(ProvenanceBundle.model_validate(second["payload"]))
    collection.rows[second["bundle_id"]] = second
    before = copy.deepcopy(collection.rows)
    manifest = asyncio.run(prepare_manifest(collection, list(collection.rows), SETTINGS))
    node = Node(manifest.merkle_root, count=2)
    # Inject interruption only after the first write has completed.
    original = collection.update_one

    async def interrupted(query, update):
        if query["bundle_id"] == "provenance-workflow-2":
            collection.update_one = original
            return SimpleNamespace(matched_count=0)
        return await original(query, update)

    collection.update_one = interrupted
    with httpx.Client(transport=httpx.MockTransport(node.respond)) as client:
        adapter = NearRegistryAdapter(SETTINGS, client=client)
        with pytest.raises(ValueError, match="concurrently"):
            asyncio.run(attach_manifest(collection, manifest, TX, adapter))
        asyncio.run(attach_manifest(collection, manifest, TX, adapter))
    for key, current in collection.rows.items():
        assert current["payload"]["storage"] == before[key]["payload"]["storage"]
        assert current["payload"]["anchors"][0] == before[key]["payload"]["anchors"][0]
        assert len(current["payload"]["anchors"]) == 2
        assert current["anchor_batch_id"] == before[key]["anchor_batch_id"]
