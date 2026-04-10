from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence.job_store import JobRecord, SQLiteJobStore


def test_job_store_upsert_get_and_list_unfinished(tmp_path: Path) -> None:
    store = SQLiteJobStore(str(tmp_path / "jobs.db"))
    now = datetime.now(timezone.utc)

    queued = JobRecord(
        job_id="job-1",
        status=JobStatus.QUEUED,
        circuit_text="OPENQASM 2.0;",
        plan_id=None,
        error=None,
        result_json=None,
        created_at=now,
        updated_at=now,
    )
    store.upsert(queued)

    older = JobRecord(
        job_id="job-0",
        status=JobStatus.FAILED,
        circuit_text="OPENQASM 3;",
        plan_id="plan-0",
        error="boom",
        result_json=None,
        created_at=now.replace(microsecond=0),
        updated_at=now.replace(microsecond=0),
    )
    store.upsert(older)

    loaded = store.get("job-1")
    assert loaded is not None
    assert loaded.job_id == queued.job_id
    assert loaded.status == JobStatus.QUEUED

    unfinished = store.list_unfinished()
    assert [job.job_id for job in unfinished] == ["job-1"]

    completed = JobRecord(
        job_id="job-1",
        status=JobStatus.COMPLETED,
        circuit_text="OPENQASM 2.0;",
        plan_id="plan-1",
        error=None,
        result_json='{"ok":true}',
        created_at=loaded.created_at,
        updated_at=now,
    )
    store.upsert(completed)
    assert store.list_unfinished() == []

    recent = store.list_recent(limit=10)
    assert [job.job_id for job in recent] == ["job-1", "job-0"]

    failed_only = store.list_recent(limit=10, statuses=(JobStatus.FAILED,))
    assert [job.job_id for job in failed_only] == ["job-0"]
