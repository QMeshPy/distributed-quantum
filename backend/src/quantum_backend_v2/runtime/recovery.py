"""Reconcile interrupted local jobs and rebuild durable runtime snapshots."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from quantum_backend_v2.payments.credits import release_job_credits
from quantum_backend_v2.payments.errors import HoldNotFoundError
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.persistence.mongodb import (
    ExecutionEventDocument, FinancialJobDocument, OptionsJobDocument,
    ReservationEventDocument, RiskJobDocument, WorkflowRunDocument,
)
from quantum_backend_v2.reservations.models import ReservationState, ReservationTransition
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.models import ExecutionState, ExecutionTransition, InFlightExecution
from quantum_backend_v2.runtime.service import ExecutionService

logger = logging.getLogger(__name__)
_INTERRUPTED = "Job interrupted by backend restart; submit a new job."


class RuntimeRecoveryService:
    """Replays event logs on startup to rebuild the coordinator's runtime view."""

    async def fail_interrupted_jobs(
        self, *, coordinator_peer_id: str, ledger_service: LedgerService | None = None,
    ) -> None:
        """Fail abandoned work for this stable, unique coordinator identity only.

        Legacy jobs without a coordinator identity cannot safely be attributed.
        Failed circuit runs stay eligible so another restart can finish cleanup.
        """
        workflow_ids: set[str] = set()
        now = datetime.now(timezone.utc)
        for model, pending, failed in (
            (WorkflowRunDocument, ["QUEUED", "COMPILING", "EXECUTING"], "FAILED"),
            (FinancialJobDocument, ["ingesting", "analyzing"], "failed"),
            (OptionsJobDocument, ["queued", "running"], "failed"),
            (RiskJobDocument, ["queued", "running"], "failed"),
        ):
            query: dict[str, Any] = {"coordinator_peer_id": coordinator_peer_id}
            if model is WorkflowRunDocument:
                query.update(workflow_definition_id="circuit-execution", **{"$or": [
                    {"status": {"$in": pending}},
                    {"status": failed, "output_snapshot.error": _INTERRUPTED},
                ]})
            else:
                query["status"] = {"$in": pending}
            for doc in await model.find(query).to_list():
                if doc.status != failed:
                    doc.status = failed
                    doc.updated_at = now
                    if model is WorkflowRunDocument:
                        doc.completed_at = now
                        doc.failed_fragments = max(1, doc.fragment_count - doc.completed_fragments)
                        doc.output_snapshot.update(error=_INTERRUPTED, latest_event_at=now.isoformat())
                    else:
                        doc.error = _INTERRUPTED
                    await doc.save()
                if model is WorkflowRunDocument:
                    workflow_ids.add(doc.id)

        if not workflow_ids:
            return
        executions = ExecutionService()
        for execution in await self.recover_in_flight_executions():
            if execution.workflow_run_id in workflow_ids:
                await executions.record_failed(
                    execution_id=execution.execution_id, error_detail=_INTERRUPTED,
                    idempotency_key=f"restart:{execution.execution_id}:{execution.retry_attempt}",
                )
        reservations = ReservationService()
        for reservation in await self.recover_open_reservations():
            if reservation.workflow_run_id in workflow_ids:
                await reservations.cancel(
                    reservation_id=reservation.reservation_id, reason=_INTERRUPTED,
                    idempotency_key=f"restart:{reservation.reservation_id}",
                )
        if ledger_service is not None:
            for job_id in workflow_ids:
                try:
                    await release_job_credits(ledger_service, job_id)
                except HoldNotFoundError:
                    pass  # x402 and unmetered jobs have no prepaid credit hold.
                except Exception:
                    logger.exception("restart credit release failed for job %s", job_id)

    async def recover_in_flight_executions(self) -> list[InFlightExecution]:
        """Return all executions that are not yet in a terminal state."""
        all_events = await ExecutionEventDocument.find().sort("occurred_at").to_list()

        states = _replay_execution_states(all_events)
        in_flight = [
            InFlightExecution(
                execution_id=s.execution_id,
                workflow_run_id=s.workflow_run_id,
                fragment_id=s.fragment_id,
                executing_peer_id=s.executing_peer_id,
                transition=s.current_transition,
                retry_attempt=s.retry_attempt,
                last_event_at=s.last_event_at,
            )
            for s in states.values()
            if not s.is_terminal
        ]

        logger.info(
            "recovery: found %d in-flight executions (%d total replayed)",
            len(in_flight),
            len(states),
        )
        return in_flight

    async def recover_open_reservations(self) -> list[ReservationState]:
        """Return reservations that are REQUESTED or ACCEPTED (not yet terminal)."""
        all_events = await ReservationEventDocument.find().sort("occurred_at").to_list()

        states = _replay_reservation_states(all_events)
        open_reservations = [s for s in states.values() if not s.is_terminal]

        logger.info(
            "recovery: found %d open reservations (%d total replayed)",
            len(open_reservations),
            len(states),
        )
        return open_reservations

    async def summary(self) -> dict[str, int]:
        """Return a counts summary useful for readiness checks and monitoring."""
        exec_events = await ExecutionEventDocument.find().to_list()
        res_events = await ReservationEventDocument.find().to_list()

        exec_states = _replay_execution_states(exec_events)
        res_states = _replay_reservation_states(res_events)

        return {
            "total_executions": len(exec_states),
            "in_flight_executions": sum(1 for s in exec_states.values() if not s.is_terminal),
            "total_reservations": len(res_states),
            "open_reservations": sum(1 for s in res_states.values() if not s.is_terminal),
        }


