"""Pharma docking API router."""
from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.deps.x402_gateway import X402_OWNER_USER_ID, build_x402_gateway_guard
from quantum_backend_v2.application.peer_tasks import PeerTaskDispatcher
from quantum_backend_v2.application.pharma_jobs import PharmaJobService
from quantum_backend_v2.persistence.mongodb import PharmaJobDocument
from quantum_backend_v2.pharma.config import PharmaMode, PharmaWorkflowConfig
from quantum_backend_v2.pharma.live_state import (
    LiveJobState,
    ScorePoint,
    clear_live,
    get_live,
    init_live,
    update_live,
)

# Paid x402 callers are anonymous, so bound the work one payment can request.
_X402_MAX_ITERATIONS = 5
_X402_MAX_CANDIDATES = 100

# Log lines of jobs this process is running; they reach MongoDB when the job ends.
_RUNNING_LOGS: dict[str, list[dict[str, Any]]] = {}


class PharmaSubmitRequest(BaseModel):
    mode: PharmaMode
    target_pdb_id: str = Field(min_length=3, max_length=10)
    initial_ligand_smiles: str | None = Field(default=None, max_length=500)
    max_iterations: int = Field(default=5, ge=1, le=20)
    candidate_count: int = Field(default=100, ge=10, le=500)


class PharmaSubmitResponse(BaseModel):
    job_id: str
    status: str
    submitted_at: str


class PharmaJobStatus(BaseModel):
    job_id: str
    status: str
    state: str
    mode: str
    target_pdb_id: str
    submitted_at: str
    completed_at: str | None = None
    result: dict[str, Any] | None = None
    error: str | None = None
    log_lines: list[dict[str, Any]] = []


def _job_status(doc: PharmaJobDocument) -> PharmaJobStatus:
    return PharmaJobStatus(
        job_id=doc.id,
        status=doc.status,
        state=doc.state,
        mode=doc.mode,
        target_pdb_id=doc.target_pdb_id,
        submitted_at=doc.created_at.isoformat(),
        completed_at=doc.completed_at.isoformat() if doc.completed_at else None,
        result=doc.result_payload,
        error=doc.error,
        log_lines=_RUNNING_LOGS.get(doc.id, doc.log_lines),
    )


def _make_log_callback(log_lines: list[dict[str, Any]]) -> Callable[[str, str, str | None], None]:
    """Return a function that appends a structured log entry to a job's log."""
    def _push(level: str, message: str, stage: str | None = None) -> None:
        log_lines.append({
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "stage": stage,
            "message": message,
        })
    return _push


def _make_live_callback(job_id: str, start_time: float) -> Callable[..., None]:
    """Return a function that updates the in-memory live canvas state."""
    def _update(
        stage: str | None = None,
        smiles: str | None = None,
        score: float | None = None,
        admet_pass: bool = False,
        iteration: int | None = None,
        peer_tasks: list[dict[str, Any]] | None = None,
    ) -> None:
        live = get_live(job_id)
        if live is None:
            return
        kwargs: dict[str, Any] = {"elapsed_seconds": time.monotonic() - start_time}
        if stage is not None:
            kwargs["current_stage"] = stage
        if iteration is not None:
            kwargs["iteration_count"] = iteration
        if peer_tasks is not None:
            kwargs["peer_tasks"] = peer_tasks
        if smiles is not None:
            kwargs["best_smiles"] = smiles
        if score is not None and (live.best_score is None or score < live.best_score):
            kwargs["best_score"] = score
            kwargs["score_history"] = [
                p.model_dump() for p in live.score_history
            ] + [
                ScorePoint(
                    iteration=live.iteration_count,
                    score=score,
                    ts=datetime.now(timezone.utc).isoformat(),
                ).model_dump()
            ]
        if admet_pass:
            kwargs["admet_passes"] = live.admet_passes + 1
        update_live(job_id, **kwargs)
    return _update


def _run_pipeline(
    job_id: str,
    config: PharmaWorkflowConfig,
    log_lines: list[dict[str, Any]],
    task_dispatcher: PeerTaskDispatcher | None,
) -> tuple[str, dict[str, Any]]:
    """Run the pipeline on its own event loop; meant to be called from a worker thread.

    It touches no database state, because the MongoDB client belongs to the
    main event loop. The caller persists the outcome.
    """
    # Not asyncio.run(): it waits for the loop's thread pool, which still holds requests to peers that
    # were abandoned (a straggler or a frozen laptop) and would keep a finished job "running".
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            _run_pipeline_async(job_id, config, log_lines, task_dispatcher)
        )
    finally:
        loop.close()


async def _run_pipeline_async(
    job_id: str,
    config: PharmaWorkflowConfig,
    log_lines: list[dict[str, Any]],
    task_dispatcher: PeerTaskDispatcher | None,
) -> tuple[str, dict[str, Any]]:
    from quantum_backend_v2.pharma.cache import FragmentCache
    from quantum_backend_v2.pharma.orchestrator import PharmaOrchestrator

    start_time = time.monotonic()
    init_live(job_id)
    log = _make_log_callback(log_lines)
    live = _make_live_callback(job_id, start_time)

    log(
        "info",
        f"Pipeline started — mode={config.mode.value} target={config.target_pdb_id}",
        "init",
    )
    orch = PharmaOrchestrator(
        config=config,
        cache=FragmentCache(None),
        execution_service=None,
        log_callback=log,
        live_callback=live,
        task_dispatcher=task_dispatcher,
    )
    try:
        result = await orch.run(job_id=job_id)
        log(
            "success",
            f"Pipeline completed — {len(result.candidates)} candidate(s) produced",
            "completed",
        )
        return orch.state.value, result.model_dump(mode="json")
    except Exception as exc:
        log("error", f"Pipeline failed: {exc}", "failed")
        raise
    finally:
        clear_live(job_id)


