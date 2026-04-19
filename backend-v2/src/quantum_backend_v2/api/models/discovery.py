"""API response models for the discovery layer."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PeerSummary(BaseModel):
    """Compact view of a discovered peer returned in list endpoints."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    peer_id: str
    trust_tier: str
    health_status: str
    network_address_count: int = Field(ge=0)
    service_count: int = Field(ge=0)
    active_reservations: int = Field(ge=0)
    active_executions: int = Field(ge=0)
    last_seen_at: datetime
    is_stale: bool


class PeerDetail(BaseModel):
    """Full detail view of a single discovered peer."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    peer_id: str
    trust_tier: str
    health_status: str
    network_addresses: tuple[str, ...] = Field(default_factory=tuple)
    supported_protocols: tuple[str, ...] = Field(default_factory=tuple)
    service_ids: tuple[str, ...] = Field(default_factory=tuple)
    active_reservations: int = Field(ge=0)
    active_executions: int = Field(ge=0)
    peer_log_position: int = Field(ge=0)
    first_seen_at: datetime
    last_seen_at: datetime
    last_advertisement_at: datetime | None
    last_heartbeat_at: datetime | None
    rejoined: bool
    is_stale: bool


class PeerListResponse(BaseModel):
    """Paginated list of peers in the discovery registry."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    peers: tuple[PeerSummary, ...]
    total: int = Field(ge=0)
    include_stale: bool


class TopologyEntry(BaseModel):
    """Single peer entry in the topology view."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    peer_id: str
    trust_tier: str
    health_status: str
    last_seen_at: datetime
    is_stale: bool


class TopologyResponse(BaseModel):
    """Network topology projection for operators and tooling."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    peers: tuple[TopologyEntry, ...]
    total_peers: int = Field(ge=0)
    active_peers: int = Field(ge=0)
    stale_peers: int = Field(ge=0)
