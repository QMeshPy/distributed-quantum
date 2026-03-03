from __future__ import annotations

from datetime import timedelta

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning import CircuitPlanner, PlannerConfig
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.registry import ServiceRegistry


def test_property_fragment_assignment_compatibility() -> None:
    registry = ServiceRegistry(stale_after=timedelta(seconds=60))
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-cnot",
            service_type=GateType.CNOT,
            fidelity=0.93,
            qubit_min=1,
            qubit_max=4,
            availability=True,
        )
    )

    planner = CircuitPlanner(registry=registry, config=PlannerConfig(min_fidelity=0.8))
    plan = planner.compile(
        """
OPENQASM 2.0;
qreg q[2];
cx q[0], q[1];
"""
    )

    fragment_id = plan.fragment_order[0]
    fragment = plan.fragments[fragment_id]
    assignment = plan.assignments[fragment_id]

    assert fragment.service_type == GateType.CNOT
    assert assignment.primary_node_id == "node-cnot"


def test_property_execution_order_respects_dependencies() -> None:
    registry = ServiceRegistry(stale_after=timedelta(seconds=60))
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-cnot",
            service_type=GateType.CNOT,
            fidelity=0.93,
            qubit_min=1,
            qubit_max=4,
            availability=True,
        )
    )

    planner = CircuitPlanner(registry=registry)
    plan = planner.compile(
        """
OPENQASM 2.0;
qreg q[3];
cx q[0], q[1];
cx q[1], q[2];
"""
    )

    position = {fragment_id: idx for idx, fragment_id in enumerate(plan.fragment_order)}
    for fragment_id, fragment in plan.fragments.items():
        for dep in fragment.dependencies:
            assert position[dep] < position[fragment_id]
