"""Fragment generation from normalized operations."""

from __future__ import annotations

from quantum_coordinator.planning.models import CircuitFragment, CircuitIR


def build_fragments(
    circuit: CircuitIR,
    operation_dependencies: dict[str, tuple[str, ...]],
) -> dict[str, CircuitFragment]:
    """Create one fragment per operation for the current planning stage."""
    fragments: dict[str, CircuitFragment] = {}

    for operation in circuit.operations:
        fragment_id = operation.operation_id.replace("op", "frag", 1)
        op_dep_ids = operation_dependencies[operation.operation_id]
        dependency_ids = tuple(
            dep_id.replace("op", "frag", 1)
            for dep_id in op_dep_ids
        )

        fragments[fragment_id] = CircuitFragment(
            fragment_id=fragment_id,
            service_type=operation.service_type,
            qubits=operation.qubits,
            operation_ids=(operation.operation_id,),
            dependencies=dependency_ids,
            raw_text=operation.raw_text,
        )

    return fragments
