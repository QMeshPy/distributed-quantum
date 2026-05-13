"""Pharma docking API router."""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from quantum_backend_v2.pharma.config import PharmaMode, PharmaWorkflowConfig
from quantum_backend_v2.pharma.live_state import (
    LiveJobState,
    ScorePoint,
    clear_live,
    get_live,
    init_live,
    update_live,
)

router = APIRouter(prefix="/api/v1/pharma", tags=["pharma"])

# In-memory job store — replaced by PostgreSQL in production
_JOB_STORE: dict[str, dict] = {}


class PharmaSubmitRequest(BaseModel):
    mode: PharmaMode
    target_pdb_id: str = Field(min_length=3, max_length=10)
    initial_ligand_smiles: str | None = None
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
    result: dict | None = None
    error: str | None = None
    log_lines: list[dict] = []


@router.post("/submit", response_model=PharmaSubmitResponse, status_code=202)
async def submit_pharma_job(
    request: PharmaSubmitRequest,
    background_tasks: BackgroundTasks,
) -> PharmaSubmitResponse:
    job_id = f"pharma_{uuid.uuid4().hex[:12]}"
    submitted_at = datetime.now(timezone.utc).isoformat()

    config = PharmaWorkflowConfig(
        mode=request.mode,
        target_pdb_id=request.target_pdb_id,
        initial_ligand_smiles=request.initial_ligand_smiles,
        max_iterations=request.max_iterations,
        candidate_count=request.candidate_count,
    )

    _JOB_STORE[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "state": "idle",
        "mode": request.mode.value,
        "target_pdb_id": request.target_pdb_id,
        "submitted_at": submitted_at,
        "completed_at": None,
        "result": None,
        "error": None,
        "log_lines": [],
    }

    background_tasks.add_task(_run_pharma_pipeline, job_id, config)
    return PharmaSubmitResponse(job_id=job_id, status="queued", submitted_at=submitted_at)


def _make_log_callback(job_id: str) -> Callable[[str, str, str | None], None]:
    """Return a function that appends a structured log entry to the job store."""
    def _push(level: str, message: str, stage: str | None = None) -> None:
        entry: dict = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "stage": stage,
            "message": message,
        }
        _JOB_STORE[job_id]["log_lines"].append(entry)
    return _push


def _make_live_callback(job_id: str, start_time: float) -> Callable[..., None]:
    """Return a function that updates the in-memory live canvas state."""
    def _update(
        stage: str | None = None,
        smiles: str | None = None,
        score: float | None = None,
        admet_pass: bool = False,
        iteration: int | None = None,
    ) -> None:
        live = get_live(job_id)
        if live is None:
            return
        kwargs: dict[str, Any] = {"elapsed_seconds": time.monotonic() - start_time}
        if stage is not None:
            kwargs["current_stage"] = stage
        if iteration is not None:
            kwargs["iteration_count"] = iteration
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


def _run_pharma_pipeline(job_id: str, config: PharmaWorkflowConfig) -> None:
    """Sync entry point — Starlette runs sync background tasks in a thread pool,
    keeping the ASGI event loop free to process new requests immediately."""
    import asyncio as _asyncio
    _asyncio.run(_run_pharma_pipeline_async(job_id, config))


async def _run_pharma_pipeline_async(job_id: str, config: PharmaWorkflowConfig) -> None:
    from quantum_backend_v2.pharma.cache import FragmentCache
    from quantum_backend_v2.pharma.orchestrator import PharmaOrchestrator

    _JOB_STORE[job_id]["status"] = "running"
    start_time = time.monotonic()
    init_live(job_id)

    log = _make_log_callback(job_id)
    live = _make_live_callback(job_id, start_time)

    log("info", f"Pipeline started — mode={config.mode.value} target={config.target_pdb_id}", "init")
    orch = PharmaOrchestrator(
        config=config,
        cache=FragmentCache(None),
        execution_service=None,
        log_callback=log,
        live_callback=live,
    )
    try:
        result = await orch.run(job_id=job_id)
        log("success", f"Pipeline completed — {len(result.candidates)} candidate(s) produced", "completed")
        _JOB_STORE[job_id].update(
            status="completed",
            state=orch.state.value,
            result=result.model_dump(mode="json"),
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:
        log("error", f"Pipeline failed: {exc}", "failed")
        _JOB_STORE[job_id].update(
            status="failed",
            state="failed",
            error=str(exc),
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
    finally:
        clear_live(job_id)


@router.get("/jobs", response_model=list[PharmaJobStatus])
async def list_pharma_jobs() -> list[PharmaJobStatus]:
    return [PharmaJobStatus(**job) for job in _JOB_STORE.values()]


@router.get("/jobs/{job_id}/live", response_model=LiveJobState)
async def get_pharma_job_live(job_id: str) -> LiveJobState:
    state = get_live(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail=f"No live state for job {job_id!r}")
    return state


@router.get("/jobs/{job_id}", response_model=PharmaJobStatus)
async def get_pharma_job(job_id: str) -> PharmaJobStatus:
    job = _JOB_STORE.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    return PharmaJobStatus(**job)


@router.delete("/jobs/{job_id}", status_code=204)
async def cancel_pharma_job(job_id: str) -> None:
    if job_id not in _JOB_STORE:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    if _JOB_STORE[job_id]["status"] in ("queued", "running"):
        _JOB_STORE[job_id]["status"] = "cancelled"
        _JOB_STORE[job_id]["state"] = "failed"
