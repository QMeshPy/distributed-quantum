from __future__ import annotations

import pytest

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning import CircuitNormalizationError, normalize_circuit_input


def test_normalize_openqasm2_circuit() -> None:
    circuit = """
OPENQASM 2.0;
include \"qelib1.inc\";
qreg q[2];
cx q[0], q[1];
cz q[1], q[0];
"""
    ir = normalize_circuit_input(circuit)

    assert ir.format == "openqasm2"
    assert ir.num_qubits == 2
    assert len(ir.operations) == 2
    assert ir.operations[0].service_type == GateType.CNOT
    assert ir.operations[1].service_type == GateType.CZ


def test_normalize_openqasm3_circuit() -> None:
    circuit = """
OPENQASM 3;
qubit[3] q;
bell_pair q[0], q[1];
measure q[0] -> c[0];
"""
    ir = normalize_circuit_input(circuit)

    assert ir.format == "openqasm3"
    assert ir.num_qubits == 3
    assert ir.operations[0].service_type == GateType.BELL_PAIR
    assert ir.operations[1].service_type == GateType.MEASUREMENT_FEEDFORWARD


def test_normalize_rejects_unknown_gate() -> None:
    circuit = """
OPENQASM 2.0;
qreg q[1];
h q[0];
"""

    with pytest.raises(CircuitNormalizationError):
        normalize_circuit_input(circuit)
