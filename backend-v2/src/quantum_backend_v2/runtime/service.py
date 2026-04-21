"""ExecutionService - appends durable execution events, never mutates rows."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from quantum_backend_v2.persistence.postgres import ExecutionEventRecord
from quantum_backend_v2.runtime.models import ExecutionState, ExecutionTransition

logger = logging.getLogger(__name__)


class ExecutionService:
    """Manages durable execution lifecycle over the Postgres event log."""

    def __init__(self, *, session_factory: Any) -> None:
        self._session_factory = session_factory

    async def dispatch(
        self,
        *,
        execution_id: str,
        reservation_id: str,
        workflow_run_id: str,
        fragment_id: str,
        service_id: str,
        executing_peer_id: str,
        idempotency_key: str | None = None,
    ) -> ExecutionState:
        """Append a DISPATCHED event and return the initial execution state."""
        idem_key = idempotency_key or uuid.uuid4().hex
        async with self._session_factory() as session:
            existing = await _load_state(session, execution_id)
            if existing is not None:
                logger.info("execution %s already exists - idempotent", execution_id)
                return existing

            await _append_event(
                session,
                execution_id=execution_id,
                reservation_id=reservation_id,
                workflow_run_id=workflow_run_id,
                fragment_id=fragment_id,
                transition=ExecutionTransition.DISPATCHED,
                executing_peer_id=executing_peer_id,
                service_id=service_id,
                idempotency_key=idem_key,
            )
            await session.commit()

        state = ExecutionState(
            execution_id=execution_id,
            reservation_id=reservation_id,
            workflow_run_id=workflow_run_id,
            fragment_id=fragment_id,
            service_id=service_id,
            executing_peer_id=executing_peer_id,
        )
        logger.info("execution %s DISPATCHED to peer %s", execution_id, executing_peer_id)
        return state

    async def record_running(
        self,
        *,
        execution_id: str,
        idempotency_key: str | None = None,
    ) -> ExecutionState:
        return await self._transition(
            execution_id=execution_id,
            transition=ExecutionTransition.RUNNING,
            idempotency_key=idempotency_key,
        )

    async def record_checkpoint(
        self,
        *,
        execution_id: str,
        checkpoint_ref: str,
        idempotency_key: str | None = None,
    ) -> ExecutionState:
        return await self._transition(
            execution_id=execution_id,
            transition=ExecutionTransition.CHECKPOINTED,
            idempotency_key=idempotency_key,
            payload={"checkpoint_ref": checkpoint_ref},
            checkpoint_ref=checkpoint_ref,
        )

    async def record_completed(
        self,
        *,
        execution_id: str,
        fidelity_score: float | None = None,
        latency_ms: float | None = None,
        idempotency_key: str | None = None,
    ) -> ExecutionState:
        return await self._transition(
            execution_id=execution_id,
            transition=ExecutionTransition.COMPLETED,
            idempotency_key=idempotency_key,
            fidelity_score=fidelity_score,
            latency_ms=latency_ms,
        )

    async def record_failed(
        self,
        *,
        execution_id: str,
        error_detail: str | None = None,
        idempotency_key: str | None = None,
    ) -> ExecutionState:
        return await self._transition(
            execution_id=execution_id,
            transition=ExecutionTransition.FAILED,
            idempotency_key=idempotency_key,
            error_detail=error_detail,
        )

    async def record_retrying(
        self,
        *,
        execution_id: str,
        fallback_peer_id: str,
        idempotency_key: str | None = None,
    ) -> ExecutionState:
        return await self._transition(
            execution_id=execution_id,
            transition=ExecutionTransition.RETRYING,
            idempotency_key=idempotency_key,
            payload={"fallback_peer_id": fallback_peer_id},
        )

    async def get_state(self, execution_id: str) -> ExecutionState | None:
        async with self._session_factory() as session:
            return await _load_state(session, execution_id)

    async def _transition(
        self,
        *,
        execution_id: str,
        transition: ExecutionTransition,
        idempotency_key: str | None = None,
        payload: dict[str, Any] | None = None,
        **state_kwargs: Any,
    ) -> ExecutionState:
        idem_key = idempotency_key or uuid.uuid4().hex
        async with self._session_factory() as session:
            state = await _require_state(session, execution_id)
            retry_attempt = state.retry_attempt + (
                1 if transition == ExecutionTransition.RETRYING else 0
            )
            updated = state.apply(
                transition,
                retry_attempt=retry_attempt,
                **state_kwargs,
            )
            await _append_event(
                session,
                execution_id=execution_id,
                reservation_id=state.reservation_id,
                workflow_run_id=state.workflow_run_id,
                fragment_id=state.fragment_id,
                transition=transition,
                executing_peer_id=state.executing_peer_id,
                service_id=state.service_id,
                idempotency_key=idem_key,
                fidelity_score=state_kwargs.get("fidelity_score"),
                latency_ms=state_kwargs.get("latency_ms"),
                error_detail=state_kwargs.get("error_detail"),
                retry_attempt=retry_attempt,
                payload=payload or {},
            )
            await session.commit()
        logger.info("execution %s -> %s", execution_id, transition.value)
        return updated


async def _load_state(session: AsyncSession, execution_id: str) -> ExecutionState | None:
    result = await session.execute(
        select(ExecutionEventRecord)
        .where(ExecutionEventRecord.execution_id == execution_id)
        .order_by(ExecutionEventRecord.occurred_at)
    )
    events = result.scalars().all()
    if not events:
        return None

    first = events[0]
    state = ExecutionState(
        execution_id=execution_id,
        reservation_id=first.reservation_id,
        workflow_run_id=first.workflow_run_id,
        fragment_id=first.fragment_id,
        service_id=first.service_id,
        executing_peer_id=first.executing_peer_id,
        retry_attempt=first.retry_attempt,
        last_event_at=first.occurred_at,
    )

    for event in events[1:]:
        transition = ExecutionTransition(event.transition)
        kwargs: dict[str, Any] = {}
        if event.fidelity_score is not None:
            kwargs["fidelity_score"] = event.fidelity_score
        if event.latency_ms is not None:
            kwargs["latency_ms"] = event.latency_ms
        if event.error_detail is not None:
            kwargs["error_detail"] = event.error_detail
        if event.payload.get("checkpoint_ref"):
            kwargs["checkpoint_ref"] = event.payload["checkpoint_ref"]
        kwargs["retry_attempt"] = event.retry_attempt
        state = state.apply(transition, occurred_at=event.occurred_at, **kwargs)

    return state


async def _require_state(session: AsyncSession, execution_id: str) -> ExecutionState:
    state = await _load_state(session, execution_id)
    if state is None:
        raise ValueError(f"Execution '{execution_id}' not found in event log.")
    return state


async def _append_event(
    session: AsyncSession,
    *,
    execution_id: str,
    reservation_id: str,
    workflow_run_id: str,
    fragment_id: str,
    transition: ExecutionTransition,
    executing_peer_id: str,
    service_id: str,
    idempotency_key: str,
    retry_attempt: int = 0,
    fidelity_score: float | None = None,
    latency_ms: float | None = None,
    error_detail: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    record = ExecutionEventRecord(
        id=uuid.uuid4().hex,
        execution_id=execution_id,
        reservation_id=reservation_id,
        workflow_run_id=workflow_run_id,
        fragment_id=fragment_id,
        transition=transition.value,
        executing_peer_id=executing_peer_id,
        service_id=service_id,
        idempotency_key=idempotency_key,
        retry_attempt=retry_attempt,
        fidelity_score=fidelity_score,
        latency_ms=latency_ms,
        error_detail=error_detail,
        payload=payload or {},
        occurred_at=datetime.now(timezone.utc),
    )
    session.add(record)
