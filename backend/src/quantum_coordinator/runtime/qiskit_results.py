"""Qiskit-backed quantum result generation for executed plans."""

from __future__ import annotations

import ast
from itertools import combinations
from math import e, pi, prod, tau
from typing import Any

from qiskit import QuantumCircuit  # type: ignore[import-not-found]
from qiskit.circuit import Gate  # type: ignore[import-not-found]
from qiskit.circuit.library import QFTGate  # type: ignore[import-not-found]
from qiskit.circuit.library import (  # type: ignore[import-not-found]
    HGate,
    PhaseGate,
    RXGate,
    RYGate,
    RZGate,
    SGate,
    SXGate,
    SwapGate,
    TGate,
    UGate,
    XGate,
    YGate,
    ZGate,
)
from qiskit.quantum_info import (  # type: ignore[import-not-found]
    SparsePauliOp,
    Statevector,
    entropy,
    partial_trace,
    state_fidelity,
)

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning.models import CircuitFragment, ExecutionPlan
from quantum_coordinator.runtime.models import FragmentExecutionResult

DEFAULT_RESULT_SHOTS = 1024
DEFAULT_RESULT_SEED = 0
TOP_BASIS_STATE_LIMIT = 5
_NUMERIC_CONSTANTS = {
    "e": e,
    "pi": pi,
    "tau": tau,
}


def build_quantum_result(
    plan: ExecutionPlan,
    *,
    fragment_results: tuple[FragmentExecutionResult, ...] = (),
    shots: int = DEFAULT_RESULT_SHOTS,
    seed: int | None = None,
) -> dict[str, object]:
    """Build counts, probabilities, and pre-measurement statevector via Qiskit."""
    circuit, measured_qubits = _build_qiskit_circuit(plan)
    statevector = Statevector.from_instruction(circuit)
    full_probabilities = _coerce_probabilities(statevector.probabilities_dict())

    sampled_counts: dict[str, int] | None = None
    measured_probabilities: dict[str, float] | None = None
    if measured_qubits:
        statevector.seed(DEFAULT_RESULT_SEED if seed is None else seed)
        sampled_counts = _coerce_counts(
            statevector.sample_counts(shots=shots, qargs=measured_qubits)
        )
        measured_probabilities = _coerce_probabilities(
            statevector.probabilities_dict(qargs=measured_qubits)
        )

    return {
        "counts": sampled_counts,
        "probabilities": full_probabilities,
        "measured_probabilities": measured_probabilities,
        "statevector": _coerce_statevector(statevector.data),
        "shots": shots if sampled_counts is not None else None,
        "measured_qubits": measured_qubits or None,
        "observable_expectations": _observable_expectations(statevector, circuit.num_qubits),
        "reduced_density_matrices": _reduced_density_matrices(statevector, circuit.num_qubits),
        "bloch_vectors": _bloch_vectors(statevector, circuit.num_qubits),
        "entanglement_entropy": _entanglement_entropy(statevector, circuit.num_qubits),
        "fidelity": _fidelity_metrics(statevector, fragment_results),
        "top_basis_states": _top_basis_states(statevector, full_probabilities),
    }


def _build_qiskit_circuit(plan: ExecutionPlan) -> tuple[QuantumCircuit, list[int]]:
    num_qubits = _infer_num_qubits(plan)
    circuit = QuantumCircuit(num_qubits)
    measured_qubits: list[int] = []

    for fragment_id in plan.fragment_order:
        fragment = plan.fragments[fragment_id]
        _apply_fragment_operation(circuit, fragment, measured_qubits)

    return circuit, measured_qubits


def _infer_num_qubits(plan: ExecutionPlan) -> int:
    highest_qubit = max(
        (qubit for fragment in plan.fragments.values() for qubit in fragment.qubits),
        default=0,
    )
    return highest_qubit + 1


