"""Ephemeral remote worker that serves reservation and fragment execution RPC."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import partial
from time import perf_counter

import anyio

from quantum_backend_v2.api.routers.service_quality import ServiceQualityTracker
from quantum_backend_v2.application.distributed_statevector import apply_fragments_to_state
from quantum_backend_v2.protocols.execution import (
    ExecutionResultPayload,
    ExecutionTransition,
    FragmentDispatchInput,
    FragmentDispatchRequest,
)
from quantum_backend_v2.protocols.reservation import (
    ReservationCancelRequest,
    ReservationCancelResponse,
    ReservationCommitRequest,
    ReservationCommitResponse,
    ReservationPrepareRequest,
    ReservationPrepareResponse,
    ReservationTransition,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class _PreparedReservation:
    reservation_id: str
    workflow_run_id: str
    fragment_id: str
    service_id: str
    requesting_peer_id: str
    expires_at: datetime
    committed: bool = False


class PeerFragmentWorker:
    """In-memory worker that executes real fragment RPC requests."""

    def __init__(
        self,
        *,
        peer_id: str,
        max_concurrent_slots: int = 4,
    ) -> None:
        self._peer_id = peer_id
        self._max_concurrent_slots = max_concurrent_slots
        self._quality = ServiceQualityTracker()
        self._reservations: dict[str, _PreparedReservation] = {}
        self._active_executions: set[str] = set()
        self._execution_results: dict[str, ExecutionResultPayload] = {}

    def heartbeat_snapshot(self) -> tuple[int, int]:
        """Return the live reservation and execution counts for heartbeats."""
        self._purge_expired_reservations()
        return len(self._reservations), len(self._active_executions)

    async def handle_prepare(self, payload: bytes) -> bytes:
        request = ReservationPrepareRequest.model_validate_json(payload)
        self._purge_expired_reservations()
        existing = self._reservations.get(request.reservation_id)
        if existing is not None:
            transition = (
                ReservationTransition.COMMITTED
                if existing.committed
                else ReservationTransition.ACCEPTED
            )
            return ReservationPrepareResponse(
                reservation_id=request.reservation_id,
                accepting_peer_id=self._peer_id,
                transition=transition,
            ).model_dump_json().encode("utf-8")

        active_slots = len(self._reservations) + len(self._active_executions)
        if active_slots >= self._max_concurrent_slots:
            return ReservationPrepareResponse(
                reservation_id=request.reservation_id,
                accepting_peer_id=self._peer_id,
                transition=ReservationTransition.REJECTED,
                reason="peer capacity exhausted",
            ).model_dump_json().encode("utf-8")

        self._reservations[request.reservation_id] = _PreparedReservation(
            reservation_id=request.reservation_id,
            workflow_run_id=request.workflow_run_id,
            fragment_id=request.fragment_id,
            service_id=request.service_id,
            requesting_peer_id=request.requesting_peer_id,
            expires_at=_utc_now() + timedelta(seconds=request.ttl_seconds),
        )
        return ReservationPrepareResponse(
            reservation_id=request.reservation_id,
            accepting_peer_id=self._peer_id,
            transition=ReservationTransition.ACCEPTED,
        ).model_dump_json().encode("utf-8")

    async def handle_commit(self, payload: bytes) -> bytes:
        request = ReservationCommitRequest.model_validate_json(payload)
        self._purge_expired_reservations()
        reservation = self._reservations.get(request.reservation_id)
        if reservation is None:
            return ReservationCommitResponse(
                reservation_id=request.reservation_id,
                transition=ReservationTransition.REJECTED,
            ).model_dump_json().encode("utf-8")

        reservation.committed = True
        return ReservationCommitResponse(
            reservation_id=request.reservation_id,
            transition=ReservationTransition.COMMITTED,
        ).model_dump_json().encode("utf-8")

    async def handle_cancel(self, payload: bytes) -> bytes:
        request = ReservationCancelRequest.model_validate_json(payload)
        self._reservations.pop(request.reservation_id, None)
        return ReservationCancelResponse(
            reservation_id=request.reservation_id,
            transition=ReservationTransition.CANCELLED,
        ).model_dump_json().encode("utf-8")

    async def handle_dispatch(self, payload: bytes) -> bytes:
        request = FragmentDispatchRequest.model_validate_json(payload)
        existing_result = self._execution_results.get(request.execution_id)
        if existing_result is not None:
            return existing_result.model_dump_json().encode("utf-8")

        reservation = self._reservations.get(request.reservation_id)
        if reservation is None or not reservation.committed:
            result = ExecutionResultPayload(
                execution_id=request.execution_id,
                fragment_id=request.fragment_id,
                executing_peer_id=self._peer_id,
                transition=ExecutionTransition.FAILED,
                error_detail="reservation not committed on target peer",
            )
            self._execution_results[request.execution_id] = result
            return result.model_dump_json().encode("utf-8")

        self._active_executions.add(request.execution_id)
        self._reservations.pop(request.reservation_id, None)
        started_at = perf_counter()

        try:
            dispatch_input = FragmentDispatchInput.model_validate(request.input_payload)
            fragments = dispatch_input.fragment_bundle()
            dispatch_output = await anyio.to_thread.run_sync(
                partial(
                    apply_fragments_to_state,
                    fragments=fragments,
                    state=dispatch_input.state,
                    previous_peer_id=self._peer_id,
                    block_id=dispatch_input.block_id,
                )
            )
            result = ExecutionResultPayload(
                execution_id=request.execution_id,
                fragment_id=request.fragment_id,
                executing_peer_id=self._peer_id,
                transition=ExecutionTransition.COMPLETED,
                output_payload=dispatch_output.model_dump(mode="json"),
                latency_ms=(perf_counter() - started_at) * 1000.0,
                fidelity_score=self._bundle_fidelity(fragments),
            )
        except Exception as exc:
            result = ExecutionResultPayload(
                execution_id=request.execution_id,
                fragment_id=request.fragment_id,
                executing_peer_id=self._peer_id,
                transition=ExecutionTransition.FAILED,
                error_detail=str(exc),
                latency_ms=(perf_counter() - started_at) * 1000.0,
            )
        finally:
            self._active_executions.discard(request.execution_id)

        self._execution_results[request.execution_id] = result
        return result.model_dump_json().encode("utf-8")

    def _bundle_fidelity(self, fragments: tuple[object, ...]) -> float:
        service_ids = sorted(
            {
                fragment.service_id
                for fragment in fragments
                if hasattr(fragment, "service_id")
            }
        )
        if not service_ids:
            return 0.0
        return min(
            self._quality.get_service_fidelity(service_id, peer_id=self._peer_id)
            for service_id in service_ids
        )

    def _purge_expired_reservations(self) -> None:
        now = _utc_now()
        expired_ids = [
            reservation_id
            for reservation_id, reservation in self._reservations.items()
            if reservation.expires_at <= now
        ]
        for reservation_id in expired_ids:
            self._reservations.pop(reservation_id, None)
