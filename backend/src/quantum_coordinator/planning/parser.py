"""Circuit normalization utilities for planning input."""

from __future__ import annotations

import re

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.planning.models import CircuitIR, CircuitOperation


class CircuitNormalizationError(ValueError):
    """Raised when circuit input cannot be normalized."""


_GATE_TO_SERVICE: dict[str, GateType] = {
    "cx": GateType.CNOT,
    "cnot": GateType.CNOT,
    "cz": GateType.CZ,
    "teleport": GateType.TELEPORTATION,
    "teleportation": GateType.TELEPORTATION,
    "bell_pair": GateType.BELL_PAIR,
    "bell": GateType.BELL_PAIR,
    "syndrome_extraction": GateType.SYNDROME_EXTRACTION,
    "distillation": GateType.DISTILLATION,
    "measure": GateType.MEASUREMENT_FEEDFORWARD,
    "measurement_feedforward": GateType.MEASUREMENT_FEEDFORWARD,
}

_QREG_RE = re.compile(r"^qreg\s+\w+\[(\d+)\]\s*;?$", re.IGNORECASE)
_QUBIT_RE = re.compile(r"^qubit\[(\d+)\]\s+\w+\s*;?$", re.IGNORECASE)
_GATE_LINE_RE = re.compile(r"^(?P<gate>[A-Za-z_][A-Za-z0-9_]*)\s+(?P<args>.+?)\s*;?$")
_QUBIT_ARG_RE = re.compile(r"\w+\[(\d+)\]")


def normalize_circuit_input(circuit_input: str) -> CircuitIR:
    """Normalize OpenQASM-like text to internal circuit IR."""
    cleaned_lines = _clean_lines(circuit_input)
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

        match = _GATE_LINE_RE.match(line)
        if match is None:
            raise CircuitNormalizationError(f"Unrecognized operation syntax: {line!r}")

        gate = match.group("gate").lower()
        args = match.group("args")

        service_type = _GATE_TO_SERVICE.get(gate)
        if service_type is None:
            raise CircuitNormalizationError(f"Unsupported gate/service {gate!r}")

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
        matches = _QUBIT_ARG_RE.findall(left)
    else:
        matches = _QUBIT_ARG_RE.findall(args)

    if not matches:
        raise CircuitNormalizationError(f"No qubit arguments parsed for operation: {gate} {args}")

    return tuple(int(idx) for idx in matches)
