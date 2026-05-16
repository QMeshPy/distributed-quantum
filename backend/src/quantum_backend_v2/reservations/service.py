"""ReservationService — event-log-backed reservation lifecycle manager.

No authoritative in-memory state.  Conflict detection is always derived
from the append-only ``reservation_events`` collection.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from quantum_backend_v2.persistence.mongodb import ReservationEventDocument
from quantum_backend_v2.reservations.models import (
    ReservationConflictState,
    ReservationState,
    ReservationTransition,
)

logger = logging.getLogger(__name__)


class ReservationService:
    """Manages durable reservation lifecycle over the MongoDB event log.

    All reads reconstruct state by replaying events.
    All writes are single-document inserts (never updates).
    """

    async def request(
        self,
        *,
        reservation_id: str,
        workflow_run_id: str,
        fragment_id: str,
        service_id: str,
        requesting_peer_id: str,
        ttl_seconds: int = 60,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        idem_key = idempotency_key or uuid.uuid4().hex

        existing = await _load_state_by_idempotency_key(idem_key)
        if existing is not None:
            return existing

        await _append_event(
            reservation_id=reservation_id,
            workflow_run_id=workflow_run_id,
            fragment_id=fragment_id,
            transition=ReservationTransition.REQUESTED,
            requesting_peer_id=requesting_peer_id,
            service_id=service_id,
            idempotency_key=idem_key,
            payload={"ttl_seconds": ttl_seconds},
        )
        state = await _require_state(reservation_id)
        logger.info(
            "reservation %s REQUESTED by %s for fragment %s",
            reservation_id,
            requesting_peer_id,
            fragment_id,
        )
        return state

    async def accept(
        self,
        *,
        reservation_id: str,
        accepting_peer_id: str,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        idem_key = idempotency_key or uuid.uuid4().hex
        state = await _require_state(reservation_id)
        await _append_event(
            reservation_id=reservation_id,
            workflow_run_id=state.workflow_run_id,
            fragment_id=state.fragment_id,
            transition=ReservationTransition.ACCEPTED,
            requesting_peer_id=state.requesting_peer_id,
            service_id=state.service_id,
            idempotency_key=idem_key,
            accepting_peer_id=accepting_peer_id,
        )
        updated = state.apply(
            ReservationTransition.ACCEPTED,
            accepting_peer_id=accepting_peer_id,
        )
        logger.info("reservation %s ACCEPTED by %s", reservation_id, accepting_peer_id)
        return updated

    async def commit(
        self,
        *,
        reservation_id: str,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        idem_key = idempotency_key or uuid.uuid4().hex
        state = await _require_state(reservation_id)
        await _append_event(
            reservation_id=reservation_id,
            workflow_run_id=state.workflow_run_id,
            fragment_id=state.fragment_id,
            transition=ReservationTransition.COMMITTED,
            requesting_peer_id=state.requesting_peer_id,
            service_id=state.service_id,
            idempotency_key=idem_key,
        )
        updated = state.apply(ReservationTransition.COMMITTED)
        logger.info("reservation %s COMMITTED", reservation_id)
        return updated

    async def cancel(
        self,
        *,
        reservation_id: str,
        reason: str | None = None,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        idem_key = idempotency_key or uuid.uuid4().hex
        state = await _require_state(reservation_id)
        await _append_event(
            reservation_id=reservation_id,
            workflow_run_id=state.workflow_run_id,
            fragment_id=state.fragment_id,
            transition=ReservationTransition.CANCELLED,
            requesting_peer_id=state.requesting_peer_id,
            service_id=state.service_id,
            idempotency_key=idem_key,
            reason=reason,
        )
        updated = state.apply(ReservationTransition.CANCELLED)
        logger.info("reservation %s CANCELLED reason=%s", reservation_id, reason)
        return updated

    async def expire(
        self,
        *,
        reservation_id: str,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        idem_key = idempotency_key or uuid.uuid4().hex
        state = await _require_state(reservation_id)
        await _append_event(
            reservation_id=reservation_id,
            workflow_run_id=state.workflow_run_id,
            fragment_id=state.fragment_id,
            transition=ReservationTransition.EXPIRED,
            requesting_peer_id=state.requesting_peer_id,
            service_id=state.service_id,
            idempotency_key=idem_key,
        )
        updated = state.apply(ReservationTransition.EXPIRED)
        logger.info("reservation %s EXPIRED", reservation_id)
        return updated

    async def reject(
        self,
        *,
        reservation_id: str,
        reason: str | None = None,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        idem_key = idempotency_key or uuid.uuid4().hex
        state = await _require_state(reservation_id)
        await _append_event(
            reservation_id=reservation_id,
            workflow_run_id=state.workflow_run_id,
            fragment_id=state.fragment_id,
            transition=ReservationTransition.REJECTED,
            requesting_peer_id=state.requesting_peer_id,
            service_id=state.service_id,
            idempotency_key=idem_key,
            reason=reason,
        )
        updated = state.apply(ReservationTransition.REJECTED)
        logger.info("reservation %s REJECTED reason=%s", reservation_id, reason)
        return updated

    async def get_state(self, reservation_id: str) -> ReservationState | None:
        return await _load_state(reservation_id)

    async def check_conflict(
        self,
        *,
        service_id: str,
        fragment_id: str,
    ) -> ReservationConflictState:
        events = await ReservationEventDocument.find(
            ReservationEventDocument.service_id == service_id,
            ReservationEventDocument.fragment_id == fragment_id,
        ).sort("occurred_at").to_list()

        if not events:
            return ReservationConflictState(has_conflict=False)

        states: dict[str, ReservationState] = {}
        for event in events:
            rid = event.reservation_id
            if rid not in states:
                states[rid] = ReservationState(
                    reservation_id=rid,
                    workflow_run_id=event.workflow_run_id,
                    fragment_id=event.fragment_id,
                    service_id=event.service_id,
                    requesting_peer_id=event.requesting_peer_id,
                    ttl_seconds=event.payload.get("ttl_seconds", 60),
                    last_event_at=event.occurred_at,
                )
            else:
                try:
                    t = ReservationTransition(event.transition)
                    kwargs: dict[str, Any] = {}
                    if event.accepting_peer_id:
                        kwargs["accepting_peer_id"] = event.accepting_peer_id
                    states[rid] = states[rid].apply(t, occurred_at=event.occurred_at, **kwargs)
                except ValueError:
                    pass

        active = [s for s in states.values() if s.is_active]
        return ReservationConflictState(
            has_conflict=len(active) > 0,
            conflicting_reservation_id=active[0].reservation_id if active else None,
        )


async def _load_state(reservation_id: str) -> ReservationState | None:
    events = await ReservationEventDocument.find(
        ReservationEventDocument.reservation_id == reservation_id
    ).sort("occurred_at").to_list()

    if not events:
        return None

    first = events[0]
    state = ReservationState(
        reservation_id=reservation_id,
        workflow_run_id=first.workflow_run_id,
        fragment_id=first.fragment_id,
        service_id=first.service_id,
        requesting_peer_id=first.requesting_peer_id,
        ttl_seconds=first.payload.get("ttl_seconds", 60),
        last_event_at=first.occurred_at,
    )

    for event in events[1:]:
        try:
            transition = ReservationTransition(event.transition)
            kwargs: dict[str, Any] = {}
            if event.accepting_peer_id:
                kwargs["accepting_peer_id"] = event.accepting_peer_id
            state = state.apply(transition, occurred_at=event.occurred_at, **kwargs)
        except ValueError:
            logger.warning(
                "skipping invalid transition %s for reservation %s",
                event.transition,
                reservation_id,
            )

    return state


async def _load_state_by_idempotency_key(
    idempotency_key: str,
) -> ReservationState | None:
    record = await ReservationEventDocument.find_one(
        ReservationEventDocument.idempotency_key == idempotency_key
    )
    if record is None:
        return None
    return await _load_state(record.reservation_id)


async def _require_state(reservation_id: str) -> ReservationState:
    state = await _load_state(reservation_id)
    if state is None:
        raise ValueError(f"Reservation '{reservation_id}' not found in event log.")
    return state


async def _append_event(
    *,
    reservation_id: str,
    workflow_run_id: str,
    fragment_id: str,
    transition: ReservationTransition,
    requesting_peer_id: str,
    service_id: str,
    idempotency_key: str,
    accepting_peer_id: str | None = None,
    reason: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    record = ReservationEventDocument(
        id=uuid.uuid4().hex,
        reservation_id=reservation_id,
        workflow_run_id=workflow_run_id,
        fragment_id=fragment_id,
        transition=transition.value,
        requesting_peer_id=requesting_peer_id,
        accepting_peer_id=accepting_peer_id,
        service_id=service_id,
        idempotency_key=idempotency_key,
        reason=reason,
        payload=payload or {},
        occurred_at=datetime.now(timezone.utc),
    )
    await record.insert()
