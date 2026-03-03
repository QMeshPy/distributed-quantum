"""Runtime scheduler with reservation, retry, and fallback handling."""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

import anyio

from quantum_coordinator.infra.persistence.runtime_store import (
    FragmentExecutionEvent,
    RuntimeEventStore,
)
from quantum_coordinator.planning.models import CircuitFragment, ExecutionPlan
from quantum_coordinator.reservation.protocol import ReservationProtocol
from quantum_coordinator.runtime.gate_execution import GateExecutionAdapter
from quantum_coordinator.runtime.models import (
    FragmentExecutionResult,
    FragmentExecutionStatus,
    RuntimeExecutionError,
    RuntimeExecutionResult,
)


@dataclass(frozen=True)
class RuntimePolicy:
    """Runtime retry and timeout policy."""

    max_retries: int = 3
    timeout_seconds: float = 0.5
    backoff_base_seconds: float = 0.05
    backoff_multiplier: float = 2.0
    max_backoff_seconds: float = 0.4
    jitter_ratio: float = 0.1
    min_fidelity: float = 0.8
    seed: int | None = None


class RuntimeExecutor:
    """Executes plan fragments with retries and fallback nodes."""

    def __init__(
        self,
        reservation_protocol: ReservationProtocol,
        gate_adapter: GateExecutionAdapter,
        policy: RuntimePolicy,
        store: RuntimeEventStore | None = None,
    ) -> None:
        self._reservation_protocol = reservation_protocol
        self._gate_adapter = gate_adapter
        self._policy = policy
        self._store = store
        self._rng = random.Random(policy.seed)

    async def execute(self, job_id: str, plan: ExecutionPlan) -> RuntimeExecutionResult:
        """Execute all fragments in dependency-safe order."""
        completed: set[str] = set()
        pending = set(plan.fragment_order)
        results: list[FragmentExecutionResult] = []

        while pending:
            ready = [
                fragment_id
                for fragment_id in plan.fragment_order
                if fragment_id in pending
                and all(dep in completed for dep in plan.fragments[fragment_id].dependencies)
            ]
            if not ready:
                raise RuntimeExecutionError(
                    "No schedulable fragments; dependency deadlock detected"
                )

            for fragment_id in ready:
                assignment = plan.assignments[fragment_id]
                fragment = plan.fragments[fragment_id]
                result = await self._execute_fragment_with_fallback(
                    job_id=job_id,
                    fragment=fragment,
                    node_candidates=(assignment.primary_node_id,) + assignment.fallback_node_ids,
                )
                results.append(result)
                if result.status != FragmentExecutionStatus.SUCCESS:
                    raise RuntimeExecutionError(
                        f"Fragment {fragment_id} failed terminally: {result.error}"
                    )

                completed.add(fragment_id)
                pending.remove(fragment_id)

        return RuntimeExecutionResult(job_id=job_id, fragment_results=tuple(results))

    async def _execute_fragment_with_fallback(
        self,
        job_id: str,
        fragment: CircuitFragment,
        node_candidates: tuple[str, ...],
    ) -> FragmentExecutionResult:
        last_error = "execution_failed"

        for node_id in node_candidates:
            reservation_request = self._reservation_protocol.make_request(
                job_id=job_id,
                fragment_id=fragment.fragment_id,
                node_id=node_id,
                service_type=fragment.service_type.value,
                min_fidelity=self._policy.min_fidelity,
            )
            reservation_response = self._reservation_protocol.reserve(reservation_request)

            if not reservation_response.accepted:
                last_error = reservation_response.reason or "reservation_rejected"
                continue

            if reservation_response.reservation_id is None:
                last_error = "reservation_missing_id"
                continue

            for attempt in range(1, self._policy.max_retries + 1):
                started_at = datetime.now(timezone.utc)
                try:
                    with anyio.fail_after(self._policy.timeout_seconds):
                        execution_result = await self._gate_adapter.execute(
                            fragment,
                            node_id,
                            self._policy.timeout_seconds,
                        )
                except TimeoutError:
                    await self._record_event(
                        job_id=job_id,
                        fragment_id=fragment.fragment_id,
                        node_id=node_id,
                        attempt=attempt,
                        status="TIMEOUT",
                        error="timeout",
                        observed_fidelity=None,
                    )
                    if attempt < self._policy.max_retries:
                        await anyio.sleep(self._backoff_delay(attempt))
                        continue
                    self._reservation_protocol.cancel(
                        reservation_response.reservation_id,
                        reason="timeout_retry_exhausted",
                    )
                    last_error = "timeout_retry_exhausted"
                    break
                except ConnectionError as exc:
                    await self._record_event(
                        job_id=job_id,
                        fragment_id=fragment.fragment_id,
                        node_id=node_id,
                        attempt=attempt,
                        status="NODE_DROP",
                        error=str(exc),
                        observed_fidelity=None,
                    )
                    self._reservation_protocol.cancel(
                        reservation_response.reservation_id,
                        reason="node_drop",
                    )
                    last_error = "node_drop"
                    break

                if not execution_result.success:
                    await self._record_event(
                        job_id=job_id,
                        fragment_id=fragment.fragment_id,
                        node_id=node_id,
                        attempt=attempt,
                        status="REJECTED",
                        error=execution_result.error or "execution_rejected",
                        observed_fidelity=execution_result.observed_fidelity,
                    )
                    if attempt < self._policy.max_retries:
                        await anyio.sleep(self._backoff_delay(attempt))
                        continue
                    self._reservation_protocol.cancel(
                        reservation_response.reservation_id,
                        reason="execution_rejected",
                    )
                    last_error = execution_result.error or "execution_rejected"
                    break

                if execution_result.observed_fidelity < self._policy.min_fidelity:
                    await self._record_event(
                        job_id=job_id,
                        fragment_id=fragment.fragment_id,
                        node_id=node_id,
                        attempt=attempt,
                        status="QUALITY_DEGRADED",
                        error="quality_degraded",
                        observed_fidelity=execution_result.observed_fidelity,
                    )
                    self._reservation_protocol.cancel(
                        reservation_response.reservation_id,
                        reason="quality_degraded",
                    )
                    last_error = "quality_degraded"
                    break

                self._reservation_protocol.mark_executed(reservation_response.reservation_id)
                finished_at = datetime.now(timezone.utc)
                await self._record_event(
                    job_id=job_id,
                    fragment_id=fragment.fragment_id,
                    node_id=node_id,
                    attempt=attempt,
                    status="SUCCESS",
                    error=None,
                    observed_fidelity=execution_result.observed_fidelity,
                )
                return FragmentExecutionResult(
                    fragment_id=fragment.fragment_id,
                    node_id=node_id,
                    status=FragmentExecutionStatus.SUCCESS,
                    attempts=attempt,
                    started_at=started_at,
                    finished_at=finished_at,
                    observed_fidelity=execution_result.observed_fidelity,
                    error=None,
                )

        now = datetime.now(timezone.utc)
        return FragmentExecutionResult(
            fragment_id=fragment.fragment_id,
            node_id=node_candidates[-1],
            status=FragmentExecutionStatus.FAILED,
            attempts=self._policy.max_retries,
            started_at=now,
            finished_at=now,
            observed_fidelity=None,
            error=last_error,
        )

    def _backoff_delay(self, attempt: int) -> float:
        base = self._policy.backoff_base_seconds * (
            self._policy.backoff_multiplier ** (attempt - 1)
        )
        bounded = min(base, self._policy.max_backoff_seconds)
        jitter = bounded * self._policy.jitter_ratio * self._rng.random()
        return bounded + jitter

    async def _record_event(
        self,
        job_id: str,
        fragment_id: str,
        node_id: str,
        attempt: int,
        status: str,
        error: str | None,
        observed_fidelity: float | None,
    ) -> None:
        if self._store is None:
            return

        self._store.append_fragment_event(
            FragmentExecutionEvent(
                event_id=f"evt-{uuid4()}",
                job_id=job_id,
                fragment_id=fragment_id,
                node_id=node_id,
                attempt=attempt,
                status=status,
                error=error,
                observed_fidelity=observed_fidelity,
                created_at=datetime.now(timezone.utc),
            )
        )
