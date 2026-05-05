"""Discovery API router — peer registry and topology endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from quantum_backend_v2.api.deps.auth import require_authenticated
from quantum_backend_v2.api.models.discovery import (
    NetworkStatsResponse,
    NetworkTopologyResponse,
    PeerDetail,
    PeerListResponse,
    PeerSummary,
    TopologyEntry,
    TopologyResponse,
)
from quantum_backend_v2.api.routers.service_quality import ServiceQualityTracker
from quantum_backend_v2.discovery.registry import PeerRegistry, PeerRegistryEntry
from quantum_backend_v2.discovery.service import DiscoveryService


def build_discovery_router(*, discovery_service: DiscoveryService) -> APIRouter:
    """Build the discovery router, capturing the service via closure."""
    router = APIRouter(
        prefix="/api/v1/discovery",
        tags=["discovery"],
        dependencies=[Depends(require_authenticated)],
    )
    quality_tracker = ServiceQualityTracker()

    def _registry() -> PeerRegistry:
        return discovery_service.registry

    @router.get("/peers", response_model=PeerListResponse)
    async def list_peers(
        include_stale: bool = Query(
            default=False,
            description=(
                "Include peers whose last heartbeat or advertisement exceeded "
                "the stale TTL."
            ),
        ),
    ) -> PeerListResponse:
        """List all peers known to the local discovery registry."""
        registry = _registry()
        entries = registry.list_peers(include_stale=include_stale)
        summaries = tuple(
            _to_summary(e, registry.is_peer_stale(e.peer_id)) for e in entries
        )
        return PeerListResponse(
            peers=summaries,
            total=len(summaries),
            include_stale=include_stale,
        )

    @router.get("/peers/{peer_id}", response_model=PeerDetail)
    async def get_peer(peer_id: str) -> PeerDetail:
        """Return the full detail view of a single peer by peer_id."""
        registry = _registry()
        entry = registry.get_peer(peer_id)
        if entry is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Peer '{peer_id}' not found in local discovery registry.",
            )
        return _to_detail(entry, registry.is_peer_stale(peer_id))

    @router.get("/topology", response_model=TopologyResponse)
    async def topology() -> TopologyResponse:
        """Return a topology projection of all known peers (including stale ones)."""
        registry = _registry()
        all_entries = registry.list_peers(include_stale=True)
        active = [e for e in all_entries if not registry.is_peer_stale(e.peer_id)]
        stale = [e for e in all_entries if registry.is_peer_stale(e.peer_id)]

        topo_entries = tuple(
            TopologyEntry(
                peer_id=e.peer_id,
                trust_tier=e.trust_tier,
                health_status=e.health_status,
                last_seen_at=e.last_seen_at,
                is_stale=registry.is_peer_stale(e.peer_id),
            )
            for e in all_entries
        )
        return TopologyResponse(
            peers=topo_entries,
            total_peers=len(all_entries),
            active_peers=len(active),
            stale_peers=len(stale),
        )

    @router.get("/network/topology", response_model=NetworkTopologyResponse)
    async def network_topology() -> NetworkTopologyResponse:
        """Return network topology compatible with old backend API."""
        registry = _registry()
        all_entries = registry.list_peers(include_stale=True)
        
        # Build service list
        services = []
        for peer in all_entries:
            for service_id in peer.service_ids:
                services.append({
                    "node_id": peer.peer_id,
                    "service_type": service_id,
                    "listen_addrs": list(peer.network_addresses),
                    "fidelity": quality_tracker.get_service_fidelity(
                        service_id, peer_id=peer.peer_id
                    ),
                    "availability": peer.health_status == "healthy",
                    "updated_at": peer.last_seen_at,
                })
        
        return NetworkTopologyResponse(
            fabric_running=True,
            generated_at=_utc_now(),
            services=services,
            registry_snapshot=[
                {
                    "peer_id": e.peer_id,
                    "trust_tier": e.trust_tier,
                    "health_status": e.health_status,
                    "service_ids": list(e.service_ids),
                    "network_addresses": list(e.network_addresses),
                    "last_seen_at": e.last_seen_at,
                }
                for e in all_entries
            ],
        )

    @router.get("/stats", response_model=NetworkStatsResponse)
    async def network_stats() -> NetworkStatsResponse:
        """Aggregate network statistics: peer counts, service counts, avg fidelity."""
        registry = _registry()
        all_entries = registry.list_peers(include_stale=True)
        active_entries = [e for e in all_entries if not registry.is_peer_stale(e.peer_id)]
        stale_entries = [e for e in all_entries if registry.is_peer_stale(e.peer_id)]

        # Gather all services from active peers
        fidelities: list[float] = []
        service_type_set: set[str] = set()
        total_services = 0
        for peer in active_entries:
            for svc_id in peer.service_ids:
                caps = quality_tracker.get_service_capabilities(svc_id)
                fidelities.append(quality_tracker.get_peer_fidelity(peer.peer_id, caps.fidelity))
                service_type_set.add(svc_id)
                total_services += 1

        avg_fidelity = sum(fidelities) / len(fidelities) if fidelities else 0.0
        avg_svc_per_peer = total_services / len(active_entries) if active_entries else 0.0

        return NetworkStatsResponse(
            total_peers=len(all_entries),
            active_peers=len(active_entries),
            stale_peers=len(stale_entries),
            total_services=total_services,
            unique_service_types=len(service_type_set),
            avg_fidelity=avg_fidelity,
            avg_services_per_peer=avg_svc_per_peer,
            generated_at=_utc_now(),
        )

    return router


def _utc_now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc)


def _to_summary(entry: PeerRegistryEntry, is_stale: bool) -> PeerSummary:
    return PeerSummary(
        peer_id=entry.peer_id,
        trust_tier=entry.trust_tier,
        health_status=entry.health_status,
        network_address_count=len(entry.network_addresses),
        service_count=len(entry.service_ids),
        active_reservations=entry.active_reservations,
        active_executions=entry.active_executions,
        last_seen_at=entry.last_seen_at,
        is_stale=is_stale,
    )


def _to_detail(entry: PeerRegistryEntry, is_stale: bool) -> PeerDetail:
    return PeerDetail(
        peer_id=entry.peer_id,
        trust_tier=entry.trust_tier,
        health_status=entry.health_status,
        network_addresses=entry.network_addresses,
        supported_protocols=entry.supported_protocols,
        service_ids=entry.service_ids,
        active_reservations=entry.active_reservations,
        active_executions=entry.active_executions,
        peer_log_position=entry.peer_log_position,
        first_seen_at=entry.first_seen_at,
        last_seen_at=entry.last_seen_at,
        last_advertisement_at=entry.last_advertisement_at,
        last_heartbeat_at=entry.last_heartbeat_at,
        rejoined=entry.rejoined,
        is_stale=is_stale,
    )
