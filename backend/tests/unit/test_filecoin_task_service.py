"""Task recovery uses durable receipts and fenced leases across coordinators."""

from __future__ import annotations

import asyncio
import copy
import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.application import compute_tasks, filecoin_service
from quantum_backend_v2.application.filecoin_service import FilecoinConfig, FilecoinService
from quantum_backend_v2.application.filecoin_tasks import CheckpointPersistenceError, create_dataset
from quantum_backend_v2.application.peer_tasks import PeerTaskDispatcher
from quantum_backend_v2.artifacts.filecoin import FilecoinReceipt


def matches(row, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(row, branch) for branch in expected):
                return False
        elif isinstance(expected, dict):
            value = row.get(key)
            for operator, argument in expected.items():
                if operator == "$in" and value not in argument:
                    return False
                if operator == "$ne" and value == argument:
                    return False
                if operator == "$lte" and (value is None or value > argument):
                    return False
                if operator == "$gt" and (value is None or value <= argument):
                    return False
        elif row.get(key) != expected:
            return False
    return True


class Collection:
    def __init__(self):
        self.rows = {}
        self.crash_checkpoint = False

    async def find_one(self, query, *, sort=None):
        rows = [copy.deepcopy(row) for row in self.rows.values() if matches(row, query)]
        for key, direction in reversed(sort or []):
            rows.sort(key=lambda row: row.get(key, ""), reverse=direction < 0)
        return rows[0] if rows else None

    async def insert_one(self, row):
        if row["_id"] in self.rows:
            raise DuplicateKeyError("duplicate")
        self.rows[row["_id"]] = copy.deepcopy(row)

    async def update_one(self, query, update):
        row = next((row for row in self.rows.values() if matches(row, query)), None)
        if row is None:
            return SimpleNamespace(modified_count=0, matched_count=0)
        if self.crash_checkpoint and "checkpoint" in update.get("$set", {}):
            self.crash_checkpoint = False
            raise asyncio.CancelledError()
        row.update(copy.deepcopy(update.get("$set", {})))
        return SimpleNamespace(modified_count=1, matched_count=1)

    async def update_many(self, query, update):
        count = 0
        for row in self.rows.values():
            if matches(row, query):
                row.update(copy.deepcopy(update.get("$set", {})))
                count += 1
        return SimpleNamespace(modified_count=count)

    async def delete_one(self, query):
        for key, row in list(self.rows.items()):
            if matches(row, query):
                self.rows.pop(key)


class Store:
    def __init__(self):
        self.data = {}
        self.uploads = 0

    def keep(self, data):
        receipt = FilecoinReceipt(
            piece_cid="bafkzcibfixture",
            sha256=hashlib.sha256(data).hexdigest(),
            size_bytes=len(data),
        )
        self.data[receipt.sha256] = data
        return receipt

    async def upload(self, data):
        self.uploads += 1
        return self.keep(data)

    async def download(self, receipt):
        data = self.data[receipt.sha256]
        assert hashlib.sha256(data).hexdigest() == receipt.sha256
        return data


class Service(FilecoinService):
    async def account(self, *args):
        return None, self.store


@pytest.fixture
def fixture(monkeypatch):
    database = {
        name: Collection()
        for name in ("filecoin_task_runs", "filecoin_operations", "filecoin_locks")
    }
    store, calls = Store(), []

    def compute(value):
        calls.append(value)
        return {"energy": -1.0}

    monkeypatch.setitem(compute_tasks.TASK_KINDS, "pharma.vqe", compute)
    service = Service(
        database, FilecoinConfig(), {}, dispatcher=PeerTaskDispatcher(discovery_service=None)
    )
    service.store = store
    inputs = [
        {"problem": {"n_qubits": 2, "n_electrons": 1, "terms": [["ZZ", 1.0]]}, "max_iterations": 3}
    ]
    dataset = store.keep(create_dataset("pharma.vqe", inputs))
    return service, database, dataset, calls