async def _run_pharma_job(
    pharma_job_service: PharmaJobService,
    job_id: str,
    config: PharmaWorkflowConfig,
    task_dispatcher: PeerTaskDispatcher | None,
) -> None:
    """Run one job off the event loop, then record how it ended."""
    if not await pharma_job_service.mark_running(job_id):
        return
    log_lines = _RUNNING_LOGS.setdefault(job_id, [])
    try:
        state, result = await asyncio.to_thread(
            _run_pipeline, job_id, config, log_lines, task_dispatcher
        )
        await pharma_job_service.complete(
            job_id, state=state, result=result, log_lines=log_lines
        )
    except Exception as exc:
        await pharma_job_service.fail(job_id, error=str(exc), log_lines=log_lines)
    finally:
        _RUNNING_LOGS.pop(job_id, None)


def build_pharma_router(
    *,
    pharma_job_service: PharmaJobService,
    x402_gateway_secret: str | None = None,
    task_dispatcher: PeerTaskDispatcher | None = None,
) -> APIRouter:
    """Build the pharma docking router."""
    router = APIRouter(prefix="/api/v1/pharma", tags=["pharma"])

    async def queue_job(
        request: PharmaSubmitRequest,
        background_tasks: BackgroundTasks,
        owner_user_id: str,
    ) -> PharmaSubmitResponse:
        config = PharmaWorkflowConfig(
            mode=request.mode,
            target_pdb_id=request.target_pdb_id,
            initial_ligand_smiles=request.initial_ligand_smiles,
            max_iterations=request.max_iterations,
            candidate_count=request.candidate_count,
        )
        record = await pharma_job_service.submit(
            owner_user_id=owner_user_id,
            mode=request.mode.value,
            target_pdb_id=request.target_pdb_id,
        )
        background_tasks.add_task(
            _run_pharma_job, pharma_job_service, record.id, config, task_dispatcher
        )
        return PharmaSubmitResponse(
            job_id=record.id, status=record.status, submitted_at=record.created_at.isoformat()
        )

    @router.post("/submit", response_model=PharmaSubmitResponse, status_code=202)
    async def submit_pharma_job(
        request: PharmaSubmitRequest,
        background_tasks: BackgroundTasks,
        current_user: CurrentUser,
    ) -> PharmaSubmitResponse:
        return await queue_job(request, background_tasks, current_user.user_id)

    @router.get("/jobs", response_model=list[PharmaJobStatus])
    async def list_pharma_jobs(current_user: CurrentUser) -> list[PharmaJobStatus]:
        records = await pharma_job_service.list_jobs(current_user=current_user, limit=100)
        return [_job_status(record) for record in records]

    @router.get("/jobs/{job_id}/live", response_model=LiveJobState)
    async def get_pharma_job_live(job_id: str, current_user: CurrentUser) -> LiveJobState:
        if await pharma_job_service.get_job(job_id, current_user=current_user) is None:
            raise HTTPException(status_code=404, detail=f"No live state for job {job_id!r}")
        state = get_live(job_id)
        if state is None:
            raise HTTPException(status_code=404, detail=f"No live state for job {job_id!r}")
        return state

    @router.get("/jobs/{job_id}", response_model=PharmaJobStatus)
    async def get_pharma_job(job_id: str, current_user: CurrentUser) -> PharmaJobStatus:
        record = await pharma_job_service.get_job(job_id, current_user=current_user)
        if record is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
        return _job_status(record)

    @router.delete("/jobs/{job_id}", status_code=204)
    async def cancel_pharma_job(job_id: str, current_user: CurrentUser) -> None:
        if await pharma_job_service.cancel(job_id, current_user=current_user) is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")

    if x402_gateway_secret is not None:
        require_x402_gateway = build_x402_gateway_guard(x402_gateway_secret)

        @router.post(
            "/internal/x402/submit",
            response_model=PharmaSubmitResponse,
            status_code=202,
            include_in_schema=False,
        )
        async def submit_x402_pharma_job(
            request: PharmaSubmitRequest,
            background_tasks: BackgroundTasks,
            _: None = Depends(require_x402_gateway),
        ) -> PharmaSubmitResponse:
            if (
                request.max_iterations > _X402_MAX_ITERATIONS
                or request.candidate_count > _X402_MAX_CANDIDATES
            ):
                raise HTTPException(status_code=422, detail="job is too large for x402")
            return await queue_job(request, background_tasks, X402_OWNER_USER_ID)

        @router.get(
            "/internal/x402/jobs/{job_id}",
            response_model=PharmaJobStatus,
            include_in_schema=False,
        )
        async def get_x402_pharma_job(
            job_id: str,
            _: None = Depends(require_x402_gateway),
        ) -> PharmaJobStatus:
            record = await pharma_job_service.get_job_for_owner(
                job_id, owner_user_id=X402_OWNER_USER_ID
            )
            if record is None:
                raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
            return _job_status(record)

    return router
