"""Shared planning and distributed execution bridge for QASM-backed workflows."""

from __future__ import annotations

import asyncio
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, AsyncIterator

from quantum_backend_v2.api.routers.service_quality import ServiceQualityTracker
from quantum_backend_v2.application.distributed_statevector import (
    combine_handoffs,
    fidelity_between_handoffs,
    handoff_qubit_ids,
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
class CandidateBreakdown:
    node_id: str
    total_cost: float
    latency_cost: float
    failure_risk_cost: float
    entanglement_cost: float
    load_cost: float
    fidelity: float


@dataclass(frozen=True)
class FragmentPlanAssignment:
    fragment_id: str
    primary_node_id: str
    fallback_node_ids: tuple[str, ...]
    candidates: tuple[CandidateBreakdown, ...]
    block_id: str
    stage_index: int


@dataclass(frozen=True)
class ExecutionBlock:
    block_id: str
    stage_index: int
    fragment_ids: tuple[str, ...]
    service_types: tuple[str, ...]
    active_qubits: tuple[int, ...]
    state_qubits: tuple[int, ...]
    input_component_qubits: tuple[tuple[int, ...], ...]
    dependencies: tuple[str, ...]
    primary_node_id: str
    fallback_node_ids: tuple[str, ...]
    candidates: tuple[CandidateBreakdown, ...]


@dataclass(frozen=True)
class ExecutionStage:
    stage_id: str
    stage_index: int
    block_ids: tuple[str, ...]
    fragment_ids: tuple[str, ...]


@dataclass(frozen=True)
class CompiledExecutionPlan:
    plan_id: str
    fragment_order: tuple[str, ...]
    fragments: dict[str, Any]
    assignments: dict[str, FragmentPlanAssignment]
    quality_snapshot_id: str
    stages: tuple[ExecutionStage, ...]
    blocks: dict[str, ExecutionBlock]
    num_qubits: int


@dataclass(frozen=True)
class DistributedFragmentExecution:
    fragment_result: Any
    reservation_id: str
    execution_id: str
    output: FragmentDispatchOutput
    state: DistributedStateHandoff
    execution_block_id: str
    stage_index: int
    incoming_state_peer_ids: tuple[str, ...]


@dataclass(frozen=True)
class DistributedBlockExecution:
    block: ExecutionBlock
    reservation_id: str
    execution_id: str
    output: FragmentDispatchOutput
    fragment_results: tuple[Any, ...]
    incoming_state_peer_ids: tuple[str, ...]


def _topological_stages(
    dependencies: dict[str, tuple[str, ...]],
) -> tuple[tuple[str, ...], ...]:
    in_degree: dict[str, int] = {node_id: len(dep_ids) for node_id, dep_ids in dependencies.items()}
    outgoing: dict[str, list[str]] = {node_id: [] for node_id in dependencies}
    for node_id, dep_ids in dependencies.items():
        for dep_id in dep_ids:
            outgoing.setdefault(dep_id, []).append(node_id)

    ready = sorted(node_id for node_id, degree in in_degree.items() if degree == 0)
    stages: list[tuple[str, ...]] = []
    visited = 0
    while ready:
        current_stage = tuple(ready)
        stages.append(current_stage)
        next_ready: list[str] = []
        for node_id in current_stage:
            visited += 1
            for dependent in sorted(outgoing.get(node_id, [])):
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    next_ready.append(dependent)
        ready = sorted(next_ready)

    if visited != len(dependencies):
        raise ValueError("Dependency graph contains a cycle or unresolved node")
    return tuple(stages)


class QuantumExecutionBridge:
    """Compile QASM, assign subcircuits, and execute them over real libp2p RPC."""

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

    def compile_plan(self, circuit_text: str) -> CompiledExecutionPlan:
        normalize_circuit_input = self._bridge["normalize_circuit_input"]
        build_operation_dependencies = self._bridge["build_operation_dependencies"]
        build_fragments = self._bridge["build_fragments"]
        topological_order = self._bridge["topological_order"]

        circuit = normalize_circuit_input(circuit_text)
        dependencies = build_operation_dependencies(circuit)
        fragments = build_fragments(circuit, dependencies)
        fragment_dependencies = {
            fragment_id: fragment.dependencies
            for fragment_id, fragment in fragments.items()
        }
        fragment_order = topological_order(fragment_dependencies)
        stage_fragments = _topological_stages(fragment_dependencies)

        planned_node_load: dict[str, int] = {}
        assignments: dict[str, FragmentPlanAssignment] = {}
        blocks: dict[str, ExecutionBlock] = {}
        stages: list[ExecutionStage] = []
        fragment_to_block: dict[str, str] = {}
        component_for_qubit: dict[int, tuple[int, ...]] = {
            qubit: (qubit,)
            for qubit in range(circuit.num_qubits)
        }

        for stage_index, stage_fragment_ids in enumerate(stage_fragments):
            grouped_fragments: dict[tuple[tuple[int, ...], ...], list[str]] = {}
            group_order: list[tuple[tuple[int, ...], ...]] = []
            for fragment_id in stage_fragment_ids:
                fragment = fragments[fragment_id]
                input_components = tuple(
                    sorted(
                        {component_for_qubit[qubit] for qubit in fragment.qubits},
                        key=lambda component: component,
                    )
                )
                if input_components not in grouped_fragments:
                    grouped_fragments[input_components] = []
                    group_order.append(input_components)
                grouped_fragments[input_components].append(fragment_id)

            stage_block_ids: list[str] = []
            component_updates: list[tuple[tuple[tuple[int, ...], ...], tuple[int, ...]]] = []
            for block_index, input_components in enumerate(group_order, start=1):
                block_fragment_ids = tuple(grouped_fragments[input_components])
                service_types = tuple(
                    sorted(
                        {
                            fragments[fragment_id].service_type.value
                            for fragment_id in block_fragment_ids
                        }
                    )
                )
                state_qubits = tuple(
                    sorted(
                        {
                            qubit
                            for component in input_components
                            for qubit in component
                        }
                    )
                )
                active_qubits = tuple(
                    sorted(
                        {
                            qubit
                            for fragment_id in block_fragment_ids
                            for qubit in fragments[fragment_id].qubits
                        }
                    )
                )
                dependency_block_ids = tuple(
                    sorted(
                        {
                            fragment_to_block[dependency_id]
                            for fragment_id in block_fragment_ids
                            for dependency_id in fragments[fragment_id].dependencies
                        }
                    )
                )
                dependency_nodes = {
                    blocks[block_id].primary_node_id
                    for block_id in dependency_block_ids
                    if block_id in blocks
                }

                candidates = self._candidates_for_services(service_types)
                if not candidates:
                    raise RuntimeError(
                        "No available service provider for block "
                        f"{block_fragment_ids} ({', '.join(service_types)})"
                    )

                max_live_load = max(
                    candidate.active_reservations + candidate.active_executions
                    for candidate in candidates
                )
                scored_candidates = tuple(
                    CandidateBreakdown(
                        node_id=candidate.node_id,
                        total_cost=self._total_cost(
                            node_id=candidate.node_id,
                            fidelity=candidate.fidelity,
                            dependency_nodes=dependency_nodes,
                            live_load=candidate.active_reservations + candidate.active_executions,
                            max_live_load=max_live_load,
                            planned_load=planned_node_load.get(candidate.node_id, 0),
                            component_count=len(input_components),
                            state_qubit_count=len(state_qubits),
                        ),
                        latency_cost=0.0,
                        failure_risk_cost=round(1.0 - candidate.fidelity, 6),
                        entanglement_cost=self._entanglement_cost(
                            candidate.node_id,
                            dependency_nodes,
                            component_count=len(input_components),
                            state_qubit_count=len(state_qubits),
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
                block_id = f"block-s{stage_index + 1:02d}-b{block_index:02d}"
                block = ExecutionBlock(
                    block_id=block_id,
                    stage_index=stage_index,
                    fragment_ids=block_fragment_ids,
                    service_types=service_types,
                    active_qubits=active_qubits,
                    state_qubits=state_qubits,
                    input_component_qubits=input_components,
                    dependencies=dependency_block_ids,
                    primary_node_id=primary.node_id,
                    fallback_node_ids=tuple(
                        candidate.node_id for candidate in ordered_candidates[1:4]
                    ),
                    candidates=ordered_candidates,
                )
                blocks[block_id] = block
                stage_block_ids.append(block_id)
                component_updates.append((input_components, state_qubits))
                for fragment_id in block_fragment_ids:
                    fragment_to_block[fragment_id] = block_id
                    assignments[fragment_id] = FragmentPlanAssignment(
                        fragment_id=fragment_id,
                        primary_node_id=block.primary_node_id,
                        fallback_node_ids=block.fallback_node_ids,
                        candidates=block.candidates,
                        block_id=block_id,
                        stage_index=stage_index,
                    )

            stages.append(
                ExecutionStage(
                    stage_id=f"stage-{stage_index + 1:02d}",
                    stage_index=stage_index,
                    block_ids=tuple(stage_block_ids),
                    fragment_ids=stage_fragment_ids,
                )
            )

            for input_components, output_component in component_updates:
                for component in input_components:
                    for qubit in component:
                        component_for_qubit[qubit] = output_component

        return CompiledExecutionPlan(
            plan_id=f"plan-{uuid.uuid4()}",
            fragment_order=fragment_order,
            fragments=fragments,
            assignments=assignments,
            quality_snapshot_id=f"quality-{_utc_now().isoformat()}",
            stages=tuple(stages),
            blocks=blocks,
            num_qubits=circuit.num_qubits,
        )

    async def iter_fragment_executions(
        self,
        *,
        workflow_run_id: str,
        plan: CompiledExecutionPlan,
    ) -> AsyncIterator[DistributedFragmentExecution]:
        fragment_result_type = self._bridge["FragmentExecutionResult"]
        fragment_status_type = self._bridge["FragmentExecutionStatus"]
        component_states: dict[tuple[int, ...], DistributedStateHandoff] = {
            (qubit,): make_initial_state_handoff(1, qubit_ids=(qubit,))
            for qubit in range(plan.num_qubits)
        }

        for stage in plan.stages:
            block_inputs: list[tuple[ExecutionBlock, tuple[str, ...], DistributedStateHandoff]] = []
            for block_id in stage.block_ids:
                block = plan.blocks[block_id]
                input_states = tuple(
                    component_states[component_qubits]
                    for component_qubits in block.input_component_qubits
                )
                incoming_state_peer_ids = tuple(
                    sorted(
                        {
                            state.previous_peer_id
                            for state in input_states
                            if state.previous_peer_id
                        }
                    )
                )
                block_inputs.append(
                    (
                        block,
                        incoming_state_peer_ids,
                        combine_handoffs(input_states),
                    )
                )

            stage_results = await asyncio.gather(
                *[
                    self._execute_block(
                        workflow_run_id=workflow_run_id,
                        plan_id=plan.plan_id,
                        plan=plan,
                        block=block,
                        state=block_state,
                        incoming_state_peer_ids=incoming_state_peer_ids,
                        fragment_result_type=fragment_result_type,
                        fragment_status_type=fragment_status_type,
                    )
                    for block, incoming_state_peer_ids, block_state in block_inputs
                ]
            )
            stage_results_by_id = {
                result.block.block_id: result for result in stage_results
            }
            for block_id in stage.block_ids:
                block = plan.blocks[block_id]
                result = stage_results_by_id[block_id]
                for component_qubits in block.input_component_qubits:
                    component_states.pop(component_qubits, None)
                output_qubits = tuple(handoff_qubit_ids(result.output.state))
                component_states[output_qubits] = result.output.state

            global_state = self._combine_component_states(component_states)
            for block_id in stage.block_ids:
                result = stage_results_by_id[block_id]
                for fragment_result in result.fragment_results:
                    yield DistributedFragmentExecution(
                        fragment_result=fragment_result,
                        reservation_id=result.reservation_id,
                        execution_id=result.execution_id,
                        output=result.output,
                        state=global_state,
                        execution_block_id=result.block.block_id,
                        stage_index=result.block.stage_index,
                        incoming_state_peer_ids=result.incoming_state_peer_ids,
                    )

    def build_quantum_result(
        self,
        *,
        plan: CompiledExecutionPlan,
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
            "execution_mode": "parallel_component_subcircuits",
            "last_peer_id": final_state.previous_peer_id,
            "validation_statevector_fidelity": self._validation_fidelity(
                raw_statevector=raw_result.get("statevector"),
                final_state=final_state,
            ),
            "measured_qubits": list(final_state.measured_qubits),
            "stage_count": len(plan.stages),
            "block_count": len(plan.blocks),
        }
        return serialized

    def serialize_plan(self, plan: CompiledExecutionPlan) -> dict[str, Any]:
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
                    "block_id": assignment.block_id,
                    "stage_index": assignment.stage_index,
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
            "stages": [
                {
                    "stage_id": stage.stage_id,
                    "stage_index": stage.stage_index,
                    "block_ids": list(stage.block_ids),
                    "fragment_ids": list(stage.fragment_ids),
                }
                for stage in plan.stages
            ],
            "blocks": {
                block_id: {
                    "block_id": block.block_id,
                    "stage_index": block.stage_index,
                    "fragment_ids": list(block.fragment_ids),
                    "service_types": list(block.service_types),
                    "active_qubits": list(block.active_qubits),
                    "state_qubits": list(block.state_qubits),
                    "input_component_qubits": [
                        list(component_qubits)
                        for component_qubits in block.input_component_qubits
                    ],
                    "dependencies": list(block.dependencies),
                    "primary_node_id": block.primary_node_id,
                    "fallback_node_ids": list(block.fallback_node_ids),
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
                        for candidate in block.candidates
                    ],
                }
                for block_id, block in plan.blocks.items()
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
                    "execution_block_id": execution.execution_block_id,
                    "stage_index": execution.stage_index,
                    "state_handoff_from_node_ids": list(execution.incoming_state_peer_ids),
                    "state_transfer_bytes": execution.output.state_transfer_bytes,
                    "gate_count": execution.output.gate_count,
                    "circuit_depth": execution.output.circuit_depth,
                    "component_qubits": list(execution.output.component_qubits),
                    "block_fragment_ids": list(execution.output.fragment_ids),
                    "distributed_execution": True,
                    "distributed_execution_mode": "parallel_component_subcircuits",
                }
            )
        return payload

    async def _execute_block(
        self,
        *,
        workflow_run_id: str,
        plan_id: str,
        plan: CompiledExecutionPlan,
        block: ExecutionBlock,
        state: DistributedStateHandoff,
        incoming_state_peer_ids: tuple[str, ...],
        fragment_result_type: Any,
        fragment_status_type: Any,
    ) -> DistributedBlockExecution:
        candidate_node_ids = [block.primary_node_id, *block.fallback_node_ids]
        last_error: str | None = None
        service_id = self._reservation_service_id(block)

        for attempt_index, node_id in enumerate(candidate_node_ids, start=1):
            peer = self._discovery_service.registry.get_peer(node_id)
            peer_addresses = tuple(peer.network_addresses) if peer is not None else ()
            reservation_id = f"res-{uuid.uuid4()}"
            execution_id = f"exec-{uuid.uuid4()}"
            prepare_request = ReservationPrepareRequest(
                reservation_id=reservation_id,
                workflow_run_id=workflow_run_id,
                fragment_id=block.block_id,
                requesting_peer_id=str(self._libp2p_runtime.host.get_id()),
                service_id=service_id,
                estimated_qubits=max(1, len(block.state_qubits)),
                estimated_depth=max(
                    1,
                    sum(
                        len(plan.fragments[fragment_id].operation_ids)
                        for fragment_id in block.fragment_ids
                    ),
                ),
                idempotency_key=uuid.uuid4().hex,
            )
            if self._reservation_service is not None:
                await self._reservation_service.request(
                    reservation_id=reservation_id,
                    workflow_run_id=workflow_run_id,
                    fragment_id=block.block_id,
                    service_id=service_id,
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
                            fragment_id=block.block_id,
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
                block_id=block.block_id,
                fragments=tuple(
                    FragmentDescriptor(
                        fragment_id=plan.fragments[fragment_id].fragment_id,
                        service_id=plan.fragments[fragment_id].service_type.value,
                        qubits=tuple(plan.fragments[fragment_id].qubits),
                        operation_ids=tuple(plan.fragments[fragment_id].operation_ids),
                        dependencies=tuple(plan.fragments[fragment_id].dependencies),
                        raw_text=plan.fragments[fragment_id].raw_text,
                    )
                    for fragment_id in block.fragment_ids
                ),
                state=state,
            )
            dispatch_request = FragmentDispatchRequest(
                execution_id=execution_id,
                reservation_id=reservation_id,
                workflow_run_id=workflow_run_id,
                fragment_id=block.block_id,
                service_id=service_id,
                input_payload=dispatch_input.model_dump(mode="json"),
                idempotency_key=uuid.uuid4().hex,
            )
            started_at = _utc_now()
            if self._execution_service is not None:
                await self._execution_service.dispatch(
                    execution_id=execution_id,
                    reservation_id=reservation_id,
                    workflow_run_id=workflow_run_id,
                    fragment_id=block.block_id,
                    service_id=service_id,
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
                last_error = dispatch_response.error_detail or "block execution failed"
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
            fragment_results = tuple(
                fragment_result_type(
                    fragment_id=fragment_id,
                    node_id=node_id,
                    status=fragment_status_type.SUCCESS,
                    attempts=attempt_index,
                    started_at=started_at,
                    finished_at=dispatch_response.completed_at,
                    observed_fidelity=dispatch_response.fidelity_score,
                    error=None,
                )
                for fragment_id in block.fragment_ids
            )
            return DistributedBlockExecution(
                block=block,
                reservation_id=reservation_id,
                execution_id=execution_id,
                output=output,
                fragment_results=fragment_results,
                incoming_state_peer_ids=incoming_state_peer_ids,
            )

        raise RuntimeError(
            f"Execution block {block.block_id} failed across all assigned peers: {last_error}"
        )

    def _candidates_for_services(self, service_types: tuple[str, ...]) -> list[ServiceCandidate]:
        candidates: list[ServiceCandidate] = []
        registry = self._discovery_service.registry
        for peer in registry.list_peers(include_stale=False):
            if peer.health_status != "healthy":
                continue
            if not all(service_type in peer.service_ids for service_type in service_types):
                continue
            candidates.append(
                ServiceCandidate(
                    node_id=peer.peer_id,
                    fidelity=min(
                        self._quality.get_service_fidelity(
                            service_type,
                            peer_id=peer.peer_id,
                        )
                        for service_type in service_types
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
                    fidelity=min(
                        self._quality.get_service_fidelity(
                            service_type,
                            peer_id=local_peer_id,
                        )
                        for service_type in service_types
                    ),
                    active_reservations=0,
                    active_executions=0,
                    network_addresses=tuple(),
                )
            )

        return candidates

    def _combine_component_states(
        self,
        component_states: dict[tuple[int, ...], DistributedStateHandoff],
    ) -> DistributedStateHandoff:
        ordered_states = tuple(
            component_states[component_qubits]
            for component_qubits in sorted(component_states, key=lambda item: item)
        )
        return combine_handoffs(ordered_states)

    def _reservation_service_id(self, block: ExecutionBlock) -> str:
        if len(block.service_types) == 1:
            return block.service_types[0]
        return "subcircuit_bundle"

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
        *,
        component_count: int,
        state_qubit_count: int,
    ) -> float:
        dependency_cost = 0.0
        if dependency_nodes and node_id not in dependency_nodes:
            dependency_cost = min(1.0, 0.15 * len(dependency_nodes))
        component_cost = min(1.0, 0.08 * max(0, component_count - 1))
        state_size_cost = min(1.0, 0.03 * max(0, state_qubit_count - 1))
        return round(min(1.0, dependency_cost + component_cost + state_size_cost), 6)

    def _total_cost(
        self,
        *,
        node_id: str,
        fidelity: float,
        dependency_nodes: set[str],
        live_load: int,
        max_live_load: int,
        planned_load: int,
        component_count: int,
        state_qubit_count: int,
    ) -> float:
        failure_risk_cost = 1.0 - fidelity
        entanglement_cost = self._entanglement_cost(
            node_id,
            dependency_nodes,
            component_count=component_count,
            state_qubit_count=state_qubit_count,
        )
        load_cost = self._load_cost(
            live_load=live_load,
            max_live_load=max_live_load,
            planned_load=planned_load,
        )
        return round(
            (failure_risk_cost * 0.55)
            + (entanglement_cost * 0.20)
            + (load_cost * 0.25),
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
            qubit_ids=handoff_qubit_ids(final_state),
            amplitudes=tuple(_format_complex(complex(value)) for value in raw_statevector),
            measured_qubits=final_state.measured_qubits,
        )
        return round(fidelity_between_handoffs(final_state, analytic_state), 12)
