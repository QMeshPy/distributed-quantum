import hashlib
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.application.filecoin_archive import (
    FilecoinBundleStorage,
    FilecoinOperations,
)
from quantum_backend_v2.artifacts.filecoin import FilecoinReceipt, Package
from quantum_backend_v2.provenance.models import StorageReference


@pytest.mark.anyio
async def test_archive_accepts_real_completed_run_and_preserves_commitment(monkeypatch):
    from quantum_backend_v2.application.filecoin_archive import export_run, verify_export
    from quantum_backend_v2.persistence import mongodb
    from quantum_backend_v2.provenance.hashing import bundle_hash
    from quantum_backend_v2.provenance.verification import RunEvidence, build_result_bundle

    evidence = RunEvidence(
        run_id="run-12345",
        workflow_definition_id="circuit",
        owner_user_id="alice",
        input_snapshot={"qasm": "h 0"},
        plan_id="plan-1",
        result={"fragment_results": []},
    )
    bundle = build_result_bundle(evidence, created_at=datetime.now(timezone.utc))

    class Run:
        @classmethod
        async def get(cls, key):
            return SimpleNamespace(
                id=evidence.run_id,
                status="COMPLETED",
                owner_user_id="alice",
                workflow_definition_id="circuit",
                input_snapshot=evidence.input_snapshot,
                artifact_bundle_id="plan-1",
                output_snapshot={"result": evidence.result},
            )

    class Plan:
        @classmethod
        async def get(cls, key):
            return SimpleNamespace(payload={"plan_id": "plan-1"})

    class Bundles:
        @classmethod
        async def find_one(cls, query):
            return SimpleNamespace(
                payload=bundle.model_dump(mode="json"), content_hash=bundle_hash(bundle)
            )

        @classmethod
        def get_pymongo_collection(cls):
            return cls

        @classmethod
        async def update_one(cls, *args):
            pass

    class Store:
        uploads = []

        async def upload(self, data):
            self.uploads.append(data)
            return FilecoinReceipt(
                piece_cid="bafkzcibfixture",
                sha256=hashlib.sha256(data).hexdigest(),
                size_bytes=len(data),
            )

    monkeypatch.setattr(mongodb, "WorkflowRunDocument", Run)
    monkeypatch.setattr(mongodb, "ExecutionPlanDocument", Plan)
    monkeypatch.setattr(mongodb, "ProvenanceBundleDocument", Bundles)
    store = Store()
    await export_run(evidence.run_id, owner_id="alice", store=store)
    report = await verify_export(store.uploads[0])
    assert all(check.status == "passed" for check in report.checks if check.kind == "hash")


@pytest.mark.anyio
async def test_archive_operation_replay_does_not_publish_again(monkeypatch):
    from quantum_backend_v2.application import filecoin_service

    calls = []
    receipt = FilecoinReceipt(piece_cid="bafkzcibfixture", sha256="a" * 64, size_bytes=200)

    async def export(*args, **kwargs):
        calls.append(1)
        return receipt

    class Service(filecoin_service.FilecoinService):
        async def account(self, *args):
            return None, object()

    database = {"filecoin_operations": Collection(), "filecoin_locks": Collection()}
    service = Service(database, filecoin_service.FilecoinConfig(), {}, dispatcher=None)
    monkeypatch.setattr(filecoin_service, "export_run", export)

    async def prepare(*args, **kwargs):
        return None, b"{}"

    monkeypatch.setattr(filecoin_service, "prepare_run_export", prepare)
    args = dict(agent_id="agent", owner_id="alice", operation_id="operation1", run_id="run-12345")
    assert await service.export(**args) == receipt
    assert await service.export(**args) == receipt
    assert len(calls) == 1


class Collection:
    def __init__(self):
        self.rows = {}

    async def find_one(self, query):
        return self.rows.get(query["_id"])

    async def insert_one(self, row):
        if row["_id"] in self.rows:
            raise DuplicateKeyError("duplicate")
        self.rows[row["_id"]] = row.copy()

    async def update_one(self, query, update):
        self.rows[query["_id"]].update(update["$set"])
        return SimpleNamespace(matched_count=1)

    async def delete_one(self, query):
        self.rows.pop(query["_id"], None)


