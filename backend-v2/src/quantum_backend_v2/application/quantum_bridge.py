"""Shared planning and distributed execution bridge for QASM-backed workflows."""

from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, AsyncIterator

from quantum_backend_v2.api.routers.service_quality import ServiceQualityTracker
from quantum_backend_v2.application.distributed_statevector import (
    fidelity_between_handoffs,
    make_initial_state_handoff,
    summarize_state_handoff,
)
from quantum_backend_v2.discovery.service import DiscoveryService
from quantum_backend_v2.libp2p import Libp2pRuntime
from quantum_backend_v2.libp2p.protocol_ids import build_execution_protocol_ids
from quantum_backend_v2.protocols.execution import (
    DistributedStateHandoff,
    ExecutionResultPayload,
    ExecutionTransition,
    FragmentDescriptor,
    FragmentDispatchInput,
    FragmentDispatchOutput,
    FragmentDispatchRequest,
)
from quantum_backend_v2.protocols.reservation import (
    ReservationCancelRequest,
    ReservationCommitRequest,
    ReservationCommitResponse,
    ReservationPrepareRequest,
    ReservationPrepareResponse,
    ReservationTransition,
)
from quantum_backend_v2.reservations.service import ReservationService
from quantum_backend_v2.runtime.service import ExecutionService


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
        return _format_complex(value)
    return value


def _format_complex(value: complex) -> str:
    real = round(value.real, 12)
    imag = round(value.imag, 12)

    if imag == 0:
        return f"{real}"
    if real == 0:
        return f"{imag}j"
    sign = "+" if imag >= 0 else "-"
    return f"{real}{sign}{abs(imag)}j"


@dataclass(frozen=True)
class ServiceCandidate:
    node_id: str
    fidelity: float
    active_reservations: int
    active_executions: int
    network_addresses: tuple[str, ...]


@dataclass(frozen=True)
class DistributedFragmentExecution:
    fragment_result: Any
    reservation_id: str
    execution_id: str
    output: FragmentDispatchOutput
    state: DistributedStateHandoff
    incoming_state_peer_id: str | None


