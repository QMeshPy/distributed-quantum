"""Parity-focused services for backend-v2 circuit and finance endpoints.

These services replace the placeholder in-memory router state with durable
Postgres-backed records while backend-v2 finishes its native execution stack.
"""

from __future__ import annotations

import csv
import io
import statistics
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from sqlalchemy import select

from quantum_backend_v2.api.routers.service_quality import ServiceQualityTracker
from quantum_backend_v2.discovery.service import DiscoveryService
from quantum_backend_v2.libp2p import Libp2pRuntime
from quantum_backend_v2.persistence.postgres import (
    ExecutionPlanRecord,
    FinancialJobRecord,
    PlatformUserRecord,
    WorkflowRunRecord,
)


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


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _load_backend_bridge() -> dict[str, Any]:
    backend_src = _repo_root() / "backend" / "src"
    backend_src_str = str(backend_src)
    if backend_src_str not in sys.path:
        sys.path.insert(0, backend_src_str)

    from quantum_coordinator.planning.dag import build_operation_dependencies, topological_order
    from quantum_coordinator.planning.fragments import build_fragments
    from quantum_coordinator.planning.models import (
        CandidateScore,
        ExecutionPlan,
        FragmentAssignment,
    )
    from quantum_coordinator.planning.parser import (
        CircuitNormalizationError,
        normalize_circuit_input,
    )
    from quantum_coordinator.runtime.models import (
        FragmentExecutionResult,
        FragmentExecutionStatus,
    )
    from quantum_coordinator.runtime.qiskit_results import build_quantum_result

    return {
        "CandidateScore": CandidateScore,
        "CircuitNormalizationError": CircuitNormalizationError,
        "ExecutionPlan": ExecutionPlan,
        "FragmentAssignment": FragmentAssignment,
        "FragmentExecutionResult": FragmentExecutionResult,
        "FragmentExecutionStatus": FragmentExecutionStatus,
        "build_fragments": build_fragments,
        "build_operation_dependencies": build_operation_dependencies,
        "build_quantum_result": build_quantum_result,
        "normalize_circuit_input": normalize_circuit_input,
        "topological_order": topological_order,
    }


