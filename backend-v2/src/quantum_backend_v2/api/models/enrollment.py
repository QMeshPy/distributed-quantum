"""API response/request models for the peer enrollment surface."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.identity.models import PeerTrustTier


class EnrollPeerRequest(BaseModel):
    """Request body for enrolling or updating a peer."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "peer_id": "12D3KooWAlphaNodeQuantumService",
                "trust_tier": "user_contributed",
                "capability_summary": {
                    "services": ["qpu.simulator", "hamiltonian.optimize"],
                    "max_qubits": 32,
                    "region": "ap-south-1",
                },
            }
        },
    )

    peer_id: str = Field(min_length=3, max_length=255)
    trust_tier: PeerTrustTier = PeerTrustTier.USER_CONTRIBUTED
    capability_summary: dict[str, object] = Field(default_factory=dict)


class ApprovalAction(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"
    QUARANTINE = "quarantine"


class EnrollmentActionRequest(BaseModel):
    """Admin action on a pending enrollment."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "action": "approve",
                "reason": "Capabilities verified against integration smoke tests.",
            }
        },
    )

    action: ApprovalAction
    reason: str | None = Field(default=None, max_length=300)


class EnrollmentResponse(BaseModel):
    """Typed response for enrollment operations."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "id": "enr_7c67e3d2f6a8498f9c4db34ae4a5f1b8",
                "peer_id": "12D3KooWAlphaNodeQuantumService",
                "owner_user_id": "dev-admin-local",
                "trust_tier": "user_contributed",
                "enrollment_status": "approved",
                "capability_summary": {
                    "services": ["qpu.simulator", "hamiltonian.optimize"],
                    "max_qubits": 32,
                },
                "published_service_count": 2,
                "last_seen_at": "2026-04-20T00:48:00Z",
                "created_at": "2026-04-20T00:40:00Z",
                "updated_at": "2026-04-20T00:48:00Z",
            }
        },
    )

    id: str
    peer_id: str
    owner_user_id: str | None
    trust_tier: str
    enrollment_status: str
    capability_summary: dict[str, object]
    published_service_count: int
    last_seen_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EnrollmentListResponse(BaseModel):
    """Paginated list of peer enrollments."""

    model_config = ConfigDict(extra="forbid")

    enrollments: list[EnrollmentResponse]
    total: int = Field(ge=0)
