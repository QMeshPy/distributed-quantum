"""API response models for the discovery layer."""

from __future__ import annotations

from datetime import datetime
from typing import Any

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

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        json_schema_extra={
            "example": {
                "peers": [
                    {
                        "peer_id": "12D3KooWBootstrapNode",
                        "trust_tier": "platform_managed",
                        "health_status": "healthy",
                        "network_address_count": 1,
                        "service_count": 0,
                        "active_reservations": 0,
                        "active_executions": 0,
                        "last_seen_at": "2026-04-20T00:58:00Z",
                        "is_stale": False,
                    },
                    {
                        "peer_id": "12D3KooWWorkerNode",
                        "trust_tier": "platform_managed",
                        "health_status": "healthy",
                        "network_address_count": 1,
                        "service_count": 6,
                        "active_reservations": 1,
                        "active_executions": 1,
                        "last_seen_at": "2026-04-20T00:58:03Z",
                        "is_stale": False,
                    },
                ],
                "total": 2,
                "include_stale": False,
            }
        },
    )

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


class NetworkTopologyResponse(BaseModel):
    """Network topology response compatible with old backend API."""

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "fabric_running": True,
                "generated_at": "2026-04-20T00:58:05Z",
                "services": [
                    {
                        "node_id": "12D3KooWWorkerNode",
                        "service_type": "svc.quantum.portfolio",
                        "listen_addrs": ["/ip4/127.0.0.1/tcp/4021"],
                        "fidelity": 0.98,
                        "availability": True,
                        "updated_at": "2026-04-20T00:58:03Z",
                    }
                ],
                "registry_snapshot": [
                    {
                        "peer_id": "12D3KooWWorkerNode",
                        "trust_tier": "platform_managed",
                        "health_status": "healthy",
                        "service_ids": ["svc.quantum.portfolio"],
                        "network_addresses": ["/ip4/127.0.0.1/tcp/4021"],
                        "last_seen_at": "2026-04-20T00:58:03Z",
                    }
                ],
            }
        },
    )

    fabric_running: bool
    generated_at: datetime
    services: list[dict[str, Any]] = Field(default_factory=list)
    registry_snapshot: list[dict[str, Any]] = Field(default_factory=list)


class NetworkStatsResponse(BaseModel):
    """Aggregate network health and capability statistics."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    total_peers: int = Field(ge=0, description="All known peers (including stale)")
    active_peers: int = Field(ge=0, description="Non-stale peers")
    stale_peers: int = Field(ge=0, description="Stale peers")
    total_services: int = Field(ge=0, description="Total service instances across all peers")
    unique_service_types: int = Field(ge=0, description="Distinct service types offered")
    avg_fidelity: float = Field(ge=0.0, le=1.0, description="Mean fidelity across all services")
    avg_services_per_peer: float = Field(ge=0.0, description="Average services per active peer")
    generated_at: datetime
