"""RuntimeRecoveryService — replays durable event logs on process startup.

Rebuilds an in-flight execution map so the coordinator can continue
monitoring and driving in-progress work after a crash or restart.
"""

from __future__ import annotations

import logging
from typing import Any

from quantum_backend_v2.persistence.mongodb import ExecutionEventDocument, ReservationEventDocument
from quantum_backend_v2.reservations.models import ReservationState, ReservationTransition
from quantum_backend_v2.runtime.models import ExecutionState, ExecutionTransition, InFlightExecution

logger = logging.getLogger(__name__)


class RuntimeRecoveryService:
    """Replays event logs on startup to rebuild the coordinator's runtime view."""

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
