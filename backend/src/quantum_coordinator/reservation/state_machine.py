"""Reservation state transition rules."""

from quantum_coordinator.reservation.models import ReservationState

_ALLOWED_TRANSITIONS: dict[ReservationState, set[ReservationState]] = {
    ReservationState.REQUESTED: {
        ReservationState.PREPARED,
        ReservationState.REJECTED,
    },
    ReservationState.PREPARED: {
        ReservationState.COMMITTED,
        ReservationState.REJECTED,
        ReservationState.CANCELED,
    },
    ReservationState.COMMITTED: {
        ReservationState.EXECUTED,
        ReservationState.EXPIRED,
        ReservationState.CANCELED,
    },
    ReservationState.EXECUTED: set(),
    ReservationState.EXPIRED: set(),
    ReservationState.CANCELED: set(),
    ReservationState.REJECTED: set(),
}


def can_transition(current: ReservationState, target: ReservationState) -> bool:
    """Return True if target state is allowed from current state."""
    return target in _ALLOWED_TRANSITIONS[current]


def ensure_transition(current: ReservationState, target: ReservationState) -> None:
    """Validate state transition or raise ValueError."""
    if not can_transition(current, target):
        raise ValueError(f"Invalid reservation state transition: {current.value} -> {target.value}")
