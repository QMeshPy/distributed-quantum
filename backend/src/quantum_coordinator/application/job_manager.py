"""Job lifecycle orchestration for API submit/recovery flows."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

import anyio

from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence.job_store import JobRecord, JobStore
from quantum_coordinator.infra.persistence.runtime_store import RuntimeEventStore
from quantum_coordinator.planning import CircuitPlanner
from quantum_coordinator.planning.models import ExecutionPlan
from quantum_coordinator.reservation.protocol import ReservationProtocol
from quantum_coordinator.runtime import (
    GateExecutionAdapter,
    RuntimeExecutionResult,
    RuntimeExecutor,
    RuntimePolicy,
)

TERMINAL_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED}


@dataclass(frozen=True)
class JobProgressSnapshot:
    """Live progress derived from fragment execution events."""

    total_fragments: int
    completed_fragments: int
    active_fragments: int
    completion_ratio: float
    latest_event_at: datetime | None
    finalizing: bool


class JobManager:
    """Submit, execute, and recover coordinator jobs."""

    def __init__(
        self,
        planner: CircuitPlanner,
        reservation_protocol: ReservationProtocol,
        runtime_policy: RuntimePolicy,
        runtime_store: RuntimeEventStore,
        job_store: JobStore,
        gate_adapter: GateExecutionAdapter,
    ) -> None:
        self._planner = planner
        self._reservation_protocol = reservation_protocol
        self._runtime_policy = runtime_policy
        self._runtime_store = runtime_store
        self._job_store = job_store
        self._gate_adapter = gate_adapter
        self._inflight_jobs: set[str] = set()
        self._inflight_lock = anyio.Lock()
        # In-memory cache of execution plans by ID so that API consumers
        # can inspect how a job was routed and scheduled.
        self._plans: dict[str, ExecutionPlan] = {}

    def submit(self, circuit_text: str) -> JobRecord:
        """Persist a new queued job and return metadata."""
        now = datetime.now(timezone.utc)
        job = JobRecord(
            job_id=f"job-{uuid4()}",
            status=JobStatus.QUEUED,
            circuit_text=circuit_text,
            plan_id=None,
            error=None,
            result_json=None,
            created_at=now,
            updated_at=now,
        )
        self._job_store.upsert(job)
        return job

    def get(self, job_id: str) -> JobRecord | None:
        """Lookup a persisted job."""
        return self._job_store.get(job_id)

    async def process(self, job_id: str) -> None:
        """Compile and execute a job if it is not terminal."""
        claimed = await self._claim(job_id)
        if not claimed:
            return

        try:
            current = self._job_store.get(job_id)
            if current is None:
                return
            if current.status in TERMINAL_STATUSES:
                return

            current = self._set_status(current, JobStatus.COMPILING, plan_id=None, error=None)
            plan = self._planner.compile(current.circuit_text)
            # Cache the compiled plan for later introspection via the API.
            self._plans[plan.plan_id] = plan

            current = self._set_status(
                current,
                JobStatus.RESERVING,
                plan_id=plan.plan_id,
                error=None,
            )

            current = self._set_status(
                current,
                JobStatus.EXECUTING,
                plan_id=current.plan_id,
                error=None,
            )

            runtime = RuntimeExecutor(
                reservation_protocol=self._reservation_protocol,
                gate_adapter=self._gate_adapter,
                policy=self._runtime_policy,
                store=self._runtime_store,
            )
            result = await runtime.execute(job_id=job_id, plan=plan)

            self._set_status(
                current,
                JobStatus.COMPLETED,
                plan_id=current.plan_id,
                error=None,
                result_json=_serialize_runtime_result(result),
            )
        except Exception as exc:
            failed = self._job_store.get(job_id)
            if failed is not None:
                self._set_status(
                    failed,
                    JobStatus.FAILED,
                    plan_id=failed.plan_id,
                    error=str(exc),
                    result_json=None,
                )
        finally:
            await self._release(job_id)

    def get_plan(self, plan_id: str) -> ExecutionPlan | None:
        """Return a previously compiled execution plan, if available."""
        return self._plans.get(plan_id)

    def get_progress(
        self,
        job_id: str,
        plan_id: str | None,
        status: JobStatus,
    ) -> JobProgressSnapshot | None:
        """Summarize fragment-level progress for a routed job."""
        if plan_id is None:
            return None

        plan = self._plans.get(plan_id)
        if plan is None:
            return None

        total_fragments = len(plan.fragment_order)
        if total_fragments == 0:
            return None

        latest_event_by_fragment = {}
        latest_event_at: datetime | None = None
        for event in self._runtime_store.list_fragment_events(job_id):
            latest_event_by_fragment[event.fragment_id] = event
            latest_event_at = event.created_at

        completed_fragments = sum(
            1
            for event in latest_event_by_fragment.values()
            if event.status == "SUCCESS"
        )
        active_fragments = max(len(latest_event_by_fragment) - completed_fragments, 0)
        completion_ratio = completed_fragments / total_fragments
        finalizing = (
            status == JobStatus.EXECUTING
            and completed_fragments >= total_fragments
        )

        return JobProgressSnapshot(
            total_fragments=total_fragments,
            completed_fragments=completed_fragments,
            active_fragments=active_fragments,
            completion_ratio=completion_ratio,
            latest_event_at=latest_event_at,
            finalizing=finalizing,
        )

    def get_live_fragment_results(
        self,
        job_id: str,
        plan_id: str | None,
    ) -> list[dict[str, object]] | None:
        """Return successful fragment snapshots before the job fully completes."""
        if plan_id is None:
            return None

        plan = self._plans.get(plan_id)
        if plan is None:
            return None

        successful_events_by_fragment = {}
        for event in self._runtime_store.list_fragment_events(job_id):
            if event.status == "SUCCESS":
                successful_events_by_fragment[event.fragment_id] = event

        return [
            {
                "fragment_id": fragment_id,
                "node_id": successful_events_by_fragment[fragment_id].node_id,
                "status": "SUCCESS",
                "attempts": successful_events_by_fragment[fragment_id].attempt,
                "started_at": None,
                "finished_at": successful_events_by_fragment[fragment_id].created_at.isoformat(),
                "observed_fidelity": successful_events_by_fragment[fragment_id].observed_fidelity,
                "error": None,
            }
            for fragment_id in plan.fragment_order
            if fragment_id in successful_events_by_fragment
        ]

    async def recover_unfinished_jobs(self) -> None:
        """Restart processing for unfinished jobs from persistent storage."""
        for record in self._job_store.list_unfinished():
            await self.process(record.job_id)

    def _set_status(
        self,
        current: JobRecord,
        status: JobStatus,
        plan_id: str | None,
        error: str | None,
        result_json: str | None = None,
    ) -> JobRecord:
        updated = JobRecord(
            job_id=current.job_id,
            status=status,
            circuit_text=current.circuit_text,
            plan_id=plan_id,
            error=error,
            result_json=result_json,
            created_at=current.created_at,
            updated_at=datetime.now(timezone.utc),
        )
        self._job_store.upsert(updated)
        return updated

    async def _claim(self, job_id: str) -> bool:
        async with self._inflight_lock:
            if job_id in self._inflight_jobs:
                return False
            self._inflight_jobs.add(job_id)
            return True

    async def _release(self, job_id: str) -> None:
        async with self._inflight_lock:
            self._inflight_jobs.discard(job_id)


def _serialize_runtime_result(result: RuntimeExecutionResult) -> str:
    payload: dict[str, object] = {
        "job_id": result.job_id,
        "fragment_results": [
            {
                "fragment_id": fr.fragment_id,
                "node_id": fr.node_id,
                "status": fr.status.value,
                "attempts": fr.attempts,
                "started_at": fr.started_at.isoformat(),
                "finished_at": fr.finished_at.isoformat(),
                "observed_fidelity": fr.observed_fidelity,
                "error": fr.error,
            }
            for fr in result.fragment_results
        ],
    }
    # If the runtime provided quantum output (measurements, probabilities,
    # statevector, etc.), expose it so that API consumers can use it directly.
    if result.quantum_result is not None:
        payload["quantum_result"] = result.quantum_result
    return json.dumps(
        payload,
        separators=(",", ":"),
        sort_keys=True,
        default=_json_compatible,
    )


def _json_compatible(value: object) -> object:
    if isinstance(value, complex):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
