"""Deterministic cost-based circuit planner."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning.cost import score_candidate
from quantum_coordinator.planning.dag import build_operation_dependencies, topological_order
from quantum_coordinator.planning.fragments import build_fragments
from quantum_coordinator.planning.models import (
    CandidateScore,
    ExecutionPlan,
    FragmentAssignment,
    PlannerConfig,
)
from quantum_coordinator.planning.parser import CircuitNormalizationError, normalize_circuit_input
from quantum_coordinator.service_discovery.registry import ServiceRegistry


class PlanningError(ValueError):
    """Raised when the planner cannot build a feasible execution plan."""


class CircuitPlanner:
    """Builds execution plans using registry-aware cost minimization."""

    def __init__(self, registry: ServiceRegistry, config: PlannerConfig | None = None) -> None:
        self._registry = registry
        self._config = config or PlannerConfig()

    def compile(self, circuit_input: str) -> ExecutionPlan:
        """Compile normalized circuit text into a deterministic assignment plan."""
        try:
            circuit = normalize_circuit_input(circuit_input)
        except CircuitNormalizationError as exc:
            raise PlanningError(str(exc)) from exc

        op_dependencies = build_operation_dependencies(circuit)
        fragments = build_fragments(circuit, op_dependencies)

        fragment_dependency_map = {
            fragment_id: fragment.dependencies for fragment_id, fragment in fragments.items()
        }
        fragment_order = topological_order(fragment_dependency_map)

        assignments: dict[str, FragmentAssignment] = {}

        for fragment_id in fragment_order:
            fragment = fragments[fragment_id]
            candidates = self._registry.query(
                service_type=fragment.service_type,
                min_fidelity=self._config.min_fidelity,
                available_only=True,
            )
            if not candidates:
                raise PlanningError(
                    "No feasible node for fragment "
                    f"{fragment.fragment_id} (service={fragment.service_type.value}, "
                    f"min_fidelity={self._config.min_fidelity})"
                )

            scored = [score_candidate(fragment, ad, self._config) for ad in candidates]
            ordered = tuple(_sort_candidates(scored))
            primary = ordered[0]
            fallbacks = tuple(
                candidate.node_id for candidate in ordered[1 : 1 + self._config.fallback_count]
            )

            assignments[fragment_id] = FragmentAssignment(
                fragment_id=fragment_id,
                primary_node_id=primary.node_id,
                fallback_node_ids=fallbacks,
                candidates=ordered,
            )

        snapshot_time = datetime.now(timezone.utc).isoformat()
        plan_id = f"plan-{uuid4()}"
        quality_snapshot_id = f"quality-{snapshot_time}"

        return ExecutionPlan(
            plan_id=plan_id,
            fragment_order=fragment_order,
            fragments=fragments,
            assignments=assignments,
            quality_snapshot_id=quality_snapshot_id,
        )

    @property
    def config(self) -> PlannerConfig:
        """Expose planner configuration for testability."""
        return replace(self._config)


def _sort_candidates(candidates: list[CandidateScore]) -> list[CandidateScore]:
    return sorted(candidates, key=lambda c: (c.total_cost, -c.fidelity, c.node_id))


def available_services(registry: ServiceRegistry) -> dict[GateType, int]:
    """Return counts of available services per gate type."""
    result: dict[GateType, int] = {}
    for gate_type in GateType:
        result[gate_type] = len(registry.query(service_type=gate_type, available_only=True))
    return result
