"""Quality protocol wire schemas for fidelity, link health, and node telemetry."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class LinkQualityClass(str, Enum):
    """Categorical quality class for a peer-to-peer link."""

    EXCELLENT = "excellent"
    GOOD = "good"
    DEGRADED = "degraded"
    POOR = "poor"
    UNKNOWN = "unknown"


class NodeHealthClass(str, Enum):
    """Overall node health category."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class FidelityReport(BaseModel):
    """Single-shot fidelity measurement published by a peer after execution."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reporting_peer_id: str = Field(min_length=3)
    execution_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    fidelity_score: float = Field(ge=0.0, le=1.0)
    shots: int = Field(ge=1)
    gate_error_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    readout_error_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    measured_at: datetime = Field(default_factory=_utc_now)


class LinkQualityReport(BaseModel):
    """Peer-to-peer link quality snapshot propagated via pubsub."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reporting_peer_id: str = Field(min_length=3)
    remote_peer_id: str = Field(min_length=3)
    quality_class: LinkQualityClass
    latency_ms: float | None = Field(default=None, ge=0.0)
    packet_loss_pct: float | None = Field(default=None, ge=0.0, le=100.0)
    bandwidth_kbps: float | None = Field(default=None, ge=0.0)
    measured_at: datetime = Field(default_factory=_utc_now)


class NodeHealthReport(BaseModel):
    """Comprehensive node health snapshot, extended heartbeat payload."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reporting_peer_id: str = Field(min_length=3)
    health_class: NodeHealthClass
    cpu_usage_pct: float | None = Field(default=None, ge=0.0, le=100.0)
    memory_usage_pct: float | None = Field(default=None, ge=0.0, le=100.0)
    disk_usage_pct: float | None = Field(default=None, ge=0.0, le=100.0)
    active_reservations: int = Field(default=0, ge=0)
    active_executions: int = Field(default=0, ge=0)
    queued_fragments: int = Field(default=0, ge=0)
    reported_at: datetime = Field(default_factory=_utc_now)


class ReputationScoreUpdate(BaseModel):
    """Reputation delta emitted after a successful or failed execution."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    peer_id: str = Field(min_length=3)
    execution_id: str = Field(min_length=8)
    score_delta: float
    reason: str = Field(min_length=3, max_length=200)
    cumulative_score: float | None = None
    updated_at: datetime = Field(default_factory=_utc_now)
