"""In-memory stand-in for PharmaJobService, so router tests need no MongoDB."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any


class FakePharmaJobService:
    def __init__(self) -> None:
        self.jobs: dict[str, SimpleNamespace] = {}

    async def submit(self, *, owner_user_id: str, mode: str, target_pdb_id: str) -> SimpleNamespace:
        job = SimpleNamespace(
            id=f"pharma_{uuid.uuid4().hex[:12]}",
            owner_user_id=owner_user_id,
            status="queued",
            state="idle",
            mode=mode,
            target_pdb_id=target_pdb_id,
            error=None,
            result_payload=None,
            log_lines=[],
            created_at=datetime.now(timezone.utc),
            completed_at=None,
        )
        self.jobs[job.id] = job
        return job

    async def get_job(self, job_id: str, *, current_user: Any) -> SimpleNamespace | None:
        job = self.jobs.get(job_id)
        if job is None:
            return None
        if not current_user.is_admin() and job.owner_user_id != current_user.user_id:
            return None
        return job

    async def get_job_for_owner(self, job_id: str, *, owner_user_id: str) -> SimpleNamespace | None:
        job = self.jobs.get(job_id)
        return job if job is not None and job.owner_user_id == owner_user_id else None

    async def list_jobs(self, *, current_user: Any, limit: int = 20) -> list[SimpleNamespace]:
        return [
            job for job in self.jobs.values()
            if current_user.is_admin() or job.owner_user_id == current_user.user_id
        ][:limit]

    async def cancel(self, job_id: str, *, current_user: Any) -> SimpleNamespace | None:
        job = await self.get_job(job_id, current_user=current_user)
        if job is not None and job.status in ("queued", "running"):
            job.status, job.state = "cancelled", "failed"
        return job
