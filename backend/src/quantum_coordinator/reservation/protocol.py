"""Reservation protocol implementation with conflict handling."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from quantum_coordinator.infra.persistence.runtime_store import RuntimeEventStore
from quantum_coordinator.reservation.models import (
    ReservationRecord,
    ReservationRequest,
    ReservationResponse,
    ReservationState,
)
from quantum_coordinator.reservation.state_machine import ensure_transition
from quantum_coordinator.service_discovery.registry import ServiceRegistry


class ReservationProtocol:
    """Reserves gate execution windows across service nodes."""

    def __init__(
        self,
        registry: ServiceRegistry,
        default_window: timedelta,
        store: RuntimeEventStore | None = None,
    ) -> None:
        self._registry = registry
        self._default_window = default_window
        self._store = store
        self._records: dict[str, ReservationRecord] = {}

    def make_request(
        self,
        job_id: str,
        fragment_id: str,
        node_id: str,
        service_type: str,
        min_fidelity: float,
        now: datetime | None = None,
    ) -> ReservationRequest:
        """Create a reservation request with generated IDs and time window."""
        current = now or datetime.now(timezone.utc)
        reservation_id = f"rsv-{uuid4()}"
        window_end = current + self._default_window

        from quantum_coordinator.domain.models import GateType

        return ReservationRequest(
            reservation_id=reservation_id,
            job_id=job_id,
            fragment_id=fragment_id,
            node_id=node_id,
            service_type=GateType(service_type),
            min_fidelity=min_fidelity,
            window_start=current,
            window_end=window_end,
            created_at=current,
        )

    def reserve(self, request: ReservationRequest) -> ReservationResponse:
        """Process a reservation request and return response."""
        record = ReservationRecord(
            reservation_id=request.reservation_id,
            job_id=request.job_id,
            fragment_id=request.fragment_id,
            node_id=request.node_id,
            service_type=request.service_type,
            min_fidelity=request.min_fidelity,
            window_start=request.window_start,
            window_end=request.window_end,
            state=ReservationState.REQUESTED,
            reason=None,
            updated_at=request.created_at,
        )
        self._records[record.reservation_id] = record
        self._persist(record)

        if not self._is_node_eligible(request):
            rejected = self._transition(
                record.reservation_id,
                ReservationState.REJECTED,
                "unavailable_or_low_fidelity",
            )
            return ReservationResponse(
                request_id=request.reservation_id,
                accepted=False,
                state=rejected.state,
                reservation_id=None,
                reason=rejected.reason,
                suggested_window_start=None,
            )

        conflict_start = self._find_conflict_start(request)
        if conflict_start is not None:
            rejected = self._transition(
                record.reservation_id,
                ReservationState.REJECTED,
                "reservation_conflict",
            )
            return ReservationResponse(
                request_id=request.reservation_id,
                accepted=False,
                state=rejected.state,
                reservation_id=None,
                reason=rejected.reason,
                suggested_window_start=conflict_start,
            )

        prepared = self._transition(record.reservation_id, ReservationState.PREPARED, None)
        committed = self._transition(prepared.reservation_id, ReservationState.COMMITTED, None)

        return ReservationResponse(
            request_id=request.reservation_id,
            accepted=True,
            state=committed.state,
            reservation_id=committed.reservation_id,
            reason=None,
            suggested_window_start=None,
        )

    def mark_executed(self, reservation_id: str) -> None:
        """Transition reservation to EXECUTED."""
        self._transition(reservation_id, ReservationState.EXECUTED, None)

    def cancel(self, reservation_id: str, reason: str) -> None:
        """Transition reservation to CANCELED."""
        self._transition(reservation_id, ReservationState.CANCELED, reason)

    def prune_expired(self, now: datetime | None = None) -> list[str]:
        """Expire committed reservations with elapsed windows."""
        current = now or datetime.now(timezone.utc)
        expired_ids: list[str] = []

        for reservation_id, record in list(self._records.items()):
            if record.state != ReservationState.COMMITTED:
                continue
            if record.window_end > current:
                continue

            self._transition(reservation_id, ReservationState.EXPIRED, "window_expired")
            expired_ids.append(reservation_id)

        return expired_ids

    def get(self, reservation_id: str) -> ReservationRecord | None:
        """Get reservation record by id."""
        return self._records.get(reservation_id)

    def _transition(
        self,
        reservation_id: str,
        target: ReservationState,
        reason: str | None,
    ) -> ReservationRecord:
        current = self._records[reservation_id]
        ensure_transition(current.state, target)

        updated = ReservationRecord(
            reservation_id=current.reservation_id,
            job_id=current.job_id,
            fragment_id=current.fragment_id,
            node_id=current.node_id,
            service_type=current.service_type,
            min_fidelity=current.min_fidelity,
            window_start=current.window_start,
            window_end=current.window_end,
            state=target,
            reason=reason,
            updated_at=datetime.now(timezone.utc),
        )
        self._records[reservation_id] = updated
        self._persist(updated)
        return updated

    def _persist(self, record: ReservationRecord) -> None:
        if self._store is not None:
            self._store.upsert_reservation(record)

    def _is_node_eligible(self, request: ReservationRequest) -> bool:
        candidates = self._registry.query(
            service_type=request.service_type,
            min_fidelity=request.min_fidelity,
            available_only=True,
        )
        return any(ad.node_id == request.node_id for ad in candidates)

    def _find_conflict_start(self, request: ReservationRequest) -> datetime | None:
        overlaps: list[ReservationRecord] = []
        for record in self._records.values():
            if record.node_id != request.node_id:
                continue
            if record.service_type != request.service_type:
                continue
            if record.state != ReservationState.COMMITTED:
                continue
            if _overlaps(
                request.window_start,
                request.window_end,
                record.window_start,
                record.window_end,
            ):
                overlaps.append(record)

        if not overlaps:
            return None
        return max(record.window_end for record in overlaps)


def _overlaps(
    start_a: datetime,
    end_a: datetime,
    start_b: datetime,
    end_b: datetime,
) -> bool:
    return start_a < end_b and start_b < end_a
