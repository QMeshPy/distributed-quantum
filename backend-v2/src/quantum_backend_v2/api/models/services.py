"""Services and metrics API models."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ServiceResponse(BaseModel):
    """Response model for a quantum service."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "node_id": "12D3KooWWorkerNode",
                "listen_addrs": ["/ip4/127.0.0.1/tcp/4021"],
                "service_type": "svc.quantum.portfolio",
                "fidelity": 0.98,
                "qubit_min": 8,
                "qubit_max": 32,
                "availability": True,
                "updated_at": "2026-04-20T00:59:00Z",
            }
        }
    )

    node_id: str = Field(description="Peer node identifier")
    listen_addrs: list[str] = Field(description="Network addresses")
    service_type: str = Field(description="Type of quantum service")
    fidelity: float = Field(ge=0.0, le=1.0, description="Service fidelity")
    qubit_min: int = Field(ge=1, description="Minimum qubits supported")
    qubit_max: int = Field(ge=1, description="Maximum qubits supported")
    availability: bool = Field(description="Service availability")
    updated_at: datetime = Field(description="Last update timestamp")


class FidelitySampleResponse(BaseModel):
    """A single fidelity measurement sample."""

    service_type: str
    fidelity: float = Field(ge=0.0, le=1.0)
    availability: bool
    updated_at: datetime


class FidelityMetricsResponse(BaseModel):
    """Fidelity metrics for a node."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "node_id": "12D3KooWWorkerNode",
                "sample_count": 2,
                "average_fidelity": 0.965,
                "min_fidelity": 0.95,
                "max_fidelity": 0.98,
                "samples": [
                    {
                        "service_type": "svc.quantum.portfolio",
                        "fidelity": 0.98,
                        "availability": True,
                        "updated_at": "2026-04-20T00:59:00Z",
                    },
                    {
                        "service_type": "svc.quantum.annealing",
                        "fidelity": 0.95,
                        "availability": True,
                        "updated_at": "2026-04-20T00:58:52Z",
                    },
                ],
            }
        }
    )

    node_id: str
    sample_count: int = Field(ge=0)
    average_fidelity: float = Field(ge=0.0, le=1.0)
    min_fidelity: float = Field(ge=0.0, le=1.0)
    max_fidelity: float = Field(ge=0.0, le=1.0)
    samples: list[FidelitySampleResponse]
