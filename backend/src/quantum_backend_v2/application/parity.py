"""Durable parity services for circuit and finance endpoints."""

from __future__ import annotations

import copy
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from quantum_backend_v2.application.financial_portfolio import (
    PortfolioOptimizationConfig,
    build_portfolio_optimization_artifacts,
)
from quantum_backend_v2.application.financial_comparison import (
    build_financial_comparison_report,
)
from quantum_backend_v2.application.quantum_bridge import QuantumExecutionBridge
from quantum_backend_v2.identity.models import UserTokenClaims
from quantum_backend_v2.persistence.mongodb import (
    ExecutionPlanDocument,
    FinancialJobDocument,
    OptionsJobDocument,
    PlatformUserDocument,
    RiskJobDocument,
    WorkflowRunDocument,
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

_OPT_STATUS_QUEUED = "queued"
_OPT_STATUS_RUNNING = "running"
_OPT_STATUS_COMPLETED = "completed"
_OPT_STATUS_FAILED = "failed"
_TERMINAL_OPTIONS_STATUSES = {_OPT_STATUS_COMPLETED, _OPT_STATUS_FAILED}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CircuitJobService:
    """Durable circuit job submission, planning, and execution bridge."""

    def __init__(
        self,
        *,
        discovery_service: Any,
        libp2p_runtime: Any,
    ) -> None:
        reservation_service = ReservationService()
        execution_service = ExecutionService()
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
    ) -> WorkflowRunDocument:
        job_id = f"job-{uuid.uuid4()}"
        now = _utc_now()
        await _ensure_platform_user(owner_user_id)
        doc = WorkflowRunDocument(
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
        await doc.insert()
        return doc

    async def process(self, job_id: str) -> None:
        doc = await WorkflowRunDocument.get(job_id)
        if doc is None or doc.status in _TERMINAL_JOB_STATUSES:
            return

        doc.status = _STATUS_COMPILING
        doc.started_at = doc.started_at or _utc_now()
        doc.output_snapshot = {}
        doc.updated_at = _utc_now()
        await doc.save()

        partial_results: list[dict[str, Any]] = []
        runtime_fragment_results: list[Any] = []
        final_state = None
        try:
            circuit_text = str(doc.input_snapshot.get("circuit", ""))
            await self._quantum_bridge.wait_for_service_peers()
            plan = self._quantum_bridge.compile_plan(circuit_text)
            plan_payload = self._quantum_bridge.serialize_plan(plan)

            plan_doc = ExecutionPlanDocument(
                id=plan.plan_id,
                workflow_run_id=job_id,
                payload=plan_payload,
            )
            await plan_doc.insert()

            doc = await WorkflowRunDocument.get(job_id)
            if doc is None:
                return
            doc.artifact_bundle_id = plan.plan_id
            doc.status = _STATUS_EXECUTING
            doc.fragment_count = len(plan.fragment_order)
            doc.completed_fragments = 0
            doc.failed_fragments = 0
            doc.output_snapshot = {}
            doc.updated_at = _utc_now()
            await doc.save()

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

                doc = await WorkflowRunDocument.get(job_id)
                if doc is None:
                    return
                doc.completed_fragments = index
                doc.output_snapshot = {
                    "fragment_results": partial_results,
                    "latest_event_at": serialized_result["finished_at"],
                }
                doc.updated_at = _utc_now()
                await doc.save()

            quantum_result = self._quantum_bridge.build_quantum_result(
                plan=plan,
                fragment_results=tuple(runtime_fragment_results),
                final_state=final_state,
            )

            doc = await WorkflowRunDocument.get(job_id)
            if doc is None:
                return
            doc.status = _STATUS_COMPLETED
            doc.completed_at = _utc_now()
            doc.output_snapshot = {
                "fragment_results": partial_results,
                "latest_event_at": _utc_now().isoformat(),
                "result": {
                    "job_id": job_id,
                    "fragment_results": partial_results,
                    "quantum_result": quantum_result,
                },
            }
            doc.updated_at = _utc_now()
            await doc.save()

        except Exception as exc:
            doc = await WorkflowRunDocument.get(job_id)
            if doc is None:
                return
            doc.status = _STATUS_FAILED
            doc.completed_at = _utc_now()
            doc.failed_fragments = max(1, doc.fragment_count - doc.completed_fragments)
            doc.output_snapshot = {
                "error": str(exc),
                "fragment_results": partial_results,
                "latest_event_at": _utc_now().isoformat(),
            }
            doc.updated_at = _utc_now()
            await doc.save()

    async def list_jobs(
        self,
        *,
        current_user: UserTokenClaims,
        limit: int,
        statuses: list[str] | None = None,
    ) -> list[WorkflowRunDocument]:
        query = WorkflowRunDocument.find(
            WorkflowRunDocument.workflow_definition_id == _CIRCUIT_WORKFLOW_DEFINITION_ID
        )
        if statuses:
            query = query.find({"status": {"$in": statuses}})
        if not current_user.is_admin():
            query = query.find(WorkflowRunDocument.owner_user_id == current_user.user_id)
        return await query.sort("-created_at").limit(limit).to_list()

    async def get_job(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> WorkflowRunDocument | None:
        doc = await WorkflowRunDocument.get(job_id)
        if doc is None:
            return None
        if not current_user.is_admin() and doc.owner_user_id != current_user.user_id:
            return None
        return doc

    async def get_plan(
        self,
        plan_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> ExecutionPlanDocument | None:
        plan_doc = await ExecutionPlanDocument.get(plan_id)
        if plan_doc is None:
            return None
        # Verify caller owns the associated workflow run
        run_doc = await WorkflowRunDocument.get(plan_doc.workflow_run_id)
        if run_doc is None:
            return None
        if not current_user.is_admin() and run_doc.owner_user_id != current_user.user_id:
            return None
        return plan_doc

    def get_error(self, doc: WorkflowRunDocument) -> str | None:
        if doc.status == _STATUS_FAILED:
            return str(doc.output_snapshot.get("error", "Unknown error"))
        return None

    def build_progress(self, doc: WorkflowRunDocument) -> dict[str, object] | None:
        if doc.fragment_count == 0:
            return None
        return {
            "total_fragments": doc.fragment_count,
            "completed_fragments": doc.completed_fragments,
            "failed_fragments": doc.failed_fragments,
            "percent_complete": round(doc.completed_fragments / doc.fragment_count * 100, 1),
        }

    def get_result_payload(self, doc: WorkflowRunDocument) -> dict[str, Any] | None:
        if doc.status != _STATUS_COMPLETED:
            return None
        return doc.output_snapshot.get("result") if doc.output_snapshot else None  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Financial analysis service
# ---------------------------------------------------------------------------

class FinancialJobService:
    """Durable Track A financial analysis service."""

    def __init__(
        self,
        *,
        discovery_service: Any,
        libp2p_runtime: Any,
    ) -> None:
        self._discovery_service = discovery_service
        self._libp2p_runtime = libp2p_runtime

    async def submit(
        self,
        *,
        filename: str,
        owner_user_id: str,
        problem_type: str,
        config: PortfolioOptimizationConfig,
    ) -> FinancialJobDocument:
        job_id = f"fin-{uuid.uuid4()}"
        await _ensure_platform_user(owner_user_id)
        doc = FinancialJobDocument(
            id=job_id,
            owner_user_id=owner_user_id,
            filename=filename,
            status=_FIN_STATUS_INGESTING,
            result_payload={"request": _submission_request_snapshot(config)},
        )
        await doc.insert()
        return doc

    async def process(self, *, job_id: str, csv_bytes: bytes) -> None:
        doc = await FinancialJobDocument.get(job_id)
        if doc is None or doc.status in _TERMINAL_FINANCIAL_STATUSES:
            return

        doc.status = _FIN_STATUS_ANALYZING
        doc.updated_at = _utc_now()
        await doc.save()

        try:
            config = _config_from_doc(doc)
            artifacts = build_portfolio_optimization_artifacts(
                csv_bytes=csv_bytes,
                job_id=job_id,
                filename=doc.filename,
                config=config,
            )

            doc = await FinancialJobDocument.get(job_id)
            if doc is None:
                return
            doc.status = _FIN_STATUS_COMPLETED
            doc.row_count = artifacts.payload.get("row_count")
            doc.col_count = artifacts.payload.get("col_count")
            doc.result_payload = artifacts.payload
            doc.updated_at = _utc_now()
            await doc.save()
        except Exception as exc:
            doc = await FinancialJobDocument.get(job_id)
            if doc is None:
                return
            doc.status = _FIN_STATUS_FAILED
            doc.error = str(exc)
            doc.updated_at = _utc_now()
            await doc.save()

    async def get_job(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> FinancialJobDocument | None:
        doc = await FinancialJobDocument.get(job_id)
        if doc is None:
            return None
        if not current_user.is_admin() and doc.owner_user_id != current_user.user_id:
            return None
        return doc

    async def list_jobs(
        self,
        *,
        current_user: UserTokenClaims,
        limit: int = 20,
    ) -> list[FinancialJobDocument]:
        query = FinancialJobDocument.find()
        if not current_user.is_admin():
            query = query.find(FinancialJobDocument.owner_user_id == current_user.user_id)
        return await query.sort("-created_at").limit(limit).to_list()

    def get_problem_type(self, doc: FinancialJobDocument) -> str | None:
        if doc.result_payload and isinstance(doc.result_payload, dict):
            request = doc.result_payload.get("request")
            if isinstance(request, dict):
                return request.get("problem_type")
        return _FINANCIAL_PROBLEM_TYPE

    def get_result_payload(
        self, doc: FinancialJobDocument, *, detail: str = "full"
    ) -> dict[str, Any] | None:
        if doc.status != _FIN_STATUS_COMPLETED or doc.result_payload is None:
            return None
        if detail == "summary":
            return _build_financial_summary_payload(doc.result_payload)
        return doc.result_payload

    def get_comparison_payload(self, doc: FinancialJobDocument) -> dict[str, Any] | None:
        if doc.status != _FIN_STATUS_COMPLETED or doc.result_payload is None:
            return None
        payload = _attach_financial_comparison_report(doc.result_payload)
        comparison_report = payload.get("comparison_report")
        return (
            copy.deepcopy(comparison_report)
            if isinstance(comparison_report, dict)
            else None
        )


# ---------------------------------------------------------------------------
# Options pricing service
# ---------------------------------------------------------------------------

class OptionsJobService:
    """Durable Track C real options pricing service (QAE vs Black-Scholes)."""

    async def submit(
        self,
        *,
        option_type: str,
        owner_user_id: str,
        request_payload: dict[str, Any],
    ) -> OptionsJobDocument:
        job_id = f"opt-{uuid.uuid4()}"
        await _ensure_platform_user(owner_user_id)
        doc = OptionsJobDocument(
            id=job_id,
            owner_user_id=owner_user_id,
            option_type=option_type,
            status=_OPT_STATUS_QUEUED,
        )
        await doc.insert()
        return doc

    async def process(self, *, job_id: str, request_payload: dict[str, Any]) -> None:
        from quantum_backend_v2.application.real_options_pricing import price_options

        doc = await OptionsJobDocument.get(job_id)
        if doc is None or doc.status in _TERMINAL_OPTIONS_STATUSES:
            return
        doc.status = _OPT_STATUS_RUNNING
        doc.updated_at = _utc_now()
        await doc.save()

        try:
            payload_with_id = dict(request_payload)
            payload_with_id["job_id"] = job_id
            result = price_options(payload_with_id)

            doc = await OptionsJobDocument.get(job_id)
            if doc is None:
                return
            doc.status = _OPT_STATUS_COMPLETED
            doc.error = None
            doc.result_payload = result
            doc.updated_at = _utc_now()
            await doc.save()
        except Exception as exc:
            doc = await OptionsJobDocument.get(job_id)
            if doc is None:
                return
            doc.status = _OPT_STATUS_FAILED
            doc.error = str(exc)
            doc.updated_at = _utc_now()
            await doc.save()

    async def get_job(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> OptionsJobDocument | None:
        doc = await OptionsJobDocument.get(job_id)
        if doc is None:
            return None
        if not current_user.is_admin() and doc.owner_user_id != current_user.user_id:
            return None
        return doc

    async def list_jobs(
        self,
        *,
        current_user: UserTokenClaims,
        limit: int = 20,
    ) -> list[OptionsJobDocument]:
        query = OptionsJobDocument.find()
        if not current_user.is_admin():
            query = query.find(OptionsJobDocument.owner_user_id == current_user.user_id)
        return await query.sort("-created_at").limit(limit).to_list()


# ---------------------------------------------------------------------------
# Risk engine service
# ---------------------------------------------------------------------------

_RISK_STATUS_QUEUED = "queued"
_RISK_STATUS_RUNNING = "running"
_RISK_STATUS_COMPLETED = "completed"
_RISK_STATUS_FAILED = "failed"
_TERMINAL_RISK_STATUSES = {_RISK_STATUS_COMPLETED, _RISK_STATUS_FAILED}


class RiskJobService:
    """Durable Track D quantum risk engine service (IQAE VaR/CVaR)."""

    async def submit(
        self,
        *,
        risk_model: str,
        portfolio_size: int,
        owner_user_id: str,
        request_payload: dict[str, Any],
    ) -> RiskJobDocument:
        job_id = f"risk-{uuid.uuid4()}"
        await _ensure_platform_user(owner_user_id)
        doc = RiskJobDocument(
            id=job_id,
            owner_user_id=owner_user_id,
            risk_model=risk_model,
            portfolio_size=portfolio_size,
            status=_RISK_STATUS_QUEUED,
        )
        await doc.insert()
        return doc

    async def process(self, *, job_id: str, request_payload: dict[str, Any]) -> None:
        from quantum_backend_v2.application.risk_engine import price_risk

        doc = await RiskJobDocument.get(job_id)
        if doc is None or doc.status in _TERMINAL_RISK_STATUSES:
            return
        doc.status = _RISK_STATUS_RUNNING
        doc.updated_at = _utc_now()
        await doc.save()

        try:
            payload_with_id = dict(request_payload)
            payload_with_id["job_id"] = job_id
            result = price_risk(payload_with_id)

            doc = await RiskJobDocument.get(job_id)
            if doc is None:
                return
            doc.status = _RISK_STATUS_COMPLETED
            doc.error = None
            doc.result_payload = result
            doc.updated_at = _utc_now()
            await doc.save()
        except Exception as exc:
            doc = await RiskJobDocument.get(job_id)
            if doc is None:
                return
            doc.status = _RISK_STATUS_FAILED
            doc.error = str(exc)
            doc.updated_at = _utc_now()
            await doc.save()

    async def get_job(
        self,
        job_id: str,
        *,
        current_user: UserTokenClaims,
    ) -> RiskJobDocument | None:
        doc = await RiskJobDocument.get(job_id)
        if doc is None:
            return None
        if not current_user.is_admin() and doc.owner_user_id != current_user.user_id:
            return None
        return doc

    async def list_jobs(
        self,
        *,
        current_user: UserTokenClaims,
        limit: int = 20,
    ) -> list[RiskJobDocument]:
        query = RiskJobDocument.find()
        if not current_user.is_admin():
            query = query.find(RiskJobDocument.owner_user_id == current_user.user_id)
        return await query.sort("-created_at").limit(limit).to_list()


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _ensure_platform_user(user_id: str) -> None:
    existing = await PlatformUserDocument.get(user_id)
    if existing is not None:
        return
    await PlatformUserDocument(
        id=user_id,
        external_subject=f"local|{user_id}",
        email=f"{user_id}@local.dev",
        display_name=user_id,
        is_active=True,
    ).insert()


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


def _config_from_doc(doc: FinancialJobDocument) -> PortfolioOptimizationConfig:
    payload = doc.result_payload or {}
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
