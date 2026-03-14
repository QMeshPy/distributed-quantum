"""Reservation protocol contracts and state definitions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from quantum_coordinator.domain.models import GateType


class ReservationState(str, Enum):
    """Reservation lifecycle states."""

    REQUESTED = "REQUESTED"
    PREPARED = "PREPARED"
    COMMITTED = "COMMITTED"
    EXECUTED = "EXECUTED"
    EXPIRED = "EXPIRED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"


@dataclass(frozen=True)
class ReservationRequest:
    """Request for reserving a fragment execution window."""

    reservation_id: str
    job_id: str
    fragment_id: str
    node_id: str
    service_type: GateType
    min_fidelity: float
    window_start: datetime
    window_end: datetime
    created_at: datetime


@dataclass(frozen=True)
class ReservationResponse:
    """Reservation protocol response payload."""

    request_id: str
    accepted: bool
    state: ReservationState
    reservation_id: str | None
    reason: str | None
    suggested_window_start: datetime | None


@dataclass(frozen=True)
class ReservationRecord:
    """Persistable reservation record with mutable state fields."""

    reservation_id: str
    job_id: str
    fragment_id: str
    node_id: str
    service_type: GateType
    min_fidelity: float
    window_start: datetime
    window_end: datetime
    state: ReservationState
    reason: str | None
    updated_at: datetime
