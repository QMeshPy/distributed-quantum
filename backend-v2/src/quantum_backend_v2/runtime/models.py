"""Runtime domain models - execution state reconstructed from the event log."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExecutionTransition(str, Enum):
    """Ordered execution state transitions."""

    DISPATCHED = "dispatched"
    RUNNING = "running"
    CHECKPOINTED = "checkpointed"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


_TERMINAL_TRANSITIONS = frozenset(
    {
        ExecutionTransition.COMPLETED,
        ExecutionTransition.FAILED,
        ExecutionTransition.CANCELLED,
    }
)

_ALLOWED_TRANSITIONS: dict[ExecutionTransition, frozenset[ExecutionTransition]] = {
    ExecutionTransition.DISPATCHED: frozenset(
        {
            ExecutionTransition.RUNNING,
            ExecutionTransition.FAILED,
            ExecutionTransition.CANCELLED,
        }
    ),
    ExecutionTransition.RUNNING: frozenset(
        {
            ExecutionTransition.CHECKPOINTED,
            ExecutionTransition.COMPLETED,
            ExecutionTransition.FAILED,
        }
    ),
    ExecutionTransition.CHECKPOINTED: frozenset(
        {
            ExecutionTransition.RUNNING,
            ExecutionTransition.COMPLETED,
            ExecutionTransition.FAILED,
        }
    ),
    ExecutionTransition.FAILED: frozenset({ExecutionTransition.RETRYING}),
    ExecutionTransition.RETRYING: frozenset(
        {
            ExecutionTransition.DISPATCHED,
            ExecutionTransition.FAILED,
            ExecutionTransition.CANCELLED,
        }
    ),
    ExecutionTransition.COMPLETED: frozenset(),
    ExecutionTransition.CANCELLED: frozenset(),
}


class ExecutionState(BaseModel):
    """Reconstructed in-memory view of a fragment execution."""

    model_config = ConfigDict(extra="forbid")

    execution_id: str = Field(min_length=8)
    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    executing_peer_id: str = Field(min_length=3)
    current_transition: ExecutionTransition = ExecutionTransition.DISPATCHED
    retry_attempt: int = Field(default=0, ge=0)
    fidelity_score: float | None = None
    latency_ms: float | None = None
    error_detail: str | None = None
    checkpoint_ref: str | None = None
    last_event_at: datetime = Field(default_factory=_utc_now)

    @property
    def is_terminal(self) -> bool:
        return self.current_transition in _TERMINAL_TRANSITIONS

    @property
    def is_retryable(self) -> bool:
        return (
            self.current_transition == ExecutionTransition.FAILED
            and ExecutionTransition.RETRYING in _ALLOWED_TRANSITIONS[ExecutionTransition.FAILED]
        )

    def can_transition_to(self, next_transition: ExecutionTransition) -> bool:
        allowed = _ALLOWED_TRANSITIONS.get(self.current_transition, frozenset())
        return next_transition in allowed

    def apply(
        self,
        transition: ExecutionTransition,
        *,
        occurred_at: datetime | None = None,
        **kwargs: Any,
    ) -> "ExecutionState":
        if not self.can_transition_to(transition):
            raise ValueError(
                f"Invalid transition {self.current_transition!r} -> {transition!r} "
                f"for execution {self.execution_id!r}"
            )
        update: dict[str, Any] = {
            "current_transition": transition,
            "last_event_at": occurred_at or _utc_now(),
        }
        update.update(kwargs)
        return self.model_copy(update=update)


class InFlightExecution(BaseModel):
    """Minimal in-flight tracker rebuilt during recovery."""

    model_config = ConfigDict(extra="forbid")

    execution_id: str
    workflow_run_id: str
    fragment_id: str
    executing_peer_id: str
    transition: ExecutionTransition
    retry_attempt: int = 0
    last_event_at: datetime
