"""Durable pharma job state, so paid work outlives the process that started it."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from quantum_backend_v2.identity.models import UserTokenClaims
from quantum_backend_v2.persistence.mongodb import PharmaJobDocument

_ACTIVE = ("queued", "running")
_MAX_LOG_LINES = 2000
INTERRUPTED_ERROR = "interrupted by a backend restart"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class PharmaJobService:
    """Owner-scoped storage for pharma jobs; the pipeline itself runs elsewhere."""

    async def submit(
        self,
        *,
        owner_user_id: str,
        mode: str,
        target_pdb_id: str,
    ) -> PharmaJobDocument:
        doc = PharmaJobDocument(
            id=f"pharma_{uuid.uuid4().hex}",
            owner_user_id=owner_user_id,
            status="queued",
            mode=mode,
            target_pdb_id=target_pdb_id,
        )
        await doc.insert()
        return doc

    async def get_job(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> PharmaJobDocument | None:
        doc = await PharmaJobDocument.get(job_id)
        if doc is None:
            return None
        if not current_user.is_admin() and doc.owner_user_id != current_user.user_id:
            return None
        return doc

    async def get_job_for_owner(
        self,
        job_id: str,
        *,
        owner_user_id: str,
    ) -> PharmaJobDocument | None:
        doc = await PharmaJobDocument.get(job_id)
        if doc is None or doc.owner_user_id != owner_user_id:
            return None
        return doc

    async def list_jobs(
        self,
        *,
        current_user: UserTokenClaims,
        limit: int = 20,
    ) -> list[PharmaJobDocument]:
        query = PharmaJobDocument.find()
        if not current_user.is_admin():
            query = query.find(PharmaJobDocument.owner_user_id == current_user.user_id)
        return await query.sort("-created_at").limit(limit).to_list()

    async def mark_running(self, job_id: str) -> bool:
        """Move a queued job to running; False when it is gone or already cancelled."""
        doc = await PharmaJobDocument.get(job_id)
        if doc is None or doc.status != "queued":
            return False
        doc.status = "running"
        doc.updated_at = _utc_now()
        await doc.save()
        return True

    async def complete(
        self,
        job_id: str,
        *,
        state: str,
        result: dict[str, Any],
        log_lines: list[dict[str, Any]],
    ) -> None:
        await self._finish(
            job_id,
            status="completed",
            state=state,
            result_payload=result,
            log_lines=log_lines,
        )

    async def fail(self, job_id: str, *, error: str, log_lines: list[dict[str, Any]]) -> None:
        await self._finish(
            job_id, status="failed", state="failed", error=error, log_lines=log_lines
        )

    async def cancel(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> PharmaJobDocument | None:
        """Cancel a queued or running job; None when the caller cannot see it."""
        doc = await self.get_job(job_id, current_user=current_user)
        if doc is None:
            return None
        await self._finish(job_id, status="cancelled", state="failed")
        return await PharmaJobDocument.get(job_id)

    async def recover_interrupted(self) -> int:
        """Fail jobs left queued or running by a previous process; return how many."""
        stale = await PharmaJobDocument.find({"status": {"$in": list(_ACTIVE)}}).to_list()
        for doc in stale:
            await self._finish(doc.id, status="failed", state="failed", error=INTERRUPTED_ERROR)
        return len(stale)

    async def _finish(
        self,
        job_id: str,
        *,
        status: str,
        state: str,
        error: str | None = None,
        result_payload: dict[str, Any] | None = None,
        log_lines: list[dict[str, Any]] | None = None,
    ) -> None:
        """Write a terminal status, unless the job already reached one (e.g. cancelled)."""
        doc = await PharmaJobDocument.get(job_id)
        if doc is None or doc.status not in _ACTIVE:
            return
        now = _utc_now()
        doc.status = status
        doc.state = state
        doc.error = error
        doc.result_payload = result_payload
        if log_lines is not None:
            doc.log_lines = log_lines[-_MAX_LOG_LINES:]
        doc.completed_at = now
        doc.updated_at = now
        await doc.save()
