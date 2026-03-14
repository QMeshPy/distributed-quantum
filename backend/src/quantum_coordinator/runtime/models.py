"""Runtime execution models and result contracts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class FragmentExecutionStatus(str, Enum):
    """Fragment-level execution statuses."""

    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


@dataclass(frozen=True)
class GateExecutionResult:
    """Result returned by a gate execution adapter."""

    success: bool
    observed_fidelity: float
    error: str | None


@dataclass(frozen=True)
class FragmentExecutionResult:
    """Final per-fragment execution summary."""

    fragment_id: str
    node_id: str
    status: FragmentExecutionStatus
    attempts: int
    started_at: datetime
    finished_at: datetime
    observed_fidelity: float | None
    error: str | None


@dataclass(frozen=True)
class RuntimeExecutionResult:
    """Job-level runtime result."""

    job_id: str
    fragment_results: tuple[FragmentExecutionResult, ...]
    # Optional quantum output produced by the backend.
    # When available, this should contain measurement counts, probabilities,
    # a pre-measurement statevector, and similar artifacts that downstream
    # systems can consume.
    quantum_result: dict[str, object] | None = None


class RuntimeExecutionError(RuntimeError):
    """Raised when runtime cannot execute a fragment successfully."""
