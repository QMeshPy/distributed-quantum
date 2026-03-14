"""Unit tests for Qiskit-backed quantum result generation."""

from __future__ import annotations

import pytest

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning.models import CircuitFragment, ExecutionPlan
from quantum_coordinator.runtime.qiskit_results import build_quantum_result


def test_bell_state_has_unit_entanglement_entropy() -> None:
    """A circuit that only creates a Bell pair should yield entanglement entropy 1 for both qubits."""
    plan = ExecutionPlan(
        plan_id="test-plan",
        fragment_order=("frag-0",),
        fragments={
            "frag-0": CircuitFragment(
                fragment_id="frag-0",
                service_type=GateType.BELL_PAIR,
                qubits=(0, 1),
                operation_ids=("op-0",),
                dependencies=(),
            ),
        },
        assignments={},
        quality_snapshot_id="snap",
    )
    result = build_quantum_result(plan, fragment_results=())
    assert result["entanglement_entropy"] is not None
    ent = result["entanglement_entropy"]
    assert "q0|rest" in ent
    assert "q1|rest" in ent
    assert ent["q0|rest"] == pytest.approx(1.0, abs=1e-6)
    assert ent["q1|rest"] == pytest.approx(1.0, abs=1e-6)


def test_separable_state_has_zero_entanglement_entropy() -> None:
    """A product state (e.g. after CX on |00⟩) should yield entanglement entropy 0."""
    plan = ExecutionPlan(
        plan_id="test-plan",
        fragment_order=("frag-0",),
        fragments={
            "frag-0": CircuitFragment(
                fragment_id="frag-0",
                service_type=GateType.CNOT,
                qubits=(0, 1),
                operation_ids=("op-0",),
                dependencies=(),
            ),
        },
        assignments={},
        quality_snapshot_id="snap",
    )
    result = build_quantum_result(plan, fragment_results=())
    assert result["entanglement_entropy"] is not None
    ent = result["entanglement_entropy"]
    assert ent["q0|rest"] == pytest.approx(0.0, abs=1e-6)
    assert ent["q1|rest"] == pytest.approx(0.0, abs=1e-6)
