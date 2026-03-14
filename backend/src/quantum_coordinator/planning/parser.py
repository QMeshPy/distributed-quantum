"""Circuit normalization utilities for planning input."""

from __future__ import annotations

import ast
import operator
import re

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning.models import CircuitIR, CircuitOperation


class CircuitNormalizationError(ValueError):
    """Raised when circuit input cannot be normalized."""


_GATE_TO_SERVICE: dict[str, GateType] = {
    "h": GateType.HADAMARD,
    "cx": GateType.CNOT,
    "cnot": GateType.CNOT,
    "cz": GateType.CZ,
    "controlled_u": GateType.CONTROLLED_UNITARY,
    "qft": GateType.QFT,
    "teleport": GateType.TELEPORTATION,
    "teleportation": GateType.TELEPORTATION,
    "bell_pair": GateType.BELL_PAIR,
    "bell": GateType.BELL_PAIR,
    "syndrome_extraction": GateType.SYNDROME_EXTRACTION,
    "distillation": GateType.DISTILLATION,
    "measure": GateType.MEASUREMENT_FEEDFORWARD,
    "measurement_feedforward": GateType.MEASUREMENT_FEEDFORWARD,
}

_FOR_LOOP_RE = re.compile(
    r"^for\s+(?P<var>[A-Za-z_][A-Za-z0-9_]*)\s+in\s+\[(?P<start>[^\]]+?)\s*:\s*(?P<end>[^\]]+?)\]\s*\{$",
    re.IGNORECASE,
)
_QREG_RE = re.compile(r"^qreg\s+\w+\[(\d+)\]\s*;?$", re.IGNORECASE)
_QUBIT_RE = re.compile(r"^qubit\[(\d+)\]\s+\w+\s*;?$", re.IGNORECASE)
_CONTROLLED_GATE_RE = re.compile(
    r"^controlled\s+(?P<gate>[A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?\s+(?P<args>.+?)\s*;?$",
    re.IGNORECASE,
)
_GATE_LINE_RE = re.compile(
    r"^(?P<gate>[A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?\s+(?P<args>.+?)\s*;?$"
)
_QUBIT_TOKEN_RE = re.compile(
    r"\w+\[(?:(?P<range_start>[^:\]]+?)\s*:\s*(?P<range_end>[^\]]+?)|(?P<single>[^\]:]+?))\]"
)
_SAFE_BINARY_OPERATORS: dict[type[ast.operator], object] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_SAFE_UNARY_OPERATORS: dict[type[ast.unaryop], object] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def normalize_circuit_input(circuit_input: str) -> CircuitIR:
    """Normalize OpenQASM-like text to internal circuit IR."""
    cleaned_lines = _expand_for_loops(_clean_lines(circuit_input))
    if not cleaned_lines:
        raise CircuitNormalizationError("Circuit is empty")

    circuit_format = _detect_format(cleaned_lines)
    num_qubits = _extract_num_qubits(cleaned_lines)
    operations = _parse_operations(cleaned_lines)

    if not operations:
        raise CircuitNormalizationError("No executable operations found in circuit")

    return CircuitIR(
        num_qubits=num_qubits,
        operations=tuple(operations),
        format=circuit_format,
    )


def _clean_lines(raw: str) -> list[str]:
    lines: list[str] = []
    for line in raw.splitlines():
        trimmed = line.split("//", 1)[0].strip()
        if not trimmed:
            continue
        lines.append(trimmed)
    return lines


def _expand_for_loops(lines: list[str]) -> list[str]:
    expanded: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        loop_match = _FOR_LOOP_RE.match(line)
        if loop_match is None:
            if line == "}":
                raise CircuitNormalizationError("Unexpected closing brace in circuit")
            expanded.append(line)
            index += 1
            continue

        body_lines, next_index = _collect_loop_body(lines, index + 1)
        start = _evaluate_int_expression(loop_match.group("start"))
        end = _evaluate_int_expression(loop_match.group("end"))
        var_name = loop_match.group("var")

        for value in range(start, end + 1):
            substituted_body = [
                _substitute_loop_var(body_line, var_name, value)
                for body_line in body_lines
            ]
            expanded.extend(_expand_for_loops(substituted_body))

        index = next_index

    return expanded


def _collect_loop_body(lines: list[str], start_index: int) -> tuple[list[str], int]:
    body: list[str] = []
    depth = 1
    index = start_index

    while index < len(lines):
        line = lines[index]
        if _FOR_LOOP_RE.match(line):
            depth += 1
            body.append(line)
        elif line == "}":
            depth -= 1
            if depth == 0:
                return body, index + 1
            body.append(line)
        else:
            body.append(line)
        index += 1

    raise CircuitNormalizationError("Unterminated for-loop block in circuit")


def _substitute_loop_var(line: str, var_name: str, value: int) -> str:
    pattern = rf"\b{re.escape(var_name)}\b"
    return re.sub(pattern, str(value), line)


