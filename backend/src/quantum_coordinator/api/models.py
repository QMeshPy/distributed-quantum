"""API request and response models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class JobQuantumResult(BaseModel):
    """Quantum output of the executed circuit.

    For measured circuits, `counts` reflects sampled readout over
    `measured_qubits`, while `probabilities` and `statevector` describe the
    pre-measurement quantum state.
    """

    counts: dict[str, int] | None = None
    probabilities: dict[str, float] | None = None
    measured_probabilities: dict[str, float] | None = None
    statevector: list[complex] | None = None
    shots: int | None = None
    measured_qubits: list[int] | None = None
    observable_expectations: dict[str, float] | None = None
    reduced_density_matrices: dict[str, list[list[complex]]] | None = None
    bloch_vectors: dict[str, dict[str, float]] | None = None
    entanglement_entropy: dict[str, float] | None = None
    fidelity: dict[str, Any] | None = None
    top_basis_states: list[dict[str, Any]] | None = None


class JobResult(BaseModel):
    """Structured job result including fragment execution and quantum output."""

    job_id: str
    fragment_results: list[dict[str, Any]]
    quantum_result: JobQuantumResult | None = None


class JobProgressResponse(BaseModel):
    """Live execution progress for a routed job."""

    total_fragments: int
    completed_fragments: int
    active_fragments: int
    completion_ratio: float
    latest_event_at: datetime | None = None
    finalizing: bool = False


class HealthResponse(BaseModel):
    """Response payload for health checks."""

    status: str
    service: str
    version: str
    environment: str
    uptime_seconds: float


class CircuitSubmitRequest(BaseModel):
    """Request body for circuit submission."""

    circuit: str = Field(min_length=1)


class CircuitSubmitResponse(BaseModel):
    """Immediate response after job enqueue."""

    job_id: str
    status: str


class JobStatusResponse(BaseModel):
    """Current state for a submitted job."""

    job_id: str
    status: str
    plan_id: str | None
    error: str | None
    result: JobResult | None
    progress: JobProgressResponse | None = None
    circuit_text: str
    created_at: datetime
    updated_at: datetime


class JobListItemResponse(BaseModel):
    """Lightweight job record for run history screens."""

    job_id: str
    status: str
    plan_id: str | None
    error: str | None
    progress: JobProgressResponse | None = None
    circuit_preview: str
    result_available: bool = False
    created_at: datetime
    updated_at: datetime


class ServiceResponse(BaseModel):
    """Service registry item."""

    node_id: str
    listen_addrs: list[str]
    service_type: str
    fidelity: float
    qubit_min: int
    qubit_max: int
    availability: bool
    updated_at: datetime


class FidelitySampleResponse(BaseModel):
    """Per-service fidelity data for one node."""

    service_type: str
    fidelity: float
    availability: bool
    updated_at: datetime


class FidelityMetricsResponse(BaseModel):
    """Aggregated fidelity metrics for one node."""

    node_id: str
    sample_count: int
    average_fidelity: float
    min_fidelity: float
    max_fidelity: float
    samples: list[FidelitySampleResponse]


class JobUpdateResponse(BaseModel):
    """Websocket payload for job updates."""

    job_id: str
    status: str
    error: str | None
    progress: JobProgressResponse | None = None
    updated_at: datetime


class TopologyCoordinatorResponse(BaseModel):
    """Coordinator transport-level connectivity details."""

    peer_id: str
    listen_addrs: list[str]
    connected_peer_ids: list[str]
    connected_peer_count: int


class TopologyBehaviorResponse(BaseModel):
    """Verbose behavior profile for an embedded peer."""

    profile_name: str
    base_fidelity: float
    qubit_min: int
    qubit_max: int
    supported_gate_types: list[str]
    base_availability: bool
    response_delay_seconds: float
    transient_error_rate: float
    availability_flap_period_seconds: float


class TopologyAdvertisementResponse(BaseModel):
    """Service advertisement attached to a topology node."""

    node_id: str
    listen_addrs: list[str]
    service_type: str
    fidelity: float
    qubit_min: int
    qubit_max: int
    availability: bool
    updated_at: datetime


class TopologyServiceNodeResponse(BaseModel):
    """Verbose transport + behavior + capability payload for one service peer."""

    index: int
    peer_id: str
    listen_addrs: list[str]
    connected_peer_ids: list[str]
    connected_peer_count: int
    current_availability: bool
    behavior: TopologyBehaviorResponse
    advertisements: list[TopologyAdvertisementResponse]


class TopologyDirectedEdgeResponse(BaseModel):
    """One observed directed transport edge."""

    source_peer_id: str
    target_peer_id: str
    source_role: str
    target_role: str
    source_listen_addrs: list[str]
    target_listen_addrs: list[str]
    is_coordinator_edge: bool
    observed_direction: str


class TopologyUndirectedEdgeResponse(BaseModel):
    """Pair-level view of connectivity with mutuality flags."""

    peer_a: str
    peer_b: str
    peer_a_role: str
    peer_b_role: str
    peer_a_listen_addrs: list[str]
    peer_b_listen_addrs: list[str]
    a_observes_b: bool
    b_observes_a: bool
    mutual: bool


class TopologyRegistryEntryResponse(BaseModel):
    """Registry ad entry included in topology snapshots."""

    node_id: str
    service_type: str
    listen_addrs: list[str]
    fidelity: float
    qubit_min: int
    qubit_max: int
    availability: bool
    updated_at: datetime
    expires_at: datetime


class NetworkTopologyResponse(BaseModel):
    """High-verbosity network connectivity snapshot."""

    fabric_running: bool
    topic: str
    gate_protocol_id: str
    embedded_service_count_configured: int
    embedded_peer_behavior_mode: str
    embedded_peer_random_seed: int
    generated_at: datetime
    coordinator: TopologyCoordinatorResponse | None
    services: list[TopologyServiceNodeResponse]
    directed_edges: list[TopologyDirectedEdgeResponse]
    undirected_edges: list[TopologyUndirectedEdgeResponse]
    registry_snapshot: list[TopologyRegistryEntryResponse]
    known_service_addresses: dict[str, list[str]]
