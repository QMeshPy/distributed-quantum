"""Durable parity services for circuit and finance endpoints."""

from __future__ import annotations

import copy
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from quantum_backend_v2.application.financial_portfolio import (
    PortfolioOptimizationConfig,
    build_portfolio_optimization_artifacts,
)
from quantum_backend_v2.application.financial_comparison import (
    build_financial_comparison_report,
)
from quantum_backend_v2.application.quantum_bridge import QuantumExecutionBridge
from quantum_backend_v2.identity.models import UserTokenClaims
from quantum_backend_v2.persistence.postgres import (
    ExecutionPlanRecord,
    FinancialJobRecord,
    PlatformUserRecord,
    WorkflowRunRecord,
)
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.service import ExecutionService


_CIRCUIT_WORKFLOW_DEFINITION_ID = "circuit-execution"
_WORKFLOW_TYPE_CIRCUIT = "quantum_circuit"
_STATUS_QUEUED = "QUEUED"
_STATUS_COMPILING = "COMPILING"
_STATUS_EXECUTING = "EXECUTING"
_STATUS_COMPLETED = "COMPLETED"
_STATUS_FAILED = "FAILED"
_TERMINAL_JOB_STATUSES = {_STATUS_COMPLETED, _STATUS_FAILED}

_FIN_STATUS_INGESTING = "ingesting"
_FIN_STATUS_ANALYZING = "analyzing"
_FIN_STATUS_COMPLETED = "completed"
_FIN_STATUS_FAILED = "failed"
_TERMINAL_FINANCIAL_STATUSES = {_FIN_STATUS_COMPLETED, _FIN_STATUS_FAILED}
_FINANCIAL_PROBLEM_TYPE = "portfolio_optimization"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CircuitJobService:
    """Durable circuit job submission, planning, and execution bridge."""

    def __init__(
        self,
        *,
        session_factory: Any,
        discovery_service: Any,
        libp2p_runtime: Any,
    ) -> None:
        if session_factory is None:
            raise RuntimeError("CircuitJobService requires a configured Postgres session factory")
        self._session_factory = session_factory
        reservation_service = ReservationService(session_factory=session_factory)
        execution_service = ExecutionService(session_factory=session_factory)
        self._quantum_bridge = QuantumExecutionBridge(
            discovery_service=discovery_service,
            libp2p_runtime=libp2p_runtime,
            reservation_service=reservation_service,
            execution_service=execution_service,
        )

    async def submit(
        self,
        *,
        circuit_text: str,
        owner_user_id: str,
    ) -> WorkflowRunRecord:
        job_id = f"job-{uuid.uuid4()}"
        now = _utc_now()
        async with self._session_factory() as session:
            await _ensure_platform_user(session, owner_user_id)
            record = WorkflowRunRecord(
                id=job_id,
                workflow_definition_id=_CIRCUIT_WORKFLOW_DEFINITION_ID,
                owner_user_id=owner_user_id,
                workflow_type=_WORKFLOW_TYPE_CIRCUIT,
                status=_STATUS_QUEUED,
                input_snapshot={"circuit": circuit_text},
                output_snapshot={},
                fragment_count=0,
                completed_fragments=0,
                failed_fragments=0,
                started_at=None,
                completed_at=None,
                created_at=now,
                updated_at=now,
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return record

    async def process(self, job_id: str) -> None:
        async with self._session_factory() as session:
            record = await session.get(WorkflowRunRecord, job_id)
            if record is None or record.status in _TERMINAL_JOB_STATUSES:
                return

            record.status = _STATUS_COMPILING
            record.started_at = record.started_at or _utc_now()
            record.output_snapshot = {}
            await session.commit()
            await session.refresh(record)

        partial_results: list[dict[str, Any]] = []
        runtime_fragment_results: list[Any] = []
        final_state = None
        try:
            circuit_text = str(record.input_snapshot.get("circuit", ""))
            await self._quantum_bridge.wait_for_service_peers()
            plan = self._quantum_bridge.compile_plan(circuit_text)
            plan_payload = self._quantum_bridge.serialize_plan(plan)

            async with self._session_factory() as session:
                plan_record = ExecutionPlanRecord(
                    id=plan.plan_id,
                    workflow_run_id=job_id,
                    payload=plan_payload,
                )
                session.add(plan_record)
                record = await session.get(WorkflowRunRecord, job_id)
                if record is None:
                    return
                record.artifact_bundle_id = plan.plan_id
                record.status = _STATUS_EXECUTING
                record.fragment_count = len(plan.fragment_order)
                record.completed_fragments = 0
                record.failed_fragments = 0
                record.output_snapshot = {}
                await session.commit()

            index = 0
            async for execution in self._quantum_bridge.iter_fragment_executions(
                workflow_run_id=job_id,
                plan=plan,
            ):
                index += 1
                runtime_fragment_results.append(execution.fragment_result)
                final_state = execution.state
                serialized_result = self._quantum_bridge.serialize_fragment_result(
                    execution.fragment_result,
                    execution=execution,
                )
                partial_results.append(serialized_result)

                async with self._session_factory() as session:
                    record = await session.get(WorkflowRunRecord, job_id)
                    if record is None:
                        return
                    record.completed_fragments = index
                    record.output_snapshot = {
                        "fragment_results": partial_results,
                        "latest_event_at": serialized_result["finished_at"],
                    }
                    await session.commit()

            quantum_result = self._quantum_bridge.build_quantum_result(
                plan=plan,
                fragment_results=tuple(runtime_fragment_results),
                final_state=final_state,
            )

            async with self._session_factory() as session:
                record = await session.get(WorkflowRunRecord, job_id)
                if record is None:
                    return
                record.status = _STATUS_COMPLETED
                record.completed_at = _utc_now()
                record.output_snapshot = {
                    "fragment_results": partial_results,
                    "latest_event_at": _utc_now().isoformat(),
                    "result": {
                        "job_id": job_id,
                        "fragment_results": partial_results,
                        "quantum_result": quantum_result,
                    },
                }
                await session.commit()
        except Exception as exc:
            async with self._session_factory() as session:
                record = await session.get(WorkflowRunRecord, job_id)
                if record is None:
                    return
                record.status = _STATUS_FAILED
                record.completed_at = _utc_now()
                record.failed_fragments = max(1, record.fragment_count - record.completed_fragments)
                record.output_snapshot = {
                    "error": str(exc),
                    "fragment_results": partial_results,
                    "latest_event_at": _utc_now().isoformat(),
                }
                await session.commit()

    async def list_jobs(
        self,
        *,
        current_user: UserTokenClaims,
        limit: int,
        statuses: list[str] | None = None,
    ) -> list[WorkflowRunRecord]:
        async with self._session_factory() as session:
            stmt = (
                select(WorkflowRunRecord)
                .where(
                    WorkflowRunRecord.workflow_definition_id
                    == _CIRCUIT_WORKFLOW_DEFINITION_ID
                )
                .order_by(WorkflowRunRecord.created_at.desc())
                .limit(limit)
            )
            if statuses:
                stmt = stmt.where(WorkflowRunRecord.status.in_(statuses))
            if not current_user.is_admin():
                stmt = stmt.where(WorkflowRunRecord.owner_user_id == current_user.user_id)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_job(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> WorkflowRunRecord | None:
        async with self._session_factory() as session:
            stmt = select(WorkflowRunRecord).where(WorkflowRunRecord.id == job_id)
            if not current_user.is_admin():
                stmt = stmt.where(WorkflowRunRecord.owner_user_id == current_user.user_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_plan(
        self,
        plan_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> ExecutionPlanRecord | None:
        async with self._session_factory() as session:
            stmt = select(ExecutionPlanRecord).where(ExecutionPlanRecord.id == plan_id)
            result = await session.execute(stmt)
            plan_record = result.scalar_one_or_none()
            if plan_record is None:
                return None

            run = await session.get(WorkflowRunRecord, plan_record.workflow_run_id)
            if run is None:
                return None
            if current_user.is_admin() or run.owner_user_id == current_user.user_id:
                return plan_record
            return None

    def get_error(self, record: WorkflowRunRecord) -> str | None:
        raw = record.output_snapshot.get("error")
        return None if raw is None else str(raw)

    def get_result_payload(self, record: WorkflowRunRecord) -> dict[str, Any] | None:
        result_payload = record.output_snapshot.get("result")
        return result_payload if isinstance(result_payload, dict) else None

    def build_progress(self, record: WorkflowRunRecord) -> dict[str, Any] | None:
        if record.fragment_count == 0 and record.status == _STATUS_QUEUED:
            return None

        latest_raw = record.output_snapshot.get("latest_event_at")
        latest_event_at = None
        if isinstance(latest_raw, str):
            latest_event_at = datetime.fromisoformat(latest_raw)

        completed = int(record.completed_fragments)
        total = int(record.fragment_count)
        active_fragments = 1 if record.status == _STATUS_EXECUTING and completed < total else 0
        completion_ratio = (completed / total) if total > 0 else 0.0

        return {
            "total_fragments": total,
            "completed_fragments": completed,
            "active_fragments": active_fragments,
            "completion_ratio": completion_ratio,
            "latest_event_at": latest_event_at or record.updated_at,
            "finalizing": record.status == _STATUS_EXECUTING and completed >= total > 0,
        }


class FinancialJobService:
    """Durable Track B finance workflow service."""

    def __init__(
        self,
        *,
        session_factory: Any,
        discovery_service: Any,
        libp2p_runtime: Any,
    ) -> None:
        if session_factory is None:
            raise RuntimeError("FinancialJobService requires a configured Postgres session factory")
        self._session_factory = session_factory
        reservation_service = ReservationService(session_factory=session_factory)
        execution_service = ExecutionService(session_factory=session_factory)
        self._quantum_bridge = QuantumExecutionBridge(
            discovery_service=discovery_service,
            libp2p_runtime=libp2p_runtime,
            reservation_service=reservation_service,
            execution_service=execution_service,
        )

    async def submit(
        self,
        *,
        filename: str,
        owner_user_id: str,
        problem_type: str,
        config: PortfolioOptimizationConfig,
    ) -> FinancialJobRecord:
        if problem_type != _FINANCIAL_PROBLEM_TYPE:
            raise ValueError(f"Unsupported financial problem type '{problem_type}'.")

        job_id = f"fin-{uuid.uuid4()}"
        async with self._session_factory() as session:
            await _ensure_platform_user(session, owner_user_id)
            record = FinancialJobRecord(
                id=job_id,
                owner_user_id=owner_user_id,
                filename=filename,
                status=_FIN_STATUS_INGESTING,
                row_count=None,
                col_count=None,
                error=None,
                result_payload={
                    "problem_type": problem_type,
                    "request": _submission_request_snapshot(config),
                },
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return record

    async def process(self, *, job_id: str, csv_bytes: bytes) -> None:
        process_started_at = time.perf_counter()
        async with self._session_factory() as session:
            record = await session.get(FinancialJobRecord, job_id)
            if record is None or record.status in _TERMINAL_FINANCIAL_STATUSES:
                return
            record.status = _FIN_STATUS_ANALYZING
            await session.commit()

        try:
            async with self._session_factory() as session:
                record = await session.get(FinancialJobRecord, job_id)
                if record is None:
                    return
                config = _config_from_record(record)
                filename = record.filename

            artifacts = build_portfolio_optimization_artifacts(
                csv_bytes=csv_bytes,
                job_id=job_id,
                filename=filename,
                config=config,
            )
            await self._quantum_bridge.wait_for_service_peers()
            plan = self._quantum_bridge.compile_plan(artifacts.circuit_qasm)
            runtime_fragment_results: list[Any] = []
            serialized_fragment_results: list[dict[str, Any]] = []
            final_state = None
            async for execution in self._quantum_bridge.iter_fragment_executions(
                workflow_run_id=job_id,
                plan=plan,
            ):
                runtime_fragment_results.append(execution.fragment_result)
                final_state = execution.state
                serialized_fragment_results.append(
                    self._quantum_bridge.serialize_fragment_result(
                        execution.fragment_result,
                        execution=execution,
                    )
                )
            quantum_result = self._quantum_bridge.build_quantum_result(
                plan=plan,
                fragment_results=tuple(runtime_fragment_results),
                final_state=final_state,
            )

            result_payload = copy.deepcopy(artifacts.payload)
            quantum_execution = result_payload.get("quantum_execution")
            if not isinstance(quantum_execution, dict):
                raise RuntimeError("Portfolio optimization payload did not include quantum execution details.")

            quantum_execution.update(
                {
                    "plan": self._quantum_bridge.serialize_plan(plan),
                    "fragment_results": serialized_fragment_results,
                    "quantum_result": quantum_result,
                }
            )
            result_payload["analysis_duration_ms"] = int(
                (time.perf_counter() - process_started_at) * 1000
            )
            result_payload["distributed_nodes_used"] = len(
                {row["node_id"] for row in serialized_fragment_results}
            )
            result_payload["fragments_executed"] = len(serialized_fragment_results)
            result_payload["generated_at"] = _utc_now().isoformat()
            result_payload = _attach_financial_comparison_report(result_payload)

            async with self._session_factory() as session:
                record = await session.get(FinancialJobRecord, job_id)
                if record is None:
                    return
                record.status = _FIN_STATUS_COMPLETED
                record.row_count = int(result_payload["row_count"])
                record.col_count = int(result_payload["col_count"])
                record.error = None
                record.result_payload = result_payload
                await session.commit()
        except Exception as exc:
            async with self._session_factory() as session:
                record = await session.get(FinancialJobRecord, job_id)
                if record is None:
                    return
                record.status = _FIN_STATUS_FAILED
                record.error = str(exc)
                await session.commit()

    async def get_job(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> FinancialJobRecord | None:
        async with self._session_factory() as session:
            stmt = select(FinancialJobRecord).where(FinancialJobRecord.id == job_id)
            if not current_user.is_admin():
                stmt = stmt.where(FinancialJobRecord.owner_user_id == current_user.user_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def list_jobs(
        self,
        *,
        current_user: UserTokenClaims,
        limit: int,
    ) -> list[FinancialJobRecord]:
        async with self._session_factory() as session:
            stmt = (
                select(FinancialJobRecord)
                .order_by(FinancialJobRecord.created_at.desc())
                .limit(limit)
            )
            if not current_user.is_admin():
                stmt = stmt.where(FinancialJobRecord.owner_user_id == current_user.user_id)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    def get_problem_type(self, record: FinancialJobRecord) -> str | None:
        payload = record.result_payload or {}
        raw_problem_type = payload.get("problem_type")
        return str(raw_problem_type) if isinstance(raw_problem_type, str) else None

    def get_result_payload(
        self,
        record: FinancialJobRecord,
        *,
        detail: str = "full",
    ) -> dict[str, Any] | None:
        if record.status != _FIN_STATUS_COMPLETED or record.result_payload is None:
            return None

        payload = _attach_financial_comparison_report(record.result_payload)
        if detail == "summary":
            return _build_financial_summary_payload(payload)
        return copy.deepcopy(payload)

    def get_comparison_payload(self, record: FinancialJobRecord) -> dict[str, Any] | None:
        if record.status != _FIN_STATUS_COMPLETED or record.result_payload is None:
            return None

        payload = _attach_financial_comparison_report(record.result_payload)
        comparison_report = payload.get("comparison_report")
        return (
            copy.deepcopy(comparison_report)
            if isinstance(comparison_report, dict)
            else None
        )


def _submission_request_snapshot(config: PortfolioOptimizationConfig) -> dict[str, Any]:
    return {
        "problem_type": _FINANCIAL_PROBLEM_TYPE,
        "budget": config.budget,
        "risk_aversion": config.risk_aversion,
        "max_assets_considered": config.max_assets_considered,
        "date_column": config.date_column,
        "ticker_column": config.ticker_column,
        "value_column": config.value_column,
        "value_mode": config.value_mode,
        "qaoa_reps": config.qaoa_reps,
        "parameter_search_steps": config.parameter_search_steps,
    }


def _build_financial_summary_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Trim heavyweight quantum result blobs without deep-copying the full finance payload."""
    summary_payload = dict(payload)
    quantum_execution = payload.get("quantum_execution")
    if not isinstance(quantum_execution, dict):
        return summary_payload

    summary_quantum_execution = dict(quantum_execution)
    quantum_result = quantum_execution.get("quantum_result")
    if isinstance(quantum_result, dict):
        summary_quantum_execution["quantum_result"] = {
            key: value
            for key, value in quantum_result.items()
            if key not in {"probabilities", "statevector", "reduced_density_matrices"}
        }
        summary_quantum_execution["quantum_result"]["probabilities"] = None
        summary_quantum_execution["quantum_result"]["statevector"] = None
        summary_quantum_execution["quantum_result"]["reduced_density_matrices"] = None

    summary_payload["quantum_execution"] = summary_quantum_execution
    return summary_payload


def _attach_financial_comparison_report(payload: dict[str, Any]) -> dict[str, Any]:
    existing = payload.get("comparison_report")
    if isinstance(existing, dict):
        return payload

    payload_with_report = dict(payload)
    payload_with_report["comparison_report"] = build_financial_comparison_report(
        payload_with_report
    )
    return payload_with_report


def _config_from_record(record: FinancialJobRecord) -> PortfolioOptimizationConfig:
    payload = record.result_payload or {}
    request = payload.get("request")
    if not isinstance(request, dict):
        return PortfolioOptimizationConfig()

    budget = request.get("budget")
    return PortfolioOptimizationConfig(
        budget=int(budget) if isinstance(budget, int) else None,
        risk_aversion=float(request.get("risk_aversion", 0.5)),
        max_assets_considered=int(request.get("max_assets_considered", 6)),
        date_column=_to_optional_string(request.get("date_column")),
        ticker_column=_to_optional_string(request.get("ticker_column")),
        value_column=_to_optional_string(request.get("value_column")),
        value_mode=str(request.get("value_mode", "auto")),
        qaoa_reps=int(request.get("qaoa_reps", 1)),
        parameter_search_steps=int(request.get("parameter_search_steps", 9)),
    )


def _to_optional_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


async def _ensure_platform_user(session: Any, user_id: str) -> None:
    existing = await session.get(PlatformUserRecord, user_id)
    if existing is not None:
        return
    session.add(
        PlatformUserRecord(
            id=user_id,
            external_subject=f"local|{user_id}",
            email=f"{user_id}@local.dev",
            display_name=user_id,
            is_active=True,
        )
    )
    await session.flush()