def _detect_format(lines: list[str]) -> str:
    header = lines[0].lower()
    if header.startswith("openqasm 3"):
        return "openqasm3"
    if header.startswith("openqasm 2"):
        return "openqasm2"

    if any(line.lower().startswith("qubit[") for line in lines):
        return "openqasm3"
    if any(line.lower().startswith("qreg ") for line in lines):
        return "openqasm2"

    raise CircuitNormalizationError(
        "Unsupported circuit format: expected OpenQASM 2/3 style declarations"
    )


def _extract_num_qubits(lines: list[str]) -> int:
    for line in lines:
        qreg_match = _QREG_RE.match(line)
        if qreg_match is not None:
            return int(qreg_match.group(1))

        qubit_match = _QUBIT_RE.match(line)
        if qubit_match is not None:
            return int(qubit_match.group(1))

    raise CircuitNormalizationError("Missing qubit register declaration (qreg/qubit)")


def _parse_operations(lines: list[str]) -> list[CircuitOperation]:
    operations: list[CircuitOperation] = []
    op_index = 0

    for line in lines:
        lower = line.lower()
        if _is_declaration_line(lower):
            continue

        gate, args = _parse_gate_and_args(line)
        if gate is None or args is None:
            raise CircuitNormalizationError(f"Unrecognized operation syntax: {line!r}")

        service_type = _GATE_TO_SERVICE.get(gate, GateType.PROGRAMMABLE_GATE)

        qubits = _extract_qubits(gate, args)
        op_index += 1
        operations.append(
            CircuitOperation(
                operation_id=f"op-{op_index:04d}",
                service_type=service_type,
                qubits=qubits,
                source_index=op_index,
                raw_text=line,
            )
        )

    return operations


def _parse_gate_and_args(line: str) -> tuple[str | None, str | None]:
    controlled_match = _CONTROLLED_GATE_RE.match(line)
    if controlled_match is not None:
        controlled_gate = controlled_match.group("gate").lower()
        return f"controlled_{controlled_gate}", controlled_match.group("args")

    match = _GATE_LINE_RE.match(line)
    if match is None:
        return None, None

    return match.group("gate").lower(), match.group("args")


def _is_declaration_line(lower_line: str) -> bool:
    prefixes = (
        "openqasm",
        "include",
        "qreg",
        "creg",
        "qubit",
        "bit",
    )
    return lower_line.startswith(prefixes)


def _extract_qubits(gate: str, args: str) -> tuple[int, ...]:
    if gate == "measure":
        left = args.split("->", 1)[0]
        matches = _QUBIT_TOKEN_RE.finditer(left)
    else:
        matches = _QUBIT_TOKEN_RE.finditer(args)

    qubits: list[int] = []
    for match in matches:
        single = match.group("single")
        if single is not None:
            qubits.append(_evaluate_qubit_expression(single))
            continue

        range_start = match.group("range_start")
        range_end = match.group("range_end")
        if range_start is None or range_end is None:
            continue

        start = _evaluate_qubit_expression(range_start)
        end = _evaluate_qubit_expression(range_end)
        step = 1 if end >= start else -1
        qubits.extend(range(start, end + step, step))

    if not qubits:
        raise CircuitNormalizationError(f"No qubit arguments parsed for operation: {gate} {args}")

    return tuple(qubits)


def _evaluate_qubit_expression(expression: str) -> int:
    value = _evaluate_int_expression(expression)
    if value < 0:
        raise CircuitNormalizationError(f"Qubit index must be non-negative: {expression!r}")
    return value


def _evaluate_int_expression(expression: str) -> int:
    value = _evaluate_numeric_expression(expression)
    if not float(value).is_integer():
        raise CircuitNormalizationError(f"Expected integer-valued expression: {expression!r}")
    return int(value)


def _evaluate_numeric_expression(expression: str) -> float:
    normalized = expression.replace("^", "**").strip()
    try:
        parsed = ast.parse(normalized, mode="eval")
    except SyntaxError as exc:
        raise CircuitNormalizationError(
            f"Invalid arithmetic expression: {expression!r}"
        ) from exc

    result = _evaluate_ast_node(parsed.body)
    return float(result)


def _evaluate_ast_node(node: ast.AST) -> int | float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value

    if isinstance(node, ast.BinOp):
        operator_fn = _SAFE_BINARY_OPERATORS.get(type(node.op))
        if operator_fn is None:
            raise CircuitNormalizationError("Unsupported arithmetic operator in circuit expression")
        left = _evaluate_ast_node(node.left)
        right = _evaluate_ast_node(node.right)
        return operator_fn(left, right)

    if isinstance(node, ast.UnaryOp):
        operator_fn = _SAFE_UNARY_OPERATORS.get(type(node.op))
        if operator_fn is None:
            raise CircuitNormalizationError("Unsupported unary operator in circuit expression")
        operand = _evaluate_ast_node(node.operand)
        return operator_fn(operand)

    raise CircuitNormalizationError("Unsupported arithmetic expression in circuit")
