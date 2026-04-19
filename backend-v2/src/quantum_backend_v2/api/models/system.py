"""System-facing API models."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.persistence import PersistenceReadiness


class HealthResponse(BaseModel):
    """Basic health response for the platform edge."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "ok",
                "service": "quantum-backend-v2",
                "environment": "development",
                "version": "0.1.0",
                "uptime_seconds": 12.4,
                "persistence": {
                    "postgres": {
                        "mode": "ready",
                        "backend": "postgresql",
                        "target": "local",
                        "reachable": True,
                    },
                    "mongodb": {
                        "mode": "ready",
                        "backend": "mongodb",
                        "target": "remote",
                        "reachable": True,
                    },
                    "peer_log": {"mode": "ready", "peer_id": "qb2-local-peer", "event_count": 0},
                },
            }
        }
    )

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

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "ready",
                "service": "quantum-backend-v2",
                "environment": "development",
                "version": "0.1.0",
                "persistence": {
                    "postgres": {
                        "mode": "ready",
                        "backend": "postgresql",
                        "target": "local",
                        "reachable": True,
                    },
                    "mongodb": {
                        "mode": "ready",
                        "backend": "mongodb",
                        "target": "remote",
                        "reachable": True,
                    },
                    "peer_log": {"mode": "ready", "peer_id": "qb2-local-peer", "event_count": 0},
                },
            }
        }
    )

    status: str = Field(description="Readiness status for dependency-backed traffic.")
    service: str = Field(description="Logical service name.")
    environment: str = Field(description="Deployment environment identifier.")
    version: str = Field(description="Application version.")
    persistence: PersistenceReadiness = Field(
        description="Actively probed durable store readiness.",
    )
