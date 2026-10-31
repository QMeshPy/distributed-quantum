"""Restart reconciliation must not fail another coordinator's durable jobs."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from quantum_backend_v2.runtime import recovery


class Query:
    def __init__(self, records):
        self.records = records

    async def to_list(self):
        return self.records


def matches(record, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(record, branch) for branch in expected):
                return False
            continue
        actual = record
        for field in key.split("."):
            actual = actual.get(field) if isinstance(actual, dict) else getattr(actual, field, None)
        if isinstance(expected, dict):
            if actual not in expected["$in"]:
                return False
        elif actual != expected:
            return False
    return True


@pytest.mark.anyio
@pytest.mark.parametrize("release_error", [None, recovery.HoldNotFoundError("unmetered"), RuntimeError("retry release")])
async def test_recovery_is_owned_terminal_preserving_and_retryable(monkeypatch, release_error):
    all_docs = {}
    for model, statuses in [
        (recovery.WorkflowRunDocument, ("QUEUED", "COMPILING", "EXECUTING")),
        (recovery.FinancialJobDocument, ("ingesting", "analyzing")),
        (recovery.OptionsJobDocument, ("queued", "running")),
        (recovery.RiskJobDocument, ("queued", "running")),
    ]:
        docs = [SimpleNamespace(
            id=f"{model.__name__}-{i}", coordinator_peer_id=owner, status=status,
            workflow_definition_id="circuit-execution", output_snapshot={"fragment_results": [1]},
            fragment_count=3, completed_fragments=1, save=AsyncMock(),
        ) for i, (owner, status) in enumerate([
            *(("local-peer", status) for status in statuses),
            ("other-peer", statuses[0]), (None, statuses[0]),
            ("local-peer", "COMPLETED" if model is recovery.WorkflowRunDocument else "completed"),
        ])]
        all_docs[model] = docs
        monkeypatch.setattr(model, "find", lambda query, docs=docs: Query(
            [doc for doc in docs if matches(doc, query)]
        ))

    own_workflow = all_docs[recovery.WorkflowRunDocument][0].id
    service = recovery.RuntimeRecoveryService()
    service.recover_in_flight_executions = AsyncMock(return_value=[
        SimpleNamespace(execution_id="exec-own", workflow_run_id=own_workflow, retry_attempt=1),
        SimpleNamespace(execution_id="exec-other", workflow_run_id="other-workflow", retry_attempt=0),
    ])
    service.recover_open_reservations = AsyncMock(return_value=[
        SimpleNamespace(reservation_id="res-own", workflow_run_id=own_workflow),
        SimpleNamespace(reservation_id="res-other", workflow_run_id="other-workflow"),
    ])
    executions = SimpleNamespace(record_failed=AsyncMock())
    reservations = SimpleNamespace(cancel=AsyncMock())
    monkeypatch.setattr(recovery, "ExecutionService", lambda: executions)
    monkeypatch.setattr(recovery, "ReservationService", lambda: reservations)
    ledger = SimpleNamespace(release=AsyncMock(side_effect=release_error))

    await service.fail_interrupted_jobs(coordinator_peer_id="local-peer", ledger_service=ledger)

    for model, docs in all_docs.items():
        for doc in docs[:-3]:
            assert doc.status == ("FAILED" if model is recovery.WorkflowRunDocument else "failed")
            assert doc.updated_at.tzinfo is not None
            if model is recovery.WorkflowRunDocument:
                assert doc.output_snapshot["fragment_results"] == [1]
                assert "restart" in doc.output_snapshot["error"]
                assert doc.completed_at is not None
            else:
                assert "restart" in doc.error
            doc.save.assert_awaited_once()
        for untouched in docs[-3:]:
            untouched.save.assert_not_awaited()
    assert executions.record_failed.await_count == 1
    assert executions.record_failed.call_args.kwargs["execution_id"] == "exec-own"
    assert reservations.cancel.await_count == 1
    assert reservations.cancel.call_args.kwargs["reservation_id"] == "res-own"
    assert ledger.release.await_count == 3
    assert all(call.kwargs["idempotency_key"].startswith("release:job:")
               for call in ledger.release.call_args_list)

    # A second restart can finish a failed credit release without rerunning the job.
    service.recover_in_flight_executions.return_value = []
    service.recover_open_reservations.return_value = []
    await service.fail_interrupted_jobs(coordinator_peer_id="local-peer", ledger_service=ledger)
    assert ledger.release.await_count == 6
    for docs in all_docs.values():
        for doc in docs[:-3]:
            doc.save.assert_awaited_once()
