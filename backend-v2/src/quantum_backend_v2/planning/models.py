"""Planning domain models — DAGs, fragments, cost estimates, assignments."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FragmentStatus(str, Enum):
    """Lifecycle state of a single execution fragment."""

    PENDING = "pending"
    ASSIGNED = "assigned"
    RESERVED = "reserved"
    DISPATCHED = "dispatched"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"


class WorkflowNode(BaseModel):
    """A single node in a workflow DAG."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    node_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    label: str = Field(min_length=1, max_length=120)
    inputs: dict[str, Any] = Field(default_factory=dict)
    depends_on: tuple[str, ...] = Field(default_factory=tuple)
    required_qubits: int = Field(default=1, ge=1)
    required_depth: int = Field(default=1, ge=1)
    tags: tuple[str, ...] = Field(default_factory=tuple)


class WorkflowDAG(BaseModel):
    """Directed acyclic graph describing a complete workflow."""

    model_config = ConfigDict(extra="forbid")

    dag_id: str = Field(min_length=3)
    workflow_run_id: str = Field(min_length=8)
    nodes: tuple[WorkflowNode, ...] = Field(min_length=1)
    created_at: datetime = Field(default_factory=_utc_now)

    @model_validator(mode="after")
    def _validate_dag(self) -> "WorkflowDAG":
        node_ids = {n.node_id for n in self.nodes}
        for node in self.nodes:
            for dep in node.depends_on:
                if dep not in node_ids:
                    raise ValueError(
                        f"node '{node.node_id}' depends on unknown node '{dep}'"
                    )
        return self

    def execution_order(self) -> list[WorkflowNode]:
        """Return nodes in topological order (Kahn's algorithm)."""
        in_degree: dict[str, int] = {n.node_id: 0 for n in self.nodes}
        children: dict[str, list[str]] = {n.node_id: [] for n in self.nodes}

        for node in self.nodes:
            for dep in node.depends_on:
                in_degree[node.node_id] += 1
                children[dep].append(node.node_id)

        queue = [n for n in self.nodes if in_degree[n.node_id] == 0]
        result: list[WorkflowNode] = []
        node_map = {n.node_id: n for n in self.nodes}

        while queue:
            current = queue.pop(0)
            result.append(current)
            for child_id in children[current.node_id]:
                in_degree[child_id] -= 1
                if in_degree[child_id] == 0:
                    queue.append(node_map[child_id])

        if len(result) != len(self.nodes):
            raise ValueError("workflow DAG contains a cycle")

        return result


class ExecutionFragment(BaseModel):
    """A single dispatchable unit of work derived from a workflow node."""

    model_config = ConfigDict(extra="forbid")

    fragment_id: str = Field(min_length=3)
    workflow_run_id: str = Field(min_length=8)
    node_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    input_snapshot: dict[str, Any] = Field(default_factory=dict)
    required_qubits: int = Field(default=1, ge=1)
    required_depth: int = Field(default=1, ge=1)
    status: FragmentStatus = FragmentStatus.PENDING
    attempt: int = Field(default=0, ge=0)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


class CostEstimate(BaseModel):
    """Cost estimate for assigning a fragment to a specific peer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    fragment_id: str = Field(min_length=3)
    candidate_peer_id: str = Field(min_length=3)
    estimated_latency_ms: float = Field(ge=0.0)
    estimated_fidelity: float = Field(ge=0.0, le=1.0)
    locality_score: float = Field(default=0.5, ge=0.0, le=1.0)
    reputation_score: float = Field(default=0.5, ge=0.0, le=1.0)
    composite_score: float = Field(ge=0.0, le=1.0)


class FragmentAssignment(BaseModel):
    """Result of the planner assigning a fragment to a peer."""

    model_config = ConfigDict(extra="forbid")

    fragment_id: str = Field(min_length=3)
    assigned_peer_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    cost_estimate: CostEstimate
    assigned_at: datetime = Field(default_factory=_utc_now)
