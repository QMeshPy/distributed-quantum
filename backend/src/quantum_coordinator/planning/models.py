"""Planning domain models for circuit compilation and assignment."""

from __future__ import annotations

from dataclasses import dataclass, field

from quantum_coordinator.domain.models import GateType


@dataclass(frozen=True)
class CircuitOperation:
    """Single normalized operation from a user circuit."""

    operation_id: str
    service_type: GateType
    qubits: tuple[int, ...]
    source_index: int
    raw_text: str


@dataclass(frozen=True)
class CircuitIR:
    """Normalized circuit representation used by planner pipeline."""

    num_qubits: int
    operations: tuple[CircuitOperation, ...]
    format: str


@dataclass(frozen=True)
class CircuitFragment:
    """Executable fragment with dependencies and target service type."""

    fragment_id: str
    service_type: GateType
    qubits: tuple[int, ...]
    operation_ids: tuple[str, ...]
    dependencies: tuple[str, ...]
    raw_text: str = ""


@dataclass(frozen=True)
class CandidateScore:
    """Cost breakdown for assigning one fragment to one node."""

    node_id: str
    total_cost: float
    latency_cost: float
    failure_risk_cost: float
    entanglement_cost: float
    load_cost: float
    fidelity: float


@dataclass(frozen=True)
class FragmentAssignment:
    """Primary and fallback assignment for a fragment."""

    fragment_id: str
    primary_node_id: str
    fallback_node_ids: tuple[str, ...]
    candidates: tuple[CandidateScore, ...]


@dataclass(frozen=True)
class ExecutionPlan:
    """Output plan produced by the compiler/planner."""

    plan_id: str
    fragment_order: tuple[str, ...]
    fragments: dict[str, CircuitFragment]
    assignments: dict[str, FragmentAssignment]
    quality_snapshot_id: str


@dataclass(frozen=True)
class PlannerWeights:
    """Cost model weights.

    The planner minimizes:
    w_lat * latency + w_fail * failure_risk + w_ent * entanglement + w_load * load
    """

    w_lat: float = 0.25
    w_fail: float = 0.5
    w_ent: float = 0.15
    w_load: float = 0.10


@dataclass
class PlannerConfig:
    """Planner configuration knobs."""

    min_fidelity: float = 0.80
    fallback_count: int = 2
    seed: int | None = None
    weights: PlannerWeights = field(default_factory=PlannerWeights)
