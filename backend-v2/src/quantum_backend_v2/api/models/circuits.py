"""Circuit and job API models."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CircuitSubmitRequest(BaseModel):
    """Request to submit a quantum circuit for execution."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "circuit": (
                    'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\n'
                    "h q[0];\ncx q[0],q[1];\nmeasure q -> c;"
                )
            }
        }
    )

    circuit: str = Field(
        min_length=10,
        description="Quantum circuit in QASM format",
    )


class CircuitSubmitResponse(BaseModel):
    """Response after submitting a circuit."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "job_id": "job_8d0f5af2fd3640be8d62a9f48f8d3d6d",
                "status": "queued",
            }
        }
    )

    job_id: str = Field(description="Unique job identifier")
    status: str = Field(description="Initial job status")


class JobProgressResponse(BaseModel):
    """Progress information for a job."""

    total_fragments: int = Field(ge=0)
    completed_fragments: int = Field(ge=0)
    active_fragments: int = Field(ge=0)
    completion_ratio: float = Field(ge=0.0, le=1.0)
    latest_event_at: datetime
    finalizing: bool


class JobResult(BaseModel):
    """Job execution result data."""

    job_id: str
    fragment_results: list[dict[str, Any]] = Field(default_factory=list)
    quantum_result: dict[str, Any] | None = None


class JobListItemResponse(BaseModel):
    """Summary item for job list."""

    job_id: str
    status: str
    plan_id: str | None
    error: str | None
    progress: JobProgressResponse | None
    circuit_preview: str
    result_available: bool
    created_at: datetime
    updated_at: datetime


class JobStatusResponse(BaseModel):
    """Detailed job status response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "job_id": "job_8d0f5af2fd3640be8d62a9f48f8d3d6d",
                "status": "completed",
                "plan_id": "plan_3f7a10d687804c7f8a3a9cb8cf848a8e",
                "error": None,
                "result": {
                    "job_id": "job_8d0f5af2fd3640be8d62a9f48f8d3d6d",
                    "fragment_results": [
                        {"fragment_id": "frag-0", "node_id": "12D3KooWAlphaNode"},
                    ],
                    "quantum_result": {"counts": {"00": 513, "11": 511}},
                },
                "progress": {
                    "total_fragments": 2,
                    "completed_fragments": 2,
                    "active_fragments": 0,
                    "completion_ratio": 1.0,
                    "latest_event_at": "2026-04-20T00:45:00Z",
                    "finalizing": False,
                },
                "circuit_text": (
                    'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\ncreg c[2];\n'
                    "h q[0];\ncx q[0],q[1];\nmeasure q -> c;"
                ),
                "created_at": "2026-04-20T00:44:10Z",
                "updated_at": "2026-04-20T00:45:00Z",
            }
        }
    )

    job_id: str
    status: str
    plan_id: str | None
    error: str | None
    result: JobResult | None
    progress: JobProgressResponse | None
    circuit_text: str
    created_at: datetime
    updated_at: datetime
