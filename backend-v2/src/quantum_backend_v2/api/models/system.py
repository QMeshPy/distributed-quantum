"""System-facing API models."""

from __future__ import annotations

from pydantic import BaseModel, Field

from quantum_backend_v2.persistence import PersistenceReadiness


class HealthResponse(BaseModel):
    """Basic health response for the platform edge."""

    status: str = Field(description="Overall service health status.")
    service: str = Field(description="Logical service name.")
    environment: str = Field(description="Deployment environment identifier.")
    version: str = Field(description="Application version.")
    uptime_seconds: float = Field(ge=0.0, description="Process uptime in seconds.")
    persistence: PersistenceReadiness = Field(
        description="Durable store readiness and peer-log recovery visibility.",
    )


class ReadinessResponse(BaseModel):
    """Readiness response that performs active dependency probes."""

    status: str = Field(description="Readiness status for dependency-backed traffic.")
    service: str = Field(description="Logical service name.")
    environment: str = Field(description="Deployment environment identifier.")
    version: str = Field(description="Application version.")
    persistence: PersistenceReadiness = Field(
        description="Actively probed durable store readiness.",
    )