def _apply_fragment_operation(
    circuit: QuantumCircuit,
    fragment: CircuitFragment,
    measured_qubits: list[int],
) -> None:
    service_type = fragment.service_type
    qubits = fragment.qubits
    if fragment.raw_text and _apply_raw_operation(circuit, fragment.raw_text, qubits, measured_qubits):
        return

    if service_type == GateType.HADAMARD:
        for qubit in qubits:
            circuit.h(qubit)
        return

    if service_type == GateType.BELL_PAIR and len(qubits) >= 2:
        circuit.h(qubits[0])
        circuit.cx(qubits[0], qubits[1])
        return

    if service_type == GateType.CNOT and len(qubits) >= 2:
        circuit.cx(qubits[0], qubits[1])
        return

    if service_type == GateType.CZ and len(qubits) >= 2:
        circuit.cz(qubits[0], qubits[1])
        return

    if service_type == GateType.CONTROLLED_UNITARY and len(qubits) >= 2:
        control = qubits[0]
        for target in qubits[1:]:
            if target != control:
                circuit.cx(control, target)
        return

    if service_type == GateType.QFT and qubits:
        circuit.compose(QFTGate(len(qubits)), qubits=list(qubits), inplace=True)
        return

    if service_type == GateType.TELEPORTATION and len(qubits) >= 2:
        # The DSL models teleportation as logical state transfer between two
        # qubits; a SWAP is the closest ancilla-free unitary representation.
        circuit.swap(qubits[0], qubits[1])
        return

    if service_type == GateType.MEASUREMENT_FEEDFORWARD:
        for qubit in qubits:
            if qubit not in measured_qubits:
                measured_qubits.append(qubit)
        return

    if service_type in {GateType.SYNDROME_EXTRACTION, GateType.DISTILLATION}:
        # These services require ancillae / protocol-level context that the
        # current circuit DSL does not encode, so they are treated as logical
        # orchestration steps rather than additional unitary evolution.
        return


def _apply_raw_operation(
    circuit: QuantumCircuit,
    raw_text: str,
    qubits: tuple[int, ...],
    measured_qubits: list[int],
) -> bool:
    line = raw_text.split("//", 1)[0].strip().removesuffix(";")
    if not line:
        return False

    controlled_match = _match_controlled_operation(line)
    if controlled_match is not None:
        gate_name, params = controlled_match
        return _apply_controlled_gate(circuit, gate_name, params, qubits)

    gate_name, params = _match_operation(line)
    if gate_name is None:
        return False

    if gate_name == "measure":
        for qubit in qubits:
            if qubit not in measured_qubits:
                measured_qubits.append(qubit)
        return True

    if gate_name in {"teleport", "teleportation"} and len(qubits) >= 2:
        circuit.swap(qubits[0], qubits[1])
        return True

    if gate_name == "bell_pair" and len(qubits) >= 2:
        circuit.h(qubits[0])
        circuit.cx(qubits[0], qubits[1])
        return True

    if gate_name == "qft" and qubits:
        circuit.compose(QFTGate(len(qubits)), qubits=list(qubits), inplace=True)
        return True

    if gate_name == "iqft" and qubits:
        circuit.compose(QFTGate(len(qubits)).inverse(), qubits=list(qubits), inplace=True)
        return True

    if gate_name in {"ccnot", "ccx"} and len(qubits) >= 3:
        circuit.ccx(qubits[0], qubits[1], qubits[2])
        return True

    if gate_name == "cswap" and len(qubits) >= 3:
        circuit.cswap(qubits[0], qubits[1], qubits[2])
        return True

    if gate_name in {"syndrome_extraction", "distillation"}:
        return True

    gate = _build_base_gate(gate_name, params)
    if gate is None:
        return True

    required_qubits = gate.num_qubits
    if len(qubits) < required_qubits:
        return True

    circuit.append(gate, list(qubits[:required_qubits]))
    return True


def _match_controlled_operation(line: str) -> tuple[str, list[float]] | None:
    import re

    match = re.match(
        r"^controlled\s+(?P<gate>[A-Za-z_][A-Za-z0-9_]*)(?:\((?P<params>[^)]*)\))?\s+.+$",
        line,
        re.IGNORECASE,
    )
    if match is None:
        return None

    return match.group("gate").lower(), _parse_gate_parameters(match.group("params"))


def _match_operation(line: str) -> tuple[str | None, list[float]]:
    import re

    match = re.match(
        r"^(?P<gate>[A-Za-z_][A-Za-z0-9_]*)(?:\((?P<params>[^)]*)\))?\s+.+$",
        line,
        re.IGNORECASE,
    )
    if match is None:
        return None, []

    return match.group("gate").lower(), _parse_gate_parameters(match.group("params"))


def _parse_gate_parameters(param_block: str | None) -> list[float]:
    if param_block is None or not param_block.strip():
        return []
    return [_evaluate_numeric_expression(part.strip()) for part in param_block.split(",")]


