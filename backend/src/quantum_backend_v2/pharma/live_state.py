"""In-memory live job state for the pharma pipeline canvas."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

_LIVE_STORE: dict[str, dict[str, Any]] = {}


class ScorePoint(BaseModel):
    iteration: int
    score: float
    ts: str


class LiveJobState(BaseModel):
    job_id: str
    current_stage: str | None = None
    iteration_count: int = 0
    best_smiles: str | None = None
    best_score: float | None = None
    score_history: list[ScorePoint] = []
    admet_passes: int = 0
    elapsed_seconds: float = 0.0
    # One record per VQE task of the current iteration (see stage_4): who runs it and its state.
    peer_tasks: list[dict[str, Any]] = []
    server_time: float = 0.0  # lets the browser compute elapsed time without trusting its own clock


def init_live(job_id: str) -> None:
    _LIVE_STORE[job_id] = LiveJobState(job_id=job_id).model_dump()


def update_live(job_id: str, **kwargs: Any) -> None:
    entry = _LIVE_STORE.get(job_id)
    if entry is None:
        return
    entry.update(kwargs)


def get_live(job_id: str) -> LiveJobState | None:
    entry = _LIVE_STORE.get(job_id)
    if entry is None:
        return None
    return LiveJobState(**entry).model_copy(update={"server_time": time.time()})


def clear_live(job_id: str) -> None:
    _LIVE_STORE.pop(job_id, None)
