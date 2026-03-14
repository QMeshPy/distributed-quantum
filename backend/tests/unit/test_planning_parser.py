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


def test_normalize_shor_style_openqasm3_circuit() -> None:
    circuit = """
OPENQASM 3;
qubit[8] q;
bit[3] c;

h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
h q[5];
h q[6];
h q[7];

for i in [0:3] {
    controlled U(2^i) q[0], q[i];
}

qft q[0:4];

measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
"""
    ir = normalize_circuit_input(circuit)

    assert ir.format == "openqasm3"
    assert ir.num_qubits == 8
    assert len(ir.operations) == 16
    assert ir.operations[0].service_type == GateType.HADAMARD
    assert ir.operations[8].service_type == GateType.CONTROLLED_UNITARY
    assert ir.operations[8].qubits == (0, 0)
    assert ir.operations[11].qubits == (0, 3)
    assert ir.operations[12].service_type == GateType.QFT
    assert ir.operations[12].qubits == (0, 1, 2, 3, 4)
    assert ir.operations[-1].service_type == GateType.MEASUREMENT_FEEDFORWARD


def test_normalize_large_nested_openqasm3_circuit() -> None:
    circuit = """
OPENQASM 3;
qubit[16] q;
bit[16] c;

h q[0];
h q[1];
h q[2];
h q[3];
h q[4];
h q[5];
h q[6];
h q[7];
h q[8];
h q[9];
h q[10];
h q[11];
h q[12];
h q[13];
h q[14];
h q[15];

bell_pair q[0], q[1];
bell_pair q[2], q[3];
bell_pair q[4], q[5];
bell_pair q[6], q[7];
bell_pair q[8], q[9];
bell_pair q[10], q[11];
bell_pair q[12], q[13];
bell_pair q[14], q[15];

ccnot q[0], q[1], q[2];
ccnot q[3], q[4], q[5];
ccnot q[6], q[7], q[8];
ccnot q[9], q[10], q[11];
ccnot q[12], q[13], q[14];

for i in [0:7] {
    controlled U(2^i) q[0], q[i];
}

qft q[0:8];

for i in [0:7] {
    for j in [i+1:7] {
        cswap q[i], q[j], q[8];
    }
}

for i in [0:15] {
    controlled rz(3.1415) q[i], q[15-i];
    controlled rx(2.0) q[i], q[15-i];
}

syndrome_extraction q[0];
syndrome_extraction q[1];
syndrome_extraction q[2];
distillation q[3];
teleport q[0], q[1];
teleport q[2], q[3];
iqft q[0:8];
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
measure q[3] -> c[3];
measure q[4] -> c[4];
measure q[5] -> c[5];
measure q[6] -> c[6];
measure q[7] -> c[7];
measure q[8] -> c[8];
measure q[9] -> c[9];
measure q[10] -> c[10];
measure q[11] -> c[11];
measure q[12] -> c[12];
measure q[13] -> c[13];
measure q[14] -> c[14];
measure q[15] -> c[15];
"""
    ir = normalize_circuit_input(circuit)

    assert ir.format == "openqasm3"
    assert ir.num_qubits == 16
    assert len(ir.operations) == 121
    assert ir.operations[24].service_type == GateType.PROGRAMMABLE_GATE
    assert ir.operations[37].service_type == GateType.QFT
    assert ir.operations[38].service_type == GateType.PROGRAMMABLE_GATE
    assert ir.operations[66].qubits == (0, 15)
    assert ir.operations[67].qubits == (0, 15)
    assert ir.operations[72].qubits == (3, 12)
    assert ir.operations[-1].qubits == (15,)


def test_normalize_accepts_parameterized_gate_as_programmable() -> None:
    circuit = """
OPENQASM 2.0;
qreg q[1];
rx(pi / 2) q[0];
"""

    ir = normalize_circuit_input(circuit)

    assert ir.num_qubits == 1
    assert len(ir.operations) == 1
    assert ir.operations[0].service_type == GateType.PROGRAMMABLE_GATE
