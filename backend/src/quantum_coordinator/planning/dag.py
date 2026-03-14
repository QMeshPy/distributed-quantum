"""Dependency graph construction for normalized circuit operations."""

from __future__ import annotations

from heapq import heappop, heappush

from quantum_coordinator.planning.models import CircuitIR


def build_operation_dependencies(circuit: CircuitIR) -> dict[str, tuple[str, ...]]:
    """Build operation dependency map based on qubit usage ordering."""
    last_operation_for_qubit: dict[int, str] = {}
    dependencies: dict[str, tuple[str, ...]] = {}

    for operation in circuit.operations:
        dep_ids: list[str] = []
        for qubit in operation.qubits:
            previous = last_operation_for_qubit.get(qubit)
            if previous is not None and previous not in dep_ids:
                dep_ids.append(previous)

        dependencies[operation.operation_id] = tuple(dep_ids)

        for qubit in operation.qubits:
            last_operation_for_qubit[qubit] = operation.operation_id

    return dependencies


def topological_order(dependencies: dict[str, tuple[str, ...]]) -> tuple[str, ...]:
    """Compute topological order for an operation dependency map."""
    in_degree: dict[str, int] = {node_id: 0 for node_id in dependencies}
    outgoing: dict[str, list[str]] = {node_id: [] for node_id in dependencies}

    for node_id, dep_ids in dependencies.items():
        in_degree[node_id] = len(dep_ids)
        for dep in dep_ids:
            outgoing.setdefault(dep, []).append(node_id)

    ready = [node_id for node_id, degree in in_degree.items() if degree == 0]
    ready.sort()
    ordered: list[str] = []

    while ready:
        node_id = heappop(ready)
        ordered.append(node_id)

        for dependent in sorted(outgoing.get(node_id, [])):
            in_degree[dependent] -= 1
            if in_degree[dependent] == 0:
                heappush(ready, dependent)

    if len(ordered) != len(dependencies):
        raise ValueError("Dependency graph contains a cycle or unresolved node")

    return tuple(ordered)
