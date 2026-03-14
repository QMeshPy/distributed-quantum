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
    updated_at: datetime
