"""Service capability and quality tracking.

Provides fidelity metrics and service capabilities based on Qiskit backend
characteristics and transpiled service circuits.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from qiskit import QuantumCircuit, transpile  # pyright: ignore[reportMissingImports]
from qiskit.circuit.library import QFT  # pyright: ignore[reportMissingImports]
from qiskit.providers.backend import BackendV2  # pyright: ignore[reportMissingImports]
from qiskit.providers.basic_provider import BasicProvider  # pyright: ignore[reportMissingImports]
from qiskit.providers.basic_provider.basic_simulator import (  # pyright: ignore[reportMissingImports]
    BasicSimulator,
)


def _build_hadamard() -> QuantumCircuit:
    circuit = QuantumCircuit(1)
    circuit.h(0)
    return circuit


def _build_cnot() -> QuantumCircuit:
    circuit = QuantumCircuit(2)
    circuit.cx(0, 1)
    return circuit


def _build_bell_pair() -> QuantumCircuit:
    circuit = QuantumCircuit(2)
    circuit.h(0)
    circuit.cx(0, 1)
    return circuit


def _build_teleportation() -> QuantumCircuit:
    circuit = QuantumCircuit(3, 2)
    circuit.h(1)
    circuit.cx(1, 2)
    circuit.cx(0, 1)
    circuit.h(0)
    circuit.measure(0, 0)
    circuit.measure(1, 1)
    with circuit.if_test((circuit.clbits[0], 1)):
        circuit.z(2)
    with circuit.if_test((circuit.clbits[1], 1)):
        circuit.x(2)
    return circuit


def _build_qft() -> QuantumCircuit:
    return QFT(num_qubits=2, do_swaps=True).decompose()


def _build_distillation() -> QuantumCircuit:
    circuit = QuantumCircuit(4)
    circuit.h(0)
    circuit.cx(0, 1)
    circuit.cx(1, 2)
    circuit.cx(2, 3)
    circuit.t(0)
    circuit.t(1)
    circuit.t(2)
    circuit.t(3)
    return circuit


def _build_syndrome_extraction() -> QuantumCircuit:
    circuit = QuantumCircuit(3, 1)
    circuit.cx(0, 2)
    circuit.cx(1, 2)
    circuit.measure(2, 0)
    return circuit


def _build_measurement_feedforward() -> QuantumCircuit:
    circuit = QuantumCircuit(2, 1)
    circuit.measure(0, 0)
    with circuit.if_test((circuit.clbits[0], 1)):
        circuit.x(1)
    return circuit


def _build_controlled_unitary() -> QuantumCircuit:
    circuit = QuantumCircuit(2)
    circuit.cu(0.1, 0.2, 0.3, 0.4, 0, 1)
    return circuit


def _build_cz() -> QuantumCircuit:
    circuit = QuantumCircuit(2)
    circuit.cz(0, 1)
    return circuit


def _build_programmable_gate() -> QuantumCircuit:
    circuit = QuantumCircuit(1)
    circuit.u(0.12, 0.34, 0.56, 0)
    return circuit


SERVICE_CIRCUITS: dict[str, Callable[[], QuantumCircuit]] = {
    "hadamard": _build_hadamard,
    "cnot": _build_cnot,
    "bell_pair": _build_bell_pair,
    "teleportation": _build_teleportation,
    "qft": _build_qft,
    "distillation": _build_distillation,
    "syndrome_extraction": _build_syndrome_extraction,
    "measurement_feedforward": _build_measurement_feedforward,
    "controlled_unitary": _build_controlled_unitary,
    "cz": _build_cz,
    "programmable_gate": _build_programmable_gate,
}


@dataclass
class ServiceCapabilities:
    """Capabilities for a quantum service."""

    service_id: str
    qubit_min: int
    qubit_max: int
    fidelity: float
    gate_set: list[str]
    connectivity: str  # "all-to-all", "linear", "custom"


class ServiceQualityTracker:
    """Tracks service quality metrics and capabilities."""

    def __init__(self) -> None:
        self._backend = self._resolve_backend()
        self._max_qubits = self._resolve_max_qubits()
        self._service_defaults = self._build_service_defaults()
        self._peer_fidelity: dict[str, float] = {}

    def _resolve_backend(self) -> BackendV2:
        provider = BasicProvider()
        backend = provider.get_backend("basic_simulator")
        if not isinstance(backend, BackendV2):
            raise TypeError("Qiskit basic_simulator is not a BackendV2 instance")
        return backend

    def _resolve_max_qubits(self) -> int:
        backend_qubits = self._backend.num_qubits
        if backend_qubits is not None:
            return int(backend_qubits)
        return 30  # BasicSimulator default; MAX_QUBITS_STATEVECTOR removed in Qiskit 1.x

    def _build_service_defaults(self) -> dict[str, ServiceCapabilities]:
        capabilities: dict[str, ServiceCapabilities] = {}
        connectivity = self._connectivity_type()
        qubit_max = self._max_qubits

        for service_id, factory in SERVICE_CIRCUITS.items():
            circuit = factory()
            try:
                transpiled = transpile(circuit, backend=self._backend, optimization_level=1)
            except Exception:
                transpiled = circuit
            fidelity = self._estimate_fidelity(transpiled)
            gate_set = sorted({instruction.operation.name for instruction in transpiled.data})
            capabilities[service_id] = ServiceCapabilities(
                service_id=service_id,
                qubit_min=circuit.num_qubits,
                qubit_max=qubit_max,
                fidelity=fidelity,
                gate_set=gate_set,
                connectivity=connectivity,
            )
        return capabilities

    def _connectivity_type(self) -> str:
        coupling_map = self._backend.coupling_map
        if coupling_map is None:
            return "all-to-all"

        edges = {tuple(sorted(edge)) for edge in coupling_map.get_edges()}
        num_qubits = int(self._backend.num_qubits)
        complete_edges = num_qubits * (num_qubits - 1) // 2
        if len(edges) >= complete_edges:
            return "all-to-all"

        degrees = [0] * num_qubits
        for src, dst in edges:
            degrees[src] += 1
            degrees[dst] += 1
        if len(edges) == num_qubits - 1 and all(degree <= 2 for degree in degrees):
            return "linear"
        return "custom"

    def _estimate_fidelity(self, transpiled_circuit: QuantumCircuit) -> float:
        target = self._backend.target
        errors: list[float] = []

        for instruction_name in transpiled_circuit.count_ops():
            if instruction_name not in target:
                continue
            instruction_props = target[instruction_name]
            for props in instruction_props.values():
                if props is not None and props.error is not None:
                    errors.append(props.error)

        if not errors:
            return 0.99

        average_error = sum(errors) / len(errors)
        return max(0.0, min(1.0, 1.0 - average_error))

    def get_service_capabilities(self, service_id: str) -> ServiceCapabilities:
        """Get capabilities for a service type."""
        return self._service_defaults.get(
            service_id,
            ServiceCapabilities(
                service_id=service_id,
                qubit_min=1,
                qubit_max=self._max_qubits,
                fidelity=0.90,
                gate_set=sorted(set(self._backend.operation_names)),
                connectivity=self._connectivity_type(),
            ),
        )

    def get_peer_fidelity(self, peer_id: str, base_fidelity: float = 0.95) -> float:
        """Get fidelity for a specific peer."""
        return self._peer_fidelity.get(peer_id, base_fidelity)

    def update_peer_fidelity(self, peer_id: str, fidelity: float) -> None:
        """Update fidelity for a peer based on observations."""
        self._peer_fidelity[peer_id] = fidelity

    def get_service_fidelity(self, service_id: str, peer_id: str | None = None) -> float:
        """Get fidelity for a service, optionally for a specific peer."""
        capabilities = self.get_service_capabilities(service_id)
        base_fidelity = capabilities.fidelity
        if peer_id:
            return self.get_peer_fidelity(peer_id, base_fidelity)
        return base_fidelity