def _replay_execution_states(
    events: list[ExecutionEventDocument],
) -> dict[str, ExecutionState]:
    by_execution: dict[str, list[ExecutionEventDocument]] = {}
    for e in events:
        by_execution.setdefault(e.execution_id, []).append(e)

    states: dict[str, ExecutionState] = {}
    for execution_id, evts in by_execution.items():
        sorted_evts = sorted(evts, key=lambda x: x.occurred_at)
        first = sorted_evts[0]
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
        for evt in sorted_evts[1:]:
            try:
                transition = ExecutionTransition(evt.transition)
                kwargs: dict[str, Any] = {}
                if evt.fidelity_score is not None:
                    kwargs["fidelity_score"] = evt.fidelity_score
                if evt.latency_ms is not None:
                    kwargs["latency_ms"] = evt.latency_ms
                if evt.error_detail is not None:
                    kwargs["error_detail"] = evt.error_detail
                kwargs["retry_attempt"] = evt.retry_attempt
                state = state.apply(transition, occurred_at=evt.occurred_at, **kwargs)
            except ValueError:
                logger.warning(
                    "recovery: skipping invalid transition %s for execution %s",
                    evt.transition,
                    execution_id,
                )
        states[execution_id] = state

    return states


def _replay_reservation_states(
    events: list[ReservationEventDocument],
) -> dict[str, ReservationState]:
    by_reservation: dict[str, list[ReservationEventDocument]] = {}
    for e in events:
        by_reservation.setdefault(e.reservation_id, []).append(e)

    states: dict[str, ReservationState] = {}
    for reservation_id, evts in by_reservation.items():
        sorted_evts = sorted(evts, key=lambda x: x.occurred_at)
        first = sorted_evts[0]
        state = ReservationState(
            reservation_id=reservation_id,
            workflow_run_id=first.workflow_run_id,
            fragment_id=first.fragment_id,
            service_id=first.service_id,
            requesting_peer_id=first.requesting_peer_id,
            ttl_seconds=first.payload.get("ttl_seconds", 60),
            last_event_at=first.occurred_at,
        )
        for evt in sorted_evts[1:]:
            try:
                transition = ReservationTransition(evt.transition)
                kwargs: dict[str, Any] = {}
                if evt.accepting_peer_id:
                    kwargs["accepting_peer_id"] = evt.accepting_peer_id
                state = state.apply(transition, occurred_at=evt.occurred_at, **kwargs)
            except ValueError:
                logger.warning(
                    "recovery: skipping invalid transition %s for reservation %s",
                    evt.transition,
                    reservation_id,
                )
        states[reservation_id] = state

    return states