def sanitize_json(value: Any) -> Any:
    """Convert runtime values into JSON-friendly payloads."""
    if isinstance(value, dict):
        return {str(key): sanitize_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [sanitize_json(item) for item in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, complex):
        return {"real": value.real, "imag": value.imag}
    return value


@dataclass(frozen=True)
class ServiceCandidate:
    node_id: str
    fidelity: float


class CircuitJobService:
    """Durable circuit job submission, planning, and execution bridge."""

    def __init__(
        self,
        *,
        session_factory: Any,
        discovery_service: DiscoveryService,
        libp2p_runtime: Libp2pRuntime,
    ) -> None:
        if session_factory is None:
            raise RuntimeError("CircuitJobService requires a configured Postgres session factory")
        self._session_factory = session_factory
        self._discovery_service = discovery_service
        self._libp2p_runtime = libp2p_runtime
        self._quality = ServiceQualityTracker()
        self._bridge = _load_backend_bridge()

    async def submit(
        self,
        *,
        circuit_text: str,
        owner_user_id: str,
    ) -> WorkflowRunRecord:
        job_id = f"job-{uuid.uuid4()}"
        now = _utc_now()
        async with self._session_factory() as session:
            await self._ensure_platform_user(session, owner_user_id)
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
        try:
            plan = self._compile_plan(record.input_snapshot.get("circuit", ""))
            plan_payload = self.serialize_plan(plan)

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

            fragment_result_type = self._bridge["FragmentExecutionResult"]
            fragment_status_type = self._bridge["FragmentExecutionStatus"]

            runtime_fragment_results = []
            for index, fragment_id in enumerate(plan.fragment_order, start=1):
                fragment = plan.fragments[fragment_id]
                assignment = plan.assignments[fragment_id]
                started_at = _utc_now()
                finished_at = _utc_now()
                fidelity = self._quality.get_service_fidelity(
                    fragment.service_type.value,
                    peer_id=assignment.primary_node_id,
                )
                fragment_result = fragment_result_type(
                    fragment_id=fragment.fragment_id,
                    node_id=assignment.primary_node_id,
                    status=fragment_status_type.SUCCESS,
                    attempts=1,
                    started_at=started_at,
                    finished_at=finished_at,
                    observed_fidelity=fidelity,
                    error=None,
                )
                runtime_fragment_results.append(fragment_result)
                partial_results.append(self.serialize_fragment_result(fragment_result))

                async with self._session_factory() as session:
                    record = await session.get(WorkflowRunRecord, job_id)
                    if record is None:
                        return
                    record.completed_fragments = index
                    record.output_snapshot = {
                        "fragment_results": partial_results,
                        "latest_event_at": finished_at.isoformat(),
                    }
                    await session.commit()

            quantum_result = sanitize_json(
                self._bridge["build_quantum_result"](
                    plan,
                    fragment_results=tuple(runtime_fragment_results),
                )
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
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_job(self, job_id: str) -> WorkflowRunRecord | None:
        async with self._session_factory() as session:
            return await session.get(WorkflowRunRecord, job_id)

    async def get_plan(self, plan_id: str) -> ExecutionPlanRecord | None:
        async with self._session_factory() as session:
            return await session.get(ExecutionPlanRecord, plan_id)

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

    def serialize_plan(self, plan: Any) -> dict[str, Any]:
        return {
            "plan_id": plan.plan_id,
            "fragment_order": list(plan.fragment_order),
            "fragments": {
                fragment_id: {
                    "fragment_id": fragment.fragment_id,
                    "service_type": fragment.service_type.value,
                    "qubits": list(fragment.qubits),
                    "operation_ids": list(fragment.operation_ids),
                    "dependencies": list(fragment.dependencies),
                }
                for fragment_id, fragment in plan.fragments.items()
            },
            "assignments": {
                fragment_id: {
                    "fragment_id": assignment.fragment_id,
                    "primary_node_id": assignment.primary_node_id,
                    "fallback_node_ids": list(assignment.fallback_node_ids),
                    "candidates": [
                        {
                            "node_id": candidate.node_id,
                            "total_cost": candidate.total_cost,
                            "latency_cost": candidate.latency_cost,
                            "failure_risk_cost": candidate.failure_risk_cost,
                            "entanglement_cost": candidate.entanglement_cost,
                            "load_cost": candidate.load_cost,
                            "fidelity": candidate.fidelity,
                        }
                        for candidate in assignment.candidates
                    ],
                }
                for fragment_id, assignment in plan.assignments.items()
            },
            "quality_snapshot_id": plan.quality_snapshot_id,
        }

    def serialize_fragment_result(self, fragment_result: Any) -> dict[str, Any]:
        return {
            "fragment_id": fragment_result.fragment_id,
            "node_id": fragment_result.node_id,
            "status": fragment_result.status.value,
            "started_at": fragment_result.started_at.isoformat(),
            "finished_at": fragment_result.finished_at.isoformat(),
            "attempts": fragment_result.attempts,
            "error": fragment_result.error,
            "observed_fidelity": fragment_result.observed_fidelity,
        }

    def _compile_plan(self, circuit_text: str) -> Any:
        normalize_circuit_input = self._bridge["normalize_circuit_input"]
        build_operation_dependencies = self._bridge["build_operation_dependencies"]
        build_fragments = self._bridge["build_fragments"]
        topological_order = self._bridge["topological_order"]
        candidate_score_type = self._bridge["CandidateScore"]
        assignment_type = self._bridge["FragmentAssignment"]
        execution_plan_type = self._bridge["ExecutionPlan"]

        circuit = normalize_circuit_input(circuit_text)
        dependencies = build_operation_dependencies(circuit)
        fragments = build_fragments(circuit, dependencies)
        fragment_order = topological_order(
            {
                fragment_id: fragment.dependencies
                for fragment_id, fragment in fragments.items()
            }
        )

        assignments = {}
        for fragment_id in fragment_order:
            fragment = fragments[fragment_id]
            candidates = self._candidates_for_service(fragment.service_type.value)
            if not candidates:
                raise RuntimeError(
                    "No available service provider for "
                    f"{fragment.fragment_id} ({fragment.service_type.value})"
                )

            scored_candidates = tuple(
                candidate_score_type(
                    node_id=candidate.node_id,
                    total_cost=round(1.0 - candidate.fidelity, 6),
                    latency_cost=0.0,
                    failure_risk_cost=round(1.0 - candidate.fidelity, 6),
                    entanglement_cost=0.0,
                    load_cost=0.0,
                    fidelity=candidate.fidelity,
                )
                for candidate in candidates
            )
            primary = scored_candidates[0]
            fallbacks = tuple(
                candidate.node_id for candidate in scored_candidates[1:3]
            )
            assignments[fragment_id] = assignment_type(
                fragment_id=fragment.fragment_id,
                primary_node_id=primary.node_id,
                fallback_node_ids=fallbacks,
                candidates=scored_candidates,
            )

        return execution_plan_type(
            plan_id=f"plan-{uuid.uuid4()}",
            fragment_order=fragment_order,
            fragments=fragments,
            assignments=assignments,
            quality_snapshot_id=f"quality-{_utc_now().isoformat()}",
        )

    def _candidates_for_service(self, service_type: str) -> list[ServiceCandidate]:
        candidates: list[ServiceCandidate] = []
        registry = self._discovery_service.registry
        for peer in registry.list_peers(include_stale=False):
            if peer.health_status != "healthy":
                continue
            if service_type not in peer.service_ids:
                continue
            candidates.append(
                ServiceCandidate(
                    node_id=peer.peer_id,
                    fidelity=self._quality.get_service_fidelity(
                        service_type, peer_id=peer.peer_id
                    ),
                )
            )

        if not candidates:
            local_peer_id = str(self._libp2p_runtime.host.get_id())
            candidates.append(
                ServiceCandidate(
                    node_id=local_peer_id,
                    fidelity=self._quality.get_service_fidelity(
                        service_type,
                        peer_id=local_peer_id,
                    ),
                )
            )

        return sorted(candidates, key=lambda candidate: (-candidate.fidelity, candidate.node_id))

    async def _ensure_platform_user(self, session: Any, user_id: str) -> None:
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


class FinancialJobService:
    """Durable CSV analysis job service."""

    def __init__(self, *, session_factory: Any) -> None:
        if session_factory is None:
            raise RuntimeError("FinancialJobService requires a configured Postgres session factory")
        self._session_factory = session_factory

    async def submit(
        self,
        *,
        filename: str,
        owner_user_id: str | None,
    ) -> FinancialJobRecord:
        job_id = f"fin-{uuid.uuid4()}"
        async with self._session_factory() as session:
            if owner_user_id is not None:
                await self._ensure_platform_user(session, owner_user_id)
            record = FinancialJobRecord(
                id=job_id,
                owner_user_id=owner_user_id,
                filename=filename,
                status=_FIN_STATUS_INGESTING,
                row_count=None,
                col_count=None,
                error=None,
                result_payload=None,
            )
            session.add(record)
            await session.commit()
            await session.refresh(record)
            return record

    async def process(self, *, job_id: str, csv_bytes: bytes) -> None:
        async with self._session_factory() as session:
            record = await session.get(FinancialJobRecord, job_id)
            if record is None or record.status in _TERMINAL_FINANCIAL_STATUSES:
                return
            record.status = _FIN_STATUS_ANALYZING
            await session.commit()

        try:
            result_payload = self._analyse_csv(csv_bytes)
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

    async def get_job(self, job_id: str) -> FinancialJobRecord | None:
        async with self._session_factory() as session:
            return await session.get(FinancialJobRecord, job_id)

    async def list_jobs(self, *, limit: int) -> list[FinancialJobRecord]:
        async with self._session_factory() as session:
            stmt = (
                select(FinancialJobRecord)
                .order_by(FinancialJobRecord.created_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    def _analyse_csv(self, csv_bytes: bytes) -> dict[str, Any]:
        text = csv_bytes.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []
        rows = [dict(row) for row in reader]

        numeric_columns: list[str] = []
        categorical_columns: list[str] = []
        column_profiles: dict[str, dict[str, Any]] = {}

        for header in headers:
            values = [row.get(header, "") for row in rows]
            numeric_values = [_coerce_number(value) for value in values if str(value).strip()]
            parsed_numeric_values = [value for value in numeric_values if value is not None]
            is_numeric = bool(parsed_numeric_values) and len(parsed_numeric_values) >= max(
                1, len([value for value in values if str(value).strip()]) // 2
            )

            if is_numeric:
                numeric_columns.append(header)
                column_profiles[header] = {
                    "kind": "numeric",
                    "count": len(parsed_numeric_values),
                    "min": min(parsed_numeric_values),
                    "max": max(parsed_numeric_values),
                    "mean": statistics.fmean(parsed_numeric_values),
                }
            else:
                categorical_columns.append(header)
                unique_values = sorted(
                    {str(value).strip() for value in values if str(value).strip()}
                )
                column_profiles[header] = {
                    "kind": "categorical",
                    "count": len(unique_values),
                    "sample_values": unique_values[:5],
                }

        row_count = len(rows)
        col_count = len(headers)

        return {
            "summary": f"Processed {row_count} rows across {col_count} columns.",
            "row_count": row_count,
            "col_count": col_count,
            "numeric_columns": numeric_columns,
            "categorical_columns": categorical_columns,
            "column_profiles": column_profiles,
            "quantum_advantage_detected": False,
        }

    async def _ensure_platform_user(self, session: Any, user_id: str) -> None:
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


def _coerce_number(value: str | None) -> float | None:
    if value is None:
        return None
    normalized = value.replace(",", "").replace("$", "").replace("%", "").strip()
    if not normalized:
        return None
    try:
        return float(normalized)
    except ValueError:
        return None
