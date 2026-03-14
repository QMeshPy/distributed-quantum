"""Qiskit-backed quantum result generation for executed plans."""

from __future__ import annotations

from itertools import combinations
from math import prod
from typing import Any

from qiskit import QuantumCircuit  # type: ignore[import-not-found]
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