class QuantumExecutionBridge:
    """Compile QASM, assign fragments, and execute them over real libp2p RPC."""

    def __init__(
        self,
        *,
        discovery_service: DiscoveryService,
        libp2p_runtime: Libp2pRuntime,
        reservation_service: ReservationService | None = None,
        execution_service: ExecutionService | None = None,
    ) -> None:
        self._discovery_service = discovery_service
        self._libp2p_runtime = libp2p_runtime
        self._reservation_service = reservation_service
        self._execution_service = execution_service
        self._quality = ServiceQualityTracker()
        self._bridge = _load_backend_bridge()
        self._protocol_ids = build_execution_protocol_ids(
            libp2p_runtime.settings.rendezvous_namespace
        )

    async def wait_for_service_peers(self, *, timeout_seconds: float = 10.0) -> None:
        """Wait for the configured service peers to appear before planning."""
        await self._discovery_service.wait_for_service_peers(timeout_seconds=timeout_seconds)

    def compile_plan(self, circuit_text: str) -> Any:
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

        assignments: dict[str, Any] = {}
        planned_node_load: dict[str, int] = {}
        for fragment_id in fragment_order:
            fragment = fragments[fragment_id]
            candidates = self._candidates_for_service(fragment.service_type.value)
            if not candidates:
                raise RuntimeError(
                    "No available service provider for "
                    f"{fragment.fragment_id} ({fragment.service_type.value})"
                )

            dependency_nodes = {
                assignments[dependency_id].primary_node_id
                for dependency_id in fragment.dependencies
                if dependency_id in assignments
            }
            max_live_load = max(
                candidate.active_reservations + candidate.active_executions
                for candidate in candidates
            )
            scored_candidates = tuple(
                candidate_score_type(
                    node_id=candidate.node_id,
                    total_cost=self._total_cost(
                        node_id=candidate.node_id,
                        fidelity=candidate.fidelity,
                        dependency_nodes=dependency_nodes,
                        live_load=candidate.active_reservations + candidate.active_executions,
                        max_live_load=max_live_load,
                        planned_load=planned_node_load.get(candidate.node_id, 0),
                    ),
                    latency_cost=0.0,
                    failure_risk_cost=round(1.0 - candidate.fidelity, 6),
                    entanglement_cost=self._entanglement_cost(
                        candidate.node_id,
                        dependency_nodes,
                    ),
                    load_cost=self._load_cost(
                        live_load=candidate.active_reservations + candidate.active_executions,
                        max_live_load=max_live_load,
                        planned_load=planned_node_load.get(candidate.node_id, 0),
                    ),
                    fidelity=candidate.fidelity,
                )
                for candidate in candidates
            )
            ordered_candidates = tuple(
                sorted(
                    scored_candidates,
                    key=lambda candidate: (
                        candidate.total_cost,
                        candidate.load_cost,
                        -candidate.fidelity,
                        candidate.node_id,
                    ),
                )
            )
            primary = ordered_candidates[0]
            planned_node_load[primary.node_id] = planned_node_load.get(primary.node_id, 0) + 1
            fallbacks = tuple(candidate.node_id for candidate in ordered_candidates[1:4])
            assignments[fragment_id] = assignment_type(
                fragment_id=fragment.fragment_id,
                primary_node_id=primary.node_id,
                fallback_node_ids=fallbacks,
                candidates=ordered_candidates,
            )

        return execution_plan_type(
            plan_id=f"plan-{uuid.uuid4()}",
            fragment_order=fragment_order,
            fragments=fragments,
            assignments=assignments,
            quality_snapshot_id=f"quality-{_utc_now().isoformat()}",
        )

    async def iter_fragment_executions(
        self,
        *,
        workflow_run_id: str,
        plan: Any,
    ) -> AsyncIterator[DistributedFragmentExecution]:
        fragment_result_type = self._bridge["FragmentExecutionResult"]
        fragment_status_type = self._bridge["FragmentExecutionStatus"]
        state = make_initial_state_handoff(self._infer_num_qubits(plan))

        for fragment_id in plan.fragment_order:
            fragment = plan.fragments[fragment_id]
            assignment = plan.assignments[fragment_id]
            execution = await self._execute_fragment(
                workflow_run_id=workflow_run_id,
                plan_id=plan.plan_id,
                fragment=fragment,
                assignment=assignment,
                state=state,
                fragment_result_type=fragment_result_type,
                fragment_status_type=fragment_status_type,
            )
            state = execution.state
            yield execution

    def build_quantum_result(
        self,
        *,
        plan: Any,
        fragment_results: tuple[Any, ...],
        final_state: DistributedStateHandoff | None = None,
    ) -> dict[str, Any]:
        raw_result = self._bridge["build_quantum_result"](
            plan,
            fragment_results=fragment_results,
        )
        serialized = sanitize_json(raw_result)
        if final_state is None:
            return serialized

        remote_summary = summarize_state_handoff(final_state)
        serialized.update(remote_summary)
        serialized["distributed_execution"] = {
            "execution_mode": "remote_fragment_state_handoff",
            "last_peer_id": final_state.previous_peer_id,
            "validation_statevector_fidelity": self._validation_fidelity(
                raw_statevector=raw_result.get("statevector"),
                final_state=final_state,
            ),
            "measured_qubits": list(final_state.measured_qubits),
        }
        return serialized

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

    def serialize_fragment_result(
        self,
        fragment_result: Any,
        *,
        execution: DistributedFragmentExecution | None = None,
    ) -> dict[str, Any]:
        payload = {
            "fragment_id": fragment_result.fragment_id,
            "node_id": fragment_result.node_id,
            "status": fragment_result.status.value,
            "started_at": fragment_result.started_at.isoformat(),
            "finished_at": fragment_result.finished_at.isoformat(),
            "attempts": fragment_result.attempts,
            "error": fragment_result.error,
            "observed_fidelity": fragment_result.observed_fidelity,
        }
        if execution is not None:
            payload.update(
                {
                    "reservation_id": execution.reservation_id,
                    "execution_id": execution.execution_id,
                    "state_handoff_from_node_id": execution.incoming_state_peer_id,
                    "state_transfer_bytes": execution.output.state_transfer_bytes,
                    "gate_count": execution.output.gate_count,
                    "circuit_depth": execution.output.circuit_depth,
                    "distributed_execution": True,
                }
            )
        return payload

    async def _execute_fragment(
        self,
        *,
        workflow_run_id: str,
        plan_id: str,
        fragment: Any,
        assignment: Any,
        state: DistributedStateHandoff,
        fragment_result_type: Any,
        fragment_status_type: Any,
    ) -> DistributedFragmentExecution:
        candidate_node_ids = [assignment.primary_node_id, *assignment.fallback_node_ids]
        last_error: str | None = None

        for attempt_index, node_id in enumerate(candidate_node_ids, start=1):
            peer = self._discovery_service.registry.get_peer(node_id)
            peer_addresses = tuple(peer.network_addresses) if peer is not None else ()
            reservation_id = f"res-{uuid.uuid4()}"
            execution_id = f"exec-{uuid.uuid4()}"
            prepare_request = ReservationPrepareRequest(
                reservation_id=reservation_id,
                workflow_run_id=workflow_run_id,
                fragment_id=fragment.fragment_id,
                requesting_peer_id=str(self._libp2p_runtime.host.get_id()),
                service_id=fragment.service_type.value,
                estimated_qubits=max(1, len(fragment.qubits)),
                estimated_depth=max(1, len(fragment.operation_ids)),
                idempotency_key=uuid.uuid4().hex,
            )
            if self._reservation_service is not None:
                await self._reservation_service.request(
                    reservation_id=reservation_id,
                    workflow_run_id=workflow_run_id,
                    fragment_id=fragment.fragment_id,
                    service_id=fragment.service_type.value,
                    requesting_peer_id=str(self._libp2p_runtime.host.get_id()),
                    ttl_seconds=prepare_request.ttl_seconds,
                    idempotency_key=prepare_request.idempotency_key,
                )

            prepare_response = ReservationPrepareResponse.model_validate_json(
                await self._discovery_service.request_peer_rpc(
                    peer_id=node_id,
                    protocol_id=self._protocol_ids.reservation_prepare,
                    payload=prepare_request.model_dump_json().encode("utf-8"),
                    peer_addresses=peer_addresses,
                )
            )
            if prepare_response.transition not in {
                ReservationTransition.ACCEPTED,
                ReservationTransition.COMMITTED,
            }:
                last_error = prepare_response.reason or (
                    f"reservation {prepare_response.transition.value}"
                )
                if self._reservation_service is not None:
                    await self._reservation_service.reject(
                        reservation_id=reservation_id,
                        reason=last_error,
                        accepting_peer_id=node_id,
                    )
                continue

            if self._reservation_service is not None:
                await self._reservation_service.accept(
                    reservation_id=reservation_id,
                    accepting_peer_id=node_id,
                )

            if prepare_response.transition != ReservationTransition.COMMITTED:
                commit_response = ReservationCommitResponse.model_validate_json(
                    await self._discovery_service.request_peer_rpc(
                        peer_id=node_id,
                        protocol_id=self._protocol_ids.reservation_commit,
                        payload=ReservationCommitRequest(
                            reservation_id=reservation_id,
                            workflow_run_id=workflow_run_id,
                            fragment_id=fragment.fragment_id,
                        ).model_dump_json().encode("utf-8"),
                        peer_addresses=peer_addresses,
                    )
                )
                if commit_response.transition != ReservationTransition.COMMITTED:
                    last_error = (
                        "reservation commit failed "
                        f"with {commit_response.transition.value}"
                    )
                    await self._discovery_service.request_peer_rpc(
                        peer_id=node_id,
                        protocol_id=self._protocol_ids.reservation_cancel,
                        payload=ReservationCancelRequest(
                            reservation_id=reservation_id,
                            reason=last_error,
                        ).model_dump_json().encode("utf-8"),
                        peer_addresses=peer_addresses,
                    )
                    if self._reservation_service is not None:
                        await self._reservation_service.cancel(
                            reservation_id=reservation_id,
                            reason=last_error,
                        )
                    continue

            if self._reservation_service is not None:
                await self._reservation_service.commit(reservation_id=reservation_id)

            dispatch_input = FragmentDispatchInput(
                plan_id=plan_id,
                fragment=FragmentDescriptor(
                    fragment_id=fragment.fragment_id,
                    service_id=fragment.service_type.value,
                    qubits=tuple(fragment.qubits),
                    operation_ids=tuple(fragment.operation_ids),
                    dependencies=tuple(fragment.dependencies),
                    raw_text=fragment.raw_text,
                ),
                state=state,
            )
            dispatch_request = FragmentDispatchRequest(
                execution_id=execution_id,
                reservation_id=reservation_id,
                workflow_run_id=workflow_run_id,
                fragment_id=fragment.fragment_id,
                service_id=fragment.service_type.value,
                input_payload=dispatch_input.model_dump(mode="json"),
                idempotency_key=uuid.uuid4().hex,
            )
            started_at = _utc_now()
            if self._execution_service is not None:
                await self._execution_service.dispatch(
                    execution_id=execution_id,
                    reservation_id=reservation_id,
                    workflow_run_id=workflow_run_id,
                    fragment_id=fragment.fragment_id,
                    service_id=fragment.service_type.value,
                    executing_peer_id=node_id,
                    idempotency_key=dispatch_request.idempotency_key,
                )
                await self._execution_service.record_running(execution_id=execution_id)

            dispatch_response = ExecutionResultPayload.model_validate_json(
                await self._discovery_service.request_peer_rpc(
                    peer_id=node_id,
                    protocol_id=self._protocol_ids.fragment_dispatch,
                    payload=dispatch_request.model_dump_json().encode("utf-8"),
                    peer_addresses=peer_addresses,
                )
            )
            if dispatch_response.transition != ExecutionTransition.COMPLETED:
                last_error = dispatch_response.error_detail or "fragment execution failed"
                if self._execution_service is not None:
                    await self._execution_service.record_failed(
                        execution_id=execution_id,
                        error_detail=last_error,
                    )
                continue

            if self._execution_service is not None:
                await self._execution_service.record_completed(
                    execution_id=execution_id,
                    fidelity_score=dispatch_response.fidelity_score,
                    latency_ms=dispatch_response.latency_ms,
                )

            if dispatch_response.fidelity_score is not None:
                self._quality.update_peer_fidelity(node_id, dispatch_response.fidelity_score)

            output = FragmentDispatchOutput.model_validate(dispatch_response.output_payload)
            fragment_result = fragment_result_type(
                fragment_id=fragment.fragment_id,
                node_id=node_id,
                status=fragment_status_type.SUCCESS,
                attempts=attempt_index,
                started_at=started_at,
                finished_at=dispatch_response.completed_at,
                observed_fidelity=dispatch_response.fidelity_score,
                error=None,
            )
            return DistributedFragmentExecution(
                fragment_result=fragment_result,
                reservation_id=reservation_id,
                execution_id=execution_id,
                output=output,
                state=output.state,
                incoming_state_peer_id=state.previous_peer_id,
            )

        raise RuntimeError(
            f"Fragment {fragment.fragment_id} failed across all assigned peers: {last_error}"
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
                        service_type,
                        peer_id=peer.peer_id,
                    ),
                    active_reservations=peer.active_reservations,
                    active_executions=peer.active_executions,
                    network_addresses=tuple(peer.network_addresses),
                )
            )

        if not candidates and self._libp2p_runtime.settings.dev_service_peer_count <= 0:
            local_peer_id = str(self._libp2p_runtime.host.get_id())
            candidates.append(
                ServiceCandidate(
                    node_id=local_peer_id,
                    fidelity=self._quality.get_service_fidelity(
                        service_type,
                        peer_id=local_peer_id,
                    ),
                    active_reservations=0,
                    active_executions=0,
                    network_addresses=tuple(),
                )
            )

        return candidates

    def _infer_num_qubits(self, plan: Any) -> int:
        highest_qubit = max(
            (
                qubit
                for fragment in plan.fragments.values()
                for qubit in fragment.qubits
            ),
            default=0,
        )
        return highest_qubit + 1

    def _load_cost(
        self,
        *,
        live_load: int,
        max_live_load: int,
        planned_load: int,
    ) -> float:
        denominator = max(1, max_live_load + 1)
        return round((live_load + planned_load) / denominator, 6)

    def _entanglement_cost(
        self,
        node_id: str,
        dependency_nodes: set[str],
    ) -> float:
        if not dependency_nodes:
            return 0.0
        if node_id in dependency_nodes:
            return 0.0
        return round(min(1.0, 0.15 * len(dependency_nodes)), 6)

    def _total_cost(
        self,
        *,
        node_id: str,
        fidelity: float,
        dependency_nodes: set[str],
        live_load: int,
        max_live_load: int,
        planned_load: int,
    ) -> float:
        failure_risk_cost = 1.0 - fidelity
        entanglement_cost = self._entanglement_cost(node_id, dependency_nodes)
        load_cost = self._load_cost(
            live_load=live_load,
            max_live_load=max_live_load,
            planned_load=planned_load,
        )
        return round(
            (failure_risk_cost * 0.55)
            + (entanglement_cost * 0.15)
            + (load_cost * 0.30),
            6,
        )

    def _validation_fidelity(
        self,
        *,
        raw_statevector: Any,
        final_state: DistributedStateHandoff,
    ) -> float | None:
        if not isinstance(raw_statevector, list):
            return None
        analytic_state = DistributedStateHandoff(
            num_qubits=final_state.num_qubits,
            amplitudes=tuple(_format_complex(complex(value)) for value in raw_statevector),
            measured_qubits=final_state.measured_qubits,
        )
        return round(fidelity_between_handoffs(final_state, analytic_state), 12)
