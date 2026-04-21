"""Qiskit helpers for fragment-level distributed state handoff."""

from __future__ import annotations

import ast
from math import e, pi, tau

from qiskit import QuantumCircuit  # pyright: ignore[reportMissingImports]
from qiskit.circuit import Gate  # pyright: ignore[reportMissingImports]
from qiskit.circuit.library import QFTGate  # pyright: ignore[reportMissingImports]
from qiskit.circuit.library import (  # pyright: ignore[reportMissingImports]
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
from qiskit.quantum_info import Statevector, state_fidelity  # pyright: ignore[reportMissingImports]

from quantum_backend_v2.protocols.execution import (
    DistributedStateHandoff,
    FragmentDescriptor,
    FragmentDispatchOutput,
)

DEFAULT_RESULT_SHOTS = 1024
DEFAULT_RESULT_SEED = 0
_NUMERIC_CONSTANTS = {
    "e": e,
    "pi": pi,
    "tau": tau,
}


def make_initial_state_handoff(num_qubits: int) -> DistributedStateHandoff:
    """Build the initial all-zero state handoff for a plan."""
    return DistributedStateHandoff(num_qubits=num_qubits)


def apply_fragment_to_state(
    *,
    fragment: FragmentDescriptor,
    state: DistributedStateHandoff,
    previous_peer_id: str,
) -> FragmentDispatchOutput:
    """Apply one fragment to the handed-off state and return the updated state."""
    statevector = statevector_from_handoff(state)
    measured_qubits = list(state.measured_qubits)
    circuit = QuantumCircuit(state.num_qubits)
    _apply_fragment_operation(
        circuit,
        fragment=fragment,
        measured_qubits=measured_qubits,
    )
    next_statevector = statevector.evolve(circuit) if circuit.data else statevector
    next_state = DistributedStateHandoff(
        num_qubits=state.num_qubits,
        amplitudes=serialize_statevector(next_statevector),
        measured_qubits=tuple(measured_qubits),
        previous_peer_id=previous_peer_id,
    )
    return FragmentDispatchOutput(
        state=next_state,
        gate_count=len(circuit.data),
        circuit_depth=circuit.depth() or 0,
        state_transfer_bytes=len(next_state.model_dump_json().encode("utf-8")),
    )


def summarize_state_handoff(
    state: DistributedStateHandoff,
    *,
    shots: int = DEFAULT_RESULT_SHOTS,
    seed: int = DEFAULT_RESULT_SEED,
) -> dict[str, object]:
    """Summarize a remote final state into backend-facing result fields."""
    statevector = statevector_from_handoff(state)
    measured_qubits = list(state.measured_qubits)

    counts: dict[str, int] | None = None
    measured_probabilities: dict[str, float] | None = None
    if measured_qubits:
        statevector.seed(seed)
        counts = _coerce_counts(
            statevector.sample_counts(shots=shots, qargs=measured_qubits)
        )
        measured_probabilities = _coerce_probabilities(
            statevector.probabilities_dict(qargs=measured_qubits)
        )

    return {
        "counts": counts,
        "probabilities": _coerce_probabilities(statevector.probabilities_dict()),
        "measured_probabilities": measured_probabilities,
        "statevector": list(state.amplitudes or serialize_statevector(statevector)),
        "measured_qubits": measured_qubits or None,
        "shots": shots if counts is not None else None,
    }


def statevector_from_handoff(state: DistributedStateHandoff) -> Statevector:
    """Decode a handoff payload into a Qiskit statevector."""
    amplitudes = state.amplitudes
    if not amplitudes:
        vector = [0j] * (2 ** state.num_qubits)
        vector[0] = 1 + 0j
        return Statevector(vector)
    return Statevector([complex(value) for value in amplitudes])


def serialize_statevector(statevector: Statevector) -> tuple[str, ...]:
    """Encode a Qiskit statevector into a JSON-safe tuple of amplitudes."""
    return tuple(_format_complex(complex(value)) for value in statevector.data)


def fidelity_between_handoffs(
    left: DistributedStateHandoff,
    right: DistributedStateHandoff,
) -> float:
    """Compute fidelity between two distributed state handoffs."""
    return float(
        state_fidelity(
            statevector_from_handoff(left),
            statevector_from_handoff(right),
        )
    )


def _apply_fragment_operation(
    circuit: QuantumCircuit,
    *,
    fragment: FragmentDescriptor,
    measured_qubits: list[int],
) -> None:
    if fragment.raw_text and _apply_raw_operation(
        circuit,
        raw_text=fragment.raw_text,
        qubits=fragment.qubits,
        measured_qubits=measured_qubits,
    ):
        return

    service_id = fragment.service_id
    qubits = fragment.qubits

    if service_id == "hadamard":
        for qubit in qubits:
            circuit.h(qubit)
        return

    if service_id == "bell_pair" and len(qubits) >= 2:
        circuit.h(qubits[0])
        circuit.cx(qubits[0], qubits[1])
        return

    if service_id == "cnot" and len(qubits) >= 2:
        circuit.cx(qubits[0], qubits[1])
        return

    if service_id == "cz" and len(qubits) >= 2:
        circuit.cz(qubits[0], qubits[1])
        return

    if service_id == "controlled_unitary" and len(qubits) >= 2:
        control = qubits[0]
        for target in qubits[1:]:
            if target != control:
                circuit.cx(control, target)
        return

    if service_id == "qft" and qubits:
        circuit.compose(QFTGate(len(qubits)), qubits=list(qubits), inplace=True)
        return

    if service_id == "teleportation" and len(qubits) >= 2:
        circuit.swap(qubits[0], qubits[1])
        return

    if service_id == "measurement_feedforward":
        for qubit in qubits:
            if qubit not in measured_qubits:
                measured_qubits.append(qubit)
        return

    if service_id in {"syndrome_extraction", "distillation"}:
        return

    if service_id == "programmable_gate" and qubits:
        circuit.append(UGate(0.12, 0.34, 0.56), [qubits[0]])


def _apply_raw_operation(
    circuit: QuantumCircuit,
    *,
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

    circuit.append(base_gate.control(control_qubits), ordered_qubits)
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
            return left**right
        if isinstance(node.op, ast.Mod):
            return left % right

    if isinstance(node, ast.UnaryOp):
        operand = _evaluate_ast_node(node.operand)
        if isinstance(node.op, ast.UAdd):
            return operand
        if isinstance(node.op, ast.USub):
            return -operand

    raise ValueError(f"Unsupported numeric expression: {ast.dump(node)}")


def _coerce_counts(raw_counts: dict[object, object]) -> dict[str, int]:
    return {
        str(state): int(count)
        for state, count in sorted(raw_counts.items(), key=lambda item: str(item[0]))
    }


def _coerce_probabilities(raw_probabilities: dict[object, object]) -> dict[str, float]:
    return {
        str(state): round(float(probability), 12)
        for state, probability in sorted(raw_probabilities.items(), key=lambda item: str(item[0]))
        if float(probability) > 0.0
    }


def _format_complex(value: complex) -> str:
    real = round(value.real, 12)
    imag = round(value.imag, 12)

    if imag == 0:
        return f"{real}"
    if real == 0:
        return f"{imag}j"
    sign = "+" if imag >= 0 else "-"
    return f"{real}{sign}{abs(imag)}j"
