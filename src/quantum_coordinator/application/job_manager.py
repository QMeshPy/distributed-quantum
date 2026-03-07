"""Job lifecycle orchestration for API submit/recovery flows."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import uuid4

import anyio

from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence.job_store import JobRecord, JobStore
from quantum_coordinator.infra.persistence.runtime_store import RuntimeEventStore
from quantum_coordinator.planning import CircuitPlanner, PlanningError
from quantum_coordinator.reservation.protocol import ReservationProtocol
from quantum_coordinator.runtime import (
    GateExecutionAdapter,
    RuntimeExecutionError,
    RuntimeExecutionResult,
    RuntimeExecutor,
    RuntimePolicy,
)

TERMINAL_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED}


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
        except (PlanningError, RuntimeExecutionError, ValueError) as exc:
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
    payload = {
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
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)
