from __future__ import annotations

from datetime import timedelta

import pytest

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning import (
    CircuitPlanner,
    PlannerConfig,
    PlannerWeights,
    PlanningError,
)
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.registry import ServiceRegistry


def _registry_with_candidates() -> ServiceRegistry:
    registry = ServiceRegistry(stale_after=timedelta(seconds=60))

    registry.upsert(
        ServiceAdvertisement(
            node_id="node-a",
            service_type=GateType.CNOT,
            fidelity=0.99,
            qubit_min=1,
            qubit_max=3,
            availability=True,
        )
    )
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-b",
            service_type=GateType.CNOT,
            fidelity=0.90,
            qubit_min=1,
            qubit_max=3,
            availability=True,
        )
    )
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-c",
            service_type=GateType.CNOT,
            fidelity=0.85,
            qubit_min=1,
            qubit_max=3,
            availability=True,
        )
    )
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-z",
            service_type=GateType.CZ,
            fidelity=0.96,
            qubit_min=1,
            qubit_max=3,
            availability=True,
        )
    )

    return registry


def test_planner_builds_assignments_with_fallbacks() -> None:
    registry = _registry_with_candidates()
    config = PlannerConfig(
        min_fidelity=0.8,
        fallback_count=2,
        seed=7,
        weights=PlannerWeights(w_lat=0.0, w_fail=1.0, w_ent=0.0, w_load=0.0),
    )
    planner = CircuitPlanner(registry=registry, config=config)

    plan = planner.compile(
        """
OPENQASM 2.0;
qreg q[2];
cx q[0], q[1];
cz q[1], q[0];
"""
    )

    assert len(plan.fragment_order) == 2
    first_assignment = plan.assignments[plan.fragment_order[0]]
    assert first_assignment.primary_node_id == "node-a"
    assert first_assignment.fallback_node_ids == ("node-b", "node-c")


def test_planner_raises_when_service_missing() -> None:
    registry = ServiceRegistry(stale_after=timedelta(seconds=60))
    planner = CircuitPlanner(registry=registry)

    with pytest.raises(PlanningError):
        planner.compile(
            """
OPENQASM 2.0;
qreg q[2];
cx q[0], q[1];
"""
        )


def test_planner_is_deterministic_for_same_seed() -> None:
    registry = _registry_with_candidates()
    config = PlannerConfig(seed=42)

    planner_1 = CircuitPlanner(registry=registry, config=config)
    planner_2 = CircuitPlanner(registry=registry, config=config)

    circuit = """
OPENQASM 2.0;
qreg q[2];
cx q[0], q[1];
"""

    plan_1 = planner_1.compile(circuit)
    plan_2 = planner_2.compile(circuit)

    first_1 = plan_1.assignments[plan_1.fragment_order[0]].primary_node_id
    first_2 = plan_2.assignments[plan_2.fragment_order[0]].primary_node_id
    assert first_1 == first_2