def _apply_controlled_gate(
    circuit: QuantumCircuit,
    gate_name: str,
    params: list[float],
    qubits: tuple[int, ...],
) -> bool:
    if gate_name == "u" and len(qubits) >= 2:
        control, target = qubits[0], qubits[1]
        if control == target:
            return True
        if params:
            circuit.cp(params[0], control, target)
        else:
            circuit.cx(control, target)
        return True

    base_gate = _build_base_gate(gate_name, params)
    if base_gate is None:
        return True

    target_qubits = base_gate.num_qubits
    control_qubits = len(qubits) - target_qubits
    if control_qubits < 1:
        return True

    ordered_qubits = list(qubits[: control_qubits + target_qubits])
    if len(set(ordered_qubits)) != len(ordered_qubits):
        return True

    controlled_gate = base_gate.control(control_qubits)
    circuit.append(controlled_gate, ordered_qubits)
    return True


def _build_base_gate(gate_name: str, params: list[float]) -> Gate | None:
    if gate_name in {"id", "identity"}:
        return None
    if gate_name == "h":
        return HGate()
    if gate_name == "x":
        return XGate()
    if gate_name == "y":
        return YGate()
    if gate_name == "z":
        return ZGate()
    if gate_name == "s":
        return SGate()
    if gate_name == "sdg":
        return SGate().inverse()
    if gate_name == "t":
        return TGate()
    if gate_name == "tdg":
        return TGate().inverse()
    if gate_name == "sx":
        return SXGate()
    if gate_name == "sxdg":
        return SXGate().inverse()
    if gate_name in {"cx", "cnot"}:
        return XGate().control(1)
    if gate_name == "cy":
        return YGate().control(1)
    if gate_name == "cz":
        return ZGate().control(1)
    if gate_name == "swap":
        return SwapGate()
    if gate_name in {"rx", "ry", "rz", "p", "phase"} and not params:
        return None
    if gate_name == "rx":
        return RXGate(params[0])
    if gate_name == "ry":
        return RYGate(params[0])
    if gate_name == "rz":
        return RZGate(params[0])
    if gate_name in {"p", "phase"}:
        return PhaseGate(params[0])
    if gate_name == "u":
        if len(params) == 1:
            return PhaseGate(params[0])
        if len(params) >= 3:
            return UGate(params[0], params[1], params[2])
    return None


def _evaluate_numeric_expression(expression: str) -> float:
    normalized = expression.replace("^", "**").strip()
    parsed = ast.parse(normalized, mode="eval")
    return float(_evaluate_ast_node(parsed.body))


def _evaluate_ast_node(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)

    if isinstance(node, ast.Name) and node.id in _NUMERIC_CONSTANTS:
        return float(_NUMERIC_CONSTANTS[node.id])

    if isinstance(node, ast.BinOp):
        left = _evaluate_ast_node(node.left)
        right = _evaluate_ast_node(node.right)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.Pow):
            return left ** right
        if isinstance(node.op, ast.Mod):
            return left % right

    if isinstance(node, ast.UnaryOp):
        operand = _evaluate_ast_node(node.operand)
        if isinstance(node.op, ast.UAdd):
            return operand
        if isinstance(node.op, ast.USub):
            return -operand

    raise ValueError(f"Unsupported numeric expression: {ast.dump(node)}")


def _coerce_counts(raw_counts: dict[Any, Any]) -> dict[str, int]:
    return {
        str(state): int(count)
        for state, count in sorted(raw_counts.items(), key=lambda item: str(item[0]))
    }


def _coerce_probabilities(raw_probabilities: dict[Any, Any]) -> dict[str, float]:
    return {
        str(state): _round_float(float(probability))
        for state, probability in sorted(raw_probabilities.items(), key=lambda item: str(item[0]))
        if float(probability) > 0.0
    }


def _coerce_statevector(raw_statevector: Any) -> list[complex]:
    values: list[complex] = []
    for amplitude in raw_statevector:
        values.append(_round_complex(complex(amplitude)))
    return values


def _observable_expectations(statevector: Statevector, num_qubits: int) -> dict[str, float]:
    expectations: dict[str, float] = {}

    for qubit in range(num_qubits):
        label = _single_qubit_pauli_label("Z", num_qubits, qubit)
        expectations[f"Z_q{qubit}"] = _round_float(
            _expectation_value(statevector, label)
        )

    for left, right in combinations(range(num_qubits), 2):
        expectations[f"ZZ_q{left}_q{right}"] = _round_float(
            _expectation_value(
                statevector,
                _two_qubit_pauli_label("Z", "Z", num_qubits, left, right),
            )
        )
        expectations[f"XX_q{left}_q{right}"] = _round_float(
            _expectation_value(
                statevector,
                _two_qubit_pauli_label("X", "X", num_qubits, left, right),
            )
        )

    return expectations


