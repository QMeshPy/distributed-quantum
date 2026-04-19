"""API request/response models for the durable reservation surface."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReserveRequest(BaseModel):
    """Request body for creating a new reservation."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "workflow_run_id": "run_2ee36fe758e4462d9a7b2f7d80d2c5e7",
                "fragment_id": "frag-qaoa-step-1",
                "service_id": "svc.quantum.portfolio",
                "requesting_peer_id": "12D3KooWCoordinatorNode",
                "ttl_seconds": 120,
                "idempotency_key": "reserve-frag-qaoa-step-1-v1",
            }
        },
    )

    workflow_run_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=3)
    requesting_peer_id: str = Field(min_length=3)
    ttl_seconds: int = Field(default=60, ge=5)
    idempotency_key: str | None = None


class ReservationResponse(BaseModel):
    """Typed response for a single reservation state."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "reservation_id": "resv_4d1f9cf841214c76a6d4b9423ff39c45",
                "workflow_run_id": "run_2ee36fe758e4462d9a7b2f7d80d2c5e7",
                "fragment_id": "frag-qaoa-step-1",
                "service_id": "svc.quantum.portfolio",
                "requesting_peer_id": "12D3KooWCoordinatorNode",
                "accepting_peer_id": "12D3KooWQuantumWorkerNode",
                "current_transition": "accepted",
                "ttl_seconds": 120,
                "last_event_at": "2026-04-20T00:55:00Z",
                "is_terminal": False,
                "is_active": True,
            }
        },
    )

    reservation_id: str
    workflow_run_id: str
    fragment_id: str
    service_id: str
    requesting_peer_id: str
    accepting_peer_id: str | None
    current_transition: str
    ttl_seconds: int
    last_event_at: datetime
    is_terminal: bool
    is_active: bool