@pytest.mark.anyio
async def test_safe_rejection_releases_lock_but_lost_transaction_keeps_evidence():
    from quantum_backend_v2.artifacts.filecoin import FilecoinBridgeError

    rows, locks = Collection(), Collection()
    ops = FilecoinOperations(rows, locks)

    async def fail_safely():
        raise FilecoinBridgeError({"code": "funding_required", "uncertain": False})

    args = dict(owner_id="alice", agent_id="agent", operation_id="try1", payload={})
    with pytest.raises(FilecoinBridgeError):
        await ops.execute(**args, action=fail_safely)
    assert not locks.rows

    async def now_funded():
        return {"ok": True}

    assert await ops.execute(**args, action=now_funded) == {"ok": True}
    tx = "0x" + "a" * 64

    async def lost_transaction():
        raise FilecoinBridgeError(
            {"code": "confirmation_timeout", "uncertain": True, "transaction_hashes": [tx]}
        )

    with pytest.raises(FilecoinBridgeError):
        await ops.execute(**{**args, "operation_id": "try2"}, action=lost_transaction)
    assert locks.rows
    assert any(row.get("transaction_hashes") == [tx] for row in rows.rows.values())


@pytest.mark.anyio
async def test_failed_read_after_confirmed_upload_is_not_a_preflight_rejection():
    from quantum_backend_v2.artifacts.filecoin import FilecoinBridgeError, FilecoinStore

    data = b"x" * 256
    tx = "0x" + "b" * 64
    receipt = FilecoinReceipt(
        piece_cid="bafkzcibfixture",
        sha256=hashlib.sha256(data).hexdigest(),
        size_bytes=len(data),
        transaction_hashes=(tx,),
    )

    class Store(FilecoinStore):
        async def command(self, command, **kwargs):
            if command == "upload":
                return receipt.model_dump(mode="json")
            raise FilecoinBridgeError({"code": "read_failed", "uncertain": False})

    rows, locks = Collection(), Collection()
    operations = FilecoinOperations(rows, locks)

    async def action():
        return (await Store().upload(data)).model_dump(mode="json")

    with pytest.raises(FilecoinBridgeError):
        await operations.execute(
            owner_id="alice", agent_id="agent", operation_id="upload", payload={}, action=action
        )
    row = next(iter(rows.rows.values()))
    assert row["state"] == "uncertain"
    assert row["transaction_hashes"] == [tx]
    assert row["submitted_receipt"] == receipt.model_dump(mode="json")
    assert locks.rows


@pytest.mark.anyio
async def test_write_is_idempotent_and_unknown_write_blocks_retry():
    journal, locks = Collection(), Collection()
    operations = FilecoinOperations(journal, locks)
    called = []

    async def action():
        called.append(True)
        return {"tx": "confirmed"}

    args = dict(owner_id="alice", agent_id="agent", operation_id="operation1", payload={"x": 1})
    assert await operations.execute(**args, action=action) == {"tx": "confirmed"}
    assert await operations.execute(**args, action=action) == {"tx": "confirmed"}
    assert len(called) == 1
    with pytest.raises(ValueError, match="different"):
        await operations.execute(**{**args, "payload": {"x": 2}}, action=action)

    async def uncertain():
        raise TimeoutError()

    with pytest.raises(TimeoutError):
        await operations.execute(**{**args, "operation_id": "operation2"}, action=uncertain)
    with pytest.raises(ValueError, match="reconcil"):
        await operations.execute(**{**args, "operation_id": "operation3"}, action=action)
    assert len(called) == 1


@pytest.mark.anyio
async def test_reference_cannot_substitute_another_package():
    package = Package.create(kind="dataset", identity="dataset", files={"data.csv": b"a,b\n1,2\n"})
    data = package.to_bytes()
    receipt = FilecoinReceipt(
        piece_cid="bafkzcibfixture", sha256=hashlib.sha256(data).hexdigest(), size_bytes=len(data)
    )

    class Store:
        async def download(self, ref):
            return data

    with pytest.raises(ValueError):
        await FilecoinBundleStorage(Store()).retrieve(
            StorageReference(backend="filecoin", cid=receipt.piece_cid, filecoin=receipt)
        )


@pytest.mark.anyio
async def test_invalid_export_does_not_freeze_agent(monkeypatch):
    from quantum_backend_v2.application import filecoin_service

    class Service(filecoin_service.FilecoinService):
        async def account(self, *args):
            return None, object()

    async def missing(*args, **kwargs):
        raise LookupError("Run not found")

    database = {"filecoin_operations": Collection(), "filecoin_locks": Collection()}
    service = Service(database, filecoin_service.FilecoinConfig(), {}, dispatcher=None)
    monkeypatch.setattr(filecoin_service, "prepare_run_export", missing)
    with pytest.raises(LookupError):
        await service.export(
            agent_id="agent", owner_id="alice", operation_id="missing-run", run_id="missing"
        )
    assert not database["filecoin_locks"].rows
    assert not database["filecoin_operations"].rows
