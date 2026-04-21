"""Reservation protocol wire schemas for prepare / commit / cancel / expire."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ReservationTransition(str, Enum):
    """Allowed reservation state transitions."""

    REQUESTED = "requested"
    ACCEPTED = "accepted"
    COMMITTED = "committed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    REJECTED = "rejected"


class ReservationPrepareRequest(BaseModel):
    """Wire message from coordinator to peer: reserve capacity for a fragment."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    requesting_peer_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    estimated_qubits: int = Field(ge=1)
    estimated_depth: int = Field(ge=1)
    priority: int = Field(default=0, ge=0, le=100)
    ttl_seconds: int = Field(default=60, ge=5)
    idempotency_key: str = Field(min_length=8)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationPrepareResponse(BaseModel):
    """Wire reply from a peer to a prepare request."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reservation_id: str = Field(min_length=8)
    accepting_peer_id: str = Field(min_length=3)
    transition: ReservationTransition
    reason: str | None = Field(default=None, max_length=300)
    replied_at: datetime = Field(default_factory=_utc_now)


class ReservationCommitRequest(BaseModel):
    """Coordinator commits a previously accepted reservation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reservation_id: str = Field(min_length=8)
    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationCommitResponse(BaseModel):
    """Peer confirms or rejects a commit request."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reservation_id: str = Field(min_length=8)
    transition: ReservationTransition
    replied_at: datetime = Field(default_factory=_utc_now)


class ReservationCancelRequest(BaseModel):
    """Coordinator or peer cancels a reservation."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reservation_id: str = Field(min_length=8)
    reason: str | None = Field(default=None, max_length=300)
    sent_at: datetime = Field(default_factory=_utc_now)


class ReservationCancelResponse(BaseModel):
    """Peer acknowledges a cancellation request."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reservation_id: str = Field(min_length=8)
    transition: ReservationTransition
    replied_at: datetime = Field(default_factory=_utc_now)


class ReservationExpiredNotice(BaseModel):
    """Peer notifies that a reservation TTL has elapsed."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reservation_id: str = Field(min_length=8)
    expired_at: datetime = Field(default_factory=_utc_now)
