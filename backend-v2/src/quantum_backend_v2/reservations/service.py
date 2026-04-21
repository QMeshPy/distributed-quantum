"""ReservationService — event-log-backed reservation lifecycle manager.

No authoritative in-memory state.  Conflict detection is always derived
from the append-only ``reservation_events`` table.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from quantum_backend_v2.persistence.postgres import ReservationEventRecord
from quantum_backend_v2.reservations.models import (
    ReservationConflictState,
    ReservationState,
    ReservationTransition,
)

logger = logging.getLogger(__name__)


class ReservationService:
    """Manages durable reservation lifecycle over the Postgres event log.

    All reads reconstruct state by replaying events.
    All writes are single-row appends (never updates).
    """

    def __init__(self, *, session_factory: Any) -> None:
        self._session_factory = session_factory

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
        """Append a REQUESTED event and return the initial state."""
        idem_key = idempotency_key or uuid.uuid4().hex
        async with self._session_factory() as session:
            existing_by_idempotency = await _load_state_by_idempotency_key(session, idem_key)
            if existing_by_idempotency is not None:
                logger.info("reservation idempotency hit for key %s", idem_key)
                return existing_by_idempotency

            existing = await _load_state(session, reservation_id)
            if existing is not None:
                logger.info("reservation %s already exists — skipping", reservation_id)
                return existing

            await _append_event(
                session,
                reservation_id=reservation_id,
                workflow_run_id=workflow_run_id,
                fragment_id=fragment_id,
                transition=ReservationTransition.REQUESTED,
                requesting_peer_id=requesting_peer_id,
                service_id=service_id,
                idempotency_key=idem_key,
                payload={"ttl_seconds": ttl_seconds},
            )
            await session.commit()

        state = ReservationState(
            reservation_id=reservation_id,
            workflow_run_id=workflow_run_id,
            fragment_id=fragment_id,
            service_id=service_id,
            requesting_peer_id=requesting_peer_id,
            ttl_seconds=ttl_seconds,
        )
        logger.info("reservation %s REQUESTED", reservation_id)
        return state

    async def accept(
        self,
        *,
        reservation_id: str,
        accepting_peer_id: str,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        """Append an ACCEPTED event and return updated state."""
        idem_key = idempotency_key or uuid.uuid4().hex
        async with self._session_factory() as session:
            state = await _require_state(session, reservation_id)
            updated = state.apply(ReservationTransition.ACCEPTED, accepting_peer_id=accepting_peer_id)
            await _append_event(
                session,
                reservation_id=reservation_id,
                workflow_run_id=state.workflow_run_id,
                fragment_id=state.fragment_id,
                transition=ReservationTransition.ACCEPTED,
                requesting_peer_id=state.requesting_peer_id,
                accepting_peer_id=accepting_peer_id,
                service_id=state.service_id,
                idempotency_key=idem_key,
            )
            await session.commit()
        logger.info("reservation %s ACCEPTED by %s", reservation_id, accepting_peer_id)
        return updated

    async def commit(
        self,
        *,
        reservation_id: str,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        """Append a COMMITTED event."""
        idem_key = idempotency_key or uuid.uuid4().hex
        async with self._session_factory() as session:
            state = await _require_state(session, reservation_id)
            updated = state.apply(ReservationTransition.COMMITTED)
            await _append_event(
                session,
                reservation_id=reservation_id,
                workflow_run_id=state.workflow_run_id,
                fragment_id=state.fragment_id,
                transition=ReservationTransition.COMMITTED,
                requesting_peer_id=state.requesting_peer_id,
                accepting_peer_id=state.accepting_peer_id,
                service_id=state.service_id,
                idempotency_key=idem_key,
            )
            await session.commit()
        logger.info("reservation %s COMMITTED", reservation_id)
        return updated

    async def cancel(
        self,
        *,
        reservation_id: str,
        reason: str | None = None,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        """Append a CANCELLED event."""
        idem_key = idempotency_key or uuid.uuid4().hex
        async with self._session_factory() as session:
            state = await _require_state(session, reservation_id)
            updated = state.apply(ReservationTransition.CANCELLED)
            await _append_event(
                session,
                reservation_id=reservation_id,
                workflow_run_id=state.workflow_run_id,
                fragment_id=state.fragment_id,
                transition=ReservationTransition.CANCELLED,
                requesting_peer_id=state.requesting_peer_id,
                accepting_peer_id=state.accepting_peer_id,
                service_id=state.service_id,
                idempotency_key=idem_key,
                reason=reason,
            )
            await session.commit()
        logger.info("reservation %s CANCELLED reason=%s", reservation_id, reason)
        return updated

    async def reject(
        self,
        *,
        reservation_id: str,
        reason: str | None = None,
        accepting_peer_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> ReservationState:
        """Append a REJECTED event."""
        idem_key = idempotency_key or uuid.uuid4().hex
        async with self._session_factory() as session:
            state = await _require_state(session, reservation_id)
            updated = state.apply(
                ReservationTransition.REJECTED,
                accepting_peer_id=accepting_peer_id or state.accepting_peer_id,
            )
            await _append_event(
                session,
                reservation_id=reservation_id,
                workflow_run_id=state.workflow_run_id,
                fragment_id=state.fragment_id,
                transition=ReservationTransition.REJECTED,
                requesting_peer_id=state.requesting_peer_id,
                accepting_peer_id=accepting_peer_id or state.accepting_peer_id,
                service_id=state.service_id,
                idempotency_key=idem_key,
                reason=reason,
            )
            await session.commit()
        logger.info("reservation %s REJECTED reason=%s", reservation_id, reason)
        return updated

    async def get_state(self, reservation_id: str) -> ReservationState | None:
        """Reconstruct current state by replaying events from Postgres."""
        async with self._session_factory() as session:
            return await _load_state(session, reservation_id)

    async def get_peer_conflict_state(
        self, peer_id: str
    ) -> ReservationConflictState:
        """Return active/committed reservation counts for a peer from event log."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(ReservationEventRecord).where(
                    ReservationEventRecord.accepting_peer_id == peer_id
                )
            )
            events = result.scalars().all()

        active: set[str] = set()
        committed: set[str] = set()

        res_events: dict[str, list[ReservationEventRecord]] = {}
        for e in events:
            res_events.setdefault(e.reservation_id, []).append(e)

        for res_id, evts in res_events.items():
            sorted_evts = sorted(evts, key=lambda x: x.occurred_at)
            last_transition = sorted_evts[-1].transition
            if last_transition == ReservationTransition.ACCEPTED.value:
                active.add(res_id)
            elif last_transition == ReservationTransition.COMMITTED.value:
                committed.add(res_id)

        return ReservationConflictState(
            peer_id=peer_id,
            active_reservation_ids=frozenset(active),
            committed_reservation_ids=frozenset(committed),
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _load_state(
    session: AsyncSession, reservation_id: str
) -> ReservationState | None:
    result = await session.execute(
        select(ReservationEventRecord)
        .where(ReservationEventRecord.reservation_id == reservation_id)
        .order_by(ReservationEventRecord.occurred_at)
    )
    events = result.scalars().all()
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
        transition = ReservationTransition(event.transition)
        kwargs: dict[str, Any] = {}
        if event.accepting_peer_id:
            kwargs["accepting_peer_id"] = event.accepting_peer_id
        state = state.apply(transition, occurred_at=event.occurred_at, **kwargs)

    return state


async def _load_state_by_idempotency_key(
    session: AsyncSession,
    idempotency_key: str,
) -> ReservationState | None:
    result = await session.execute(
        select(ReservationEventRecord).where(
            ReservationEventRecord.idempotency_key == idempotency_key
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        return None
    return await _load_state(session, record.reservation_id)


async def _require_state(
    session: AsyncSession, reservation_id: str
) -> ReservationState:
    state = await _load_state(session, reservation_id)
    if state is None:
        raise ValueError(f"Reservation '{reservation_id}' not found in event log.")
    return state


async def _append_event(
    session: AsyncSession,
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
    record = ReservationEventRecord(
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
    session.add(record)
