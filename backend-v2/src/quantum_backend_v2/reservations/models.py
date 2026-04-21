"""Reservation domain models - state, conflict detection, lifecycle."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReservationTransition(str, Enum):
    """Ordered reservation state transitions (mirrors protocol layer)."""

    REQUESTED = "requested"
    ACCEPTED = "accepted"
    COMMITTED = "committed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    REJECTED = "rejected"


_TERMINAL_TRANSITIONS = frozenset(
    {
        ReservationTransition.COMMITTED,
        ReservationTransition.CANCELLED,
        ReservationTransition.EXPIRED,
        ReservationTransition.REJECTED,
    }
)

_ALLOWED_TRANSITIONS: dict[ReservationTransition, frozenset[ReservationTransition]] = {
    ReservationTransition.REQUESTED: frozenset(
        {
            ReservationTransition.ACCEPTED,
            ReservationTransition.REJECTED,
            ReservationTransition.EXPIRED,
            ReservationTransition.CANCELLED,
        }
    ),
    ReservationTransition.ACCEPTED: frozenset(
        {
            ReservationTransition.COMMITTED,
            ReservationTransition.CANCELLED,
            ReservationTransition.EXPIRED,
        }
    ),
    ReservationTransition.COMMITTED: frozenset(),
    ReservationTransition.CANCELLED: frozenset(),
    ReservationTransition.EXPIRED: frozenset(),
    ReservationTransition.REJECTED: frozenset(),
}


class ReservationState(BaseModel):
    """Reconstructed in-memory view of a reservation from its event log."""

    model_config = ConfigDict(extra="forbid")

    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    requesting_peer_id: str = Field(min_length=3)
    accepting_peer_id: str | None = None
    current_transition: ReservationTransition = ReservationTransition.REQUESTED
    ttl_seconds: int = Field(default=60, ge=5)
    last_event_at: datetime = Field(default_factory=_utc_now)

    @property
    def is_terminal(self) -> bool:
        return self.current_transition in _TERMINAL_TRANSITIONS

    @property
    def is_active(self) -> bool:
        return self.current_transition in {
            ReservationTransition.ACCEPTED,
            ReservationTransition.COMMITTED,
        }

    def can_transition_to(self, next_transition: ReservationTransition) -> bool:
        allowed = _ALLOWED_TRANSITIONS.get(self.current_transition, frozenset())
        return next_transition in allowed

    def apply(
        self,
        transition: ReservationTransition,
        *,
        occurred_at: datetime | None = None,
        **kwargs: Any,
    ) -> "ReservationState":
        if not self.can_transition_to(transition):
            raise ValueError(
                f"Invalid transition {self.current_transition!r} -> {transition!r} "
                f"for reservation {self.reservation_id!r}"
            )
        update: dict[str, Any] = {
            "current_transition": transition,
            "last_event_at": occurred_at or _utc_now(),
        }
        update.update(kwargs)
        return self.model_copy(update=update)


class ReservationConflictState(BaseModel):
    """Peer-level conflict view rebuilt from the event log."""

    model_config = ConfigDict(extra="forbid")

    peer_id: str = Field(min_length=3)
    active_reservation_ids: frozenset[str] = Field(default_factory=frozenset)
    committed_reservation_ids: frozenset[str] = Field(default_factory=frozenset)

    @property
    def active_count(self) -> int:
        return len(self.active_reservation_ids | self.committed_reservation_ids)

    def has_capacity(self, *, max_concurrent: int) -> bool:
        return self.active_count < max_concurrent
