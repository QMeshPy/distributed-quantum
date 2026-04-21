"""Quality domain models — fidelity, link quality, node reputation."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FidelityRecord(BaseModel):
    """Persisted fidelity measurement for a completed fragment execution."""

    model_config = ConfigDict(extra="forbid")

    record_id: str = Field(min_length=3)
    peer_id: str = Field(min_length=3)
    execution_id: str = Field(min_length=8)
    fragment_id: str = Field(min_length=3)
    service_id: str = Field(min_length=2)
    fidelity_score: float = Field(ge=0.0, le=1.0)
    shots: int = Field(ge=1)
    gate_error_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    readout_error_rate: float | None = Field(default=None, ge=0.0, le=1.0)
    measured_at: datetime = Field(default_factory=_utc_now)


class LinkQualityRecord(BaseModel):
    """Persisted link quality snapshot between two peers."""

    model_config = ConfigDict(extra="forbid")

    record_id: str = Field(min_length=3)
    source_peer_id: str = Field(min_length=3)
    target_peer_id: str = Field(min_length=3)
    quality_class: str = Field(min_length=3)
    latency_ms: float | None = Field(default=None, ge=0.0)
    packet_loss_pct: float | None = Field(default=None, ge=0.0, le=100.0)
    measured_at: datetime = Field(default_factory=_utc_now)


class NodeReputationRecord(BaseModel):
    """Persisted reputation score for a peer at a point in time."""

    model_config = ConfigDict(extra="forbid")

    record_id: str = Field(min_length=3)
    peer_id: str = Field(min_length=3)
    reputation_score: float
    contributing_executions: int = Field(default=0, ge=0)
    successful_executions: int = Field(default=0, ge=0)
    failed_executions: int = Field(default=0, ge=0)
    seeded_packages: int = Field(default=0, ge=0)
    computed_at: datetime = Field(default_factory=_utc_now)

    @property
    def success_rate(self) -> float:
        total = self.successful_executions + self.failed_executions
        return self.successful_executions / total if total > 0 else 0.0