def _reduced_density_matrices(
    statevector: Statevector,
    num_qubits: int,
) -> dict[str, list[list[complex]]]:
    result: dict[str, list[list[complex]]] = {}

    for qubit in range(num_qubits):
        reduced = partial_trace(statevector, [idx for idx in range(num_qubits) if idx != qubit])
        matrix = reduced.data
        result[f"q{qubit}"] = [
            [_round_complex(complex(entry)) for entry in row]
            for row in matrix
        ]

    return result


def _bloch_vectors(statevector: Statevector, num_qubits: int) -> dict[str, dict[str, float]]:
    vectors: dict[str, dict[str, float]] = {}

    for qubit in range(num_qubits):
        reduced = partial_trace(statevector, [idx for idx in range(num_qubits) if idx != qubit])
        vectors[f"q{qubit}"] = {
            "x": _round_float(_density_expectation_value(reduced, "X")),
            "y": _round_float(_density_expectation_value(reduced, "Y")),
            "z": _round_float(_density_expectation_value(reduced, "Z")),
        }

    return vectors


def _entanglement_entropy(statevector: Statevector, num_qubits: int) -> dict[str, float]:
    entropies: dict[str, float] = {}

    for qubit in range(num_qubits):
        reduced = partial_trace(statevector, [idx for idx in range(num_qubits) if idx != qubit])
        entropies[f"q{qubit}|rest"] = _round_float(float(entropy(reduced, base=2)))

    return entropies


def _fidelity_metrics(
    statevector: Statevector,
    fragment_results: tuple[FragmentExecutionResult, ...],
) -> dict[str, float | str]:
    observed_fidelities = [
        result.observed_fidelity
        for result in fragment_results
        if result.observed_fidelity is not None
    ]
    estimated_execution_fidelity = (
        prod(observed_fidelities)
        if observed_fidelities
        else 1.0
    )

    return {
        "target_state": "ideal_compiled_state",
        "fidelity_to_target_state": _round_float(float(state_fidelity(statevector, statevector))),
        "estimated_execution_fidelity": _round_float(float(estimated_execution_fidelity)),
    }


def _top_basis_states(
    statevector: Statevector,
    full_probabilities: dict[str, float],
    limit: int = TOP_BASIS_STATE_LIMIT,
) -> list[dict[str, object]]:
    amplitudes = _coerce_statevector(statevector.data)
    num_qubits = statevector.num_qubits
    ranked_states = sorted(
        (
            {
                "basis_state": format(index, f"0{num_qubits}b"),
                "probability": full_probabilities.get(format(index, f"0{num_qubits}b"), 0.0),
                "amplitude": amplitudes[index],
            }
            for index in range(len(amplitudes))
        ),
        key=lambda item: (float(item["probability"]), abs(complex(item["amplitude"]))),
        reverse=True,
    )

    return [entry for entry in ranked_states[:limit] if float(entry["probability"]) > 0.0]


def _expectation_value(statevector: Statevector, pauli_label: str) -> float:
    operator = SparsePauliOp.from_list([(pauli_label, 1.0)])
    value = statevector.expectation_value(operator)
    return float(complex(value).real)


def _density_expectation_value(density_matrix: Any, pauli_label: str) -> float:
    operator = SparsePauliOp.from_list([(pauli_label, 1.0)])
    value = density_matrix.expectation_value(operator)
    return float(complex(value).real)


def _single_qubit_pauli_label(pauli: str, num_qubits: int, qubit: int) -> str:
    labels = ["I"] * num_qubits
    # Qiskit Pauli labels are ordered q_{n-1} ... q_0.
    labels[num_qubits - 1 - qubit] = pauli
    return "".join(labels)


def _two_qubit_pauli_label(
    left_pauli: str,
    right_pauli: str,
    num_qubits: int,
    left_qubit: int,
    right_qubit: int,
) -> str:
    labels = ["I"] * num_qubits
    labels[num_qubits - 1 - left_qubit] = left_pauli
    labels[num_qubits - 1 - right_qubit] = right_pauli
    return "".join(labels)


def _round_float(value: float, decimals: int = 12) -> float:
    rounded = round(value, decimals)
    return 0.0 if abs(rounded) < 10 ** (-decimals) else rounded


def _round_complex(value: complex, decimals: int = 12) -> complex:
    real = _round_float(value.real, decimals)
    imag = _round_float(value.imag, decimals)
    return complex(real, imag)
