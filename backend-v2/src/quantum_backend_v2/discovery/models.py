"""Discovery protocol payloads for peer lifecycle coordination."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ServiceAdvertisementSummary(BaseModel):
    """Compact summary of a peer-published service for swarm discovery."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    service_id: str = Field(min_length=2)
    version: str = Field(min_length=3)
    quantum_capability: str = Field(min_length=2)
    benchmark_mode: str = Field(min_length=3)


class PeerAdvertisement(BaseModel):
    """Peer advertisement broadcast for discovery and registry materialization."""

    model_config = ConfigDict(extra="forbid")

    peer_id: str = Field(min_length=3)
    trust_tier: str = Field(min_length=3)
    network_addresses: tuple[str, ...] = Field(default_factory=tuple)
    supported_protocols: tuple[str, ...] = Field(default_factory=tuple)
    service_summaries: tuple[ServiceAdvertisementSummary, ...] = Field(default_factory=tuple)
    peer_log_position: int = Field(default=0, ge=0)
    emitted_at: datetime = Field(default_factory=_utc_now)

    @field_validator("emitted_at")
    @classmethod
    def _ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("emitted_at must be timezone-aware")
        return value.astimezone(timezone.utc)


class PeerHeartbeat(BaseModel):
    """Low-overhead heartbeat for liveness and stale-peer handling."""

    model_config = ConfigDict(extra="forbid")

    peer_id: str = Field(min_length=3)
    health_status: str = Field(min_length=2)
    active_reservations: int = Field(default=0, ge=0)
    active_executions: int = Field(default=0, ge=0)
    peer_log_position: int = Field(default=0, ge=0)
    emitted_at: datetime = Field(default_factory=_utc_now)

    @field_validator("emitted_at")
    @classmethod
    def _ensure_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("emitted_at must be timezone-aware")
        return value.astimezone(timezone.utc)
