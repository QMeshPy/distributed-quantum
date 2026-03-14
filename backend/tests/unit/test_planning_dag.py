from __future__ import annotations

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning.dag import build_operation_dependencies, topological_order
from quantum_coordinator.planning.models import CircuitIR, CircuitOperation


def test_build_operation_dependencies_by_qubit() -> None:
    operations = (
        CircuitOperation("op-0001", GateType.CNOT, (0, 1), 1, "cx q[0], q[1];"),
        CircuitOperation("op-0002", GateType.CZ, (1, 2), 2, "cz q[1], q[2];"),
        CircuitOperation("op-0003", GateType.BELL_PAIR, (0, 2), 3, "bell_pair q[0], q[2];"),
    )
    circuit = CircuitIR(num_qubits=3, operations=operations, format="openqasm2")

    deps = build_operation_dependencies(circuit)

    assert deps["op-0001"] == ()
    assert deps["op-0002"] == ("op-0001",)
    assert deps["op-0003"] == ("op-0001", "op-0002")


def test_topological_order_is_dependency_safe() -> None:
    deps = {
        "frag-0001": (),
        "frag-0002": ("frag-0001",),
        "frag-0003": ("frag-0001", "frag-0002"),
    }

    order = topological_order(deps)

    assert order == ("frag-0001", "frag-0002", "frag-0003")


def test_topological_order_prefers_lowest_ready_fragment_id() -> None:
    deps = {
        "frag-0001": (),
        "frag-0002": (),
        "frag-0003": ("frag-0001",),
        "frag-0004": ("frag-0002",),
        "frag-0005": ("frag-0003",),
        "frag-0006": ("frag-0004",),
    }

    order = topological_order(deps)

    assert order == (
        "frag-0001",
        "frag-0002",
        "frag-0003",
        "frag-0004",
        "frag-0005",
        "frag-0006",
    )