@pytest.mark.anyio
async def test_confirmed_checkpoint_survives_crash_before_task_callback(fixture):
    service, database, dataset, calls = fixture
    claim = await service.prepare_tasks(
        run_id="restart", owner_id="alice", agent_id="agent", dataset=dataset
    )
    database["filecoin_task_runs"].crash_checkpoint = True
    with pytest.raises(asyncio.CancelledError):
        await service.execute_tasks(claim)
    row = next(iter(database["filecoin_task_runs"].rows.values()))
    assert row["checkpoint"] is None
    row["lease_until"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    await service.recover_tasks()
    second = Service(
        database, FilecoinConfig(), {}, dispatcher=PeerTaskDispatcher(discovery_service=None)
    )
    second.store = service.store
    claim = await second.prepare_tasks(
        run_id="restart", owner_id="alice", agent_id="agent", dataset=dataset
    )
    await second.execute_tasks(claim)
    restored = await second.task("restart", "alice")
    assert restored["state"] == "completed", restored
    assert len(calls) == 1
    assert service.store.uploads == 1
    assert restored["checkpoint"] is not None


@pytest.mark.anyio
async def test_active_other_coordinator_is_not_reclaimed(fixture):
    service, database, dataset, calls = fixture
    claim = await service.prepare_tasks(
        run_id="active", owner_id="alice", agent_id="agent", dataset=dataset
    )
    await service.recover_tasks()
    assert (await service.task("active", "alice"))["state"] == "running"
    with pytest.raises(ValueError, match="running"):
        await service.prepare_tasks(
            run_id="active", owner_id="alice", agent_id="agent", dataset=dataset
        )
    await service.execute_tasks(claim)
    assert len(calls) == 1


@pytest.mark.anyio
async def test_lease_lost_during_compute_cannot_pay_for_checkpoint(fixture, monkeypatch):
    service, database, dataset, calls = fixture
    claim = await service.prepare_tasks(
        run_id="lost", owner_id="alice", agent_id="agent", dataset=dataset
    )
    row = next(iter(database["filecoin_task_runs"].rows.values()))

    def loses_lease(value):
        row["lease_token"] = "another-coordinator"
        return {"energy": -1.0}

    monkeypatch.setitem(compute_tasks.TASK_KINDS, "pharma.vqe", loses_lease)
    await service.execute_tasks(claim)
    assert service.store.uploads == 0
    assert not database["filecoin_operations"].rows


@pytest.mark.anyio
async def test_safe_rejected_checkpoint_does_not_permanently_block_resume(fixture):
    service, database, dataset, calls = fixture
    await database["filecoin_operations"].insert_one(
        {
            "_id": "safe-rejected",
            "state": "rejected",
            "owner_id": "alice",
            "agent_id": "agent",
            "scope": "tasks:alice:funded",
        }
    )
    claim = await service.prepare_tasks(
        run_id="funded", owner_id="alice", agent_id="agent", dataset=dataset
    )
    await service.execute_tasks(claim)
    assert (await service.task("funded", "alice"))["state"] == "completed"
    assert len(calls) == 1


@pytest.mark.anyio
async def test_expired_generation_cannot_run_after_new_claim(fixture):
    service, database, dataset, calls = fixture
    old_claim = await service.prepare_tasks(
        run_id="expired", owner_id="alice", agent_id="agent", dataset=dataset
    )
    row = next(iter(database["filecoin_task_runs"].rows.values()))
    row["lease_until"] = datetime.now(timezone.utc) - timedelta(seconds=1)
    new_claim = await service.prepare_tasks(
        run_id="expired", owner_id="alice", agent_id="agent", dataset=dataset
    )
    await service.execute_tasks(old_claim)
    assert calls == []
    await service.execute_tasks(new_claim)
    assert len(calls) == 1


@pytest.mark.anyio
async def test_unknown_checkpoint_operation_blocks_resume_before_compute(fixture):
    service, database, dataset, calls = fixture
    await database["filecoin_operations"].insert_one(
        {
            "_id": "unknown",
            "state": "started",
            "owner_id": "alice",
            "agent_id": "agent",
            "scope": "tasks:alice:uncertain",
        }
    )
    claim = await service.prepare_tasks(
        run_id="uncertain", owner_id="alice", agent_id="agent", dataset=dataset
    )
    await service.execute_tasks(claim)
    row = await service.task("uncertain", "alice")
    assert row["state"] == "failed"
    assert calls == []
    assert service.store.uploads == 0


@pytest.mark.anyio
async def test_persistence_error_retains_last_confirmed_receipt(fixture):
    service, database, dataset, calls = fixture
    saved = service.store.keep(b"saved checkpoint receipt")

    class FailedDispatcher:
        async def run(self, *args, **kwargs):
            raise CheckpointPersistenceError(saved)

    service.dispatcher = FailedDispatcher()
    claim = await service.prepare_tasks(
        run_id="callback", owner_id="alice", agent_id="agent", dataset=dataset
    )
    await service.execute_tasks(claim)
    row = await service.task("callback", "alice")
    assert row["state"] == "failed"
    assert row["checkpoint"] == saved.model_dump(mode="json")
    assert row["error"] == "CheckpointPersistenceError"


@pytest.mark.anyio
async def test_lease_loss_cancels_work_and_does_not_overwrite_new_coordinator(fixture, monkeypatch):
    service, database, dataset, calls = fixture
    ready = asyncio.Event()
    original_sleep = asyncio.sleep

    async def fast_heartbeat(_seconds):
        await ready.wait()
        await original_sleep(0.01)

    monkeypatch.setattr(filecoin_service.asyncio, "sleep", fast_heartbeat)

    class ReplacedDispatcher:
        async def run(self, *args, **kwargs):
            row = next(iter(database["filecoin_task_runs"].rows.values()))
            row["lease_token"] = "another-coordinator"
            ready.set()
            await asyncio.Event().wait()

    service.dispatcher = ReplacedDispatcher()
    claim = await service.prepare_tasks(
        run_id="lease", owner_id="alice", agent_id="agent", dataset=dataset
    )
    with pytest.raises(asyncio.CancelledError):
        await service.execute_tasks(claim)
    row = next(iter(database["filecoin_task_runs"].rows.values()))
    assert row["state"] == "running"
    assert row["lease_token"] == "another-coordinator"
    assert calls == []


@pytest.mark.anyio
async def test_another_owners_checkpoint_is_never_restored(fixture):
    service, database, dataset, calls = fixture
    await database["filecoin_operations"].insert_one(
        {
            "_id": "foreign",
            "state": "confirmed",
            "owner_id": "bob",
            "agent_id": "agent",
            "scope": "tasks:alice:scoped",
            "result": {"invalid": True},
        }
    )
    claim = await service.prepare_tasks(
        run_id="scoped", owner_id="alice", agent_id="agent", dataset=dataset
    )
    await service.execute_tasks(claim)
    assert (await service.task("scoped", "alice"))["state"] == "completed"
    assert len(calls) == 1
