"""API request and response models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


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
    result: dict[str, Any] | None
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
