"""Services and metrics API router."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.models.services import (
    FidelityMetricsResponse,
    FidelitySampleResponse,
    ServiceResponse,
)
from quantum_backend_v2.api.routers.service_quality import ServiceQualityTracker
from quantum_backend_v2.discovery.service import DiscoveryService


def build_services_router(*, discovery_service: DiscoveryService) -> APIRouter:
    """Build the services and metrics router."""
    router = APIRouter(prefix="/api/v1", tags=["services", "metrics"])
    
    # Service quality tracker
    quality_tracker = ServiceQualityTracker()

    @router.get(
        "/services",
        response_model=list[ServiceResponse],
        summary="List all registered quantum services",
    )
    async def list_services(
        current_user: CurrentUser,
    ) -> list[ServiceResponse]:
        """List all quantum services registered in the network."""
        registry = discovery_service.registry
        peers = registry.list_peers(include_stale=False)
        
        services: list[ServiceResponse] = []
        for peer in peers:
            # Each peer can provide multiple services
            for service_id in peer.service_ids:
                capabilities = quality_tracker.get_service_capabilities(service_id)
                fidelity = quality_tracker.get_peer_fidelity(peer.peer_id, capabilities.fidelity)
                
                services.append(
                    ServiceResponse(
                        node_id=peer.peer_id,
                        listen_addrs=list(peer.network_addresses),
                        service_type=service_id,
                        fidelity=fidelity,
                        qubit_min=capabilities.qubit_min,
                        qubit_max=capabilities.qubit_max,
                        availability=peer.health_status == "healthy",
                        updated_at=peer.last_seen_at,
                        gate_set=capabilities.gate_set,
                        connectivity=capabilities.connectivity,
                    )
                )
        
        return services

    @router.get(
        "/metrics/fidelity/{node_id}",
        response_model=FidelityMetricsResponse,
        summary="Get fidelity metrics for a node",
    )
    async def get_fidelity_metrics(
        node_id: str,
        current_user: CurrentUser,
    ) -> FidelityMetricsResponse:
        """Get fidelity metrics and quality samples for a specific node."""
        registry = discovery_service.registry
        peer = registry.get_peer(node_id)
        
        if peer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node '{node_id}' not found",
            )
        
        # Create samples for each service the peer provides
        samples: list[FidelitySampleResponse] = []
        
        for service_id in peer.service_ids:
            fidelity = quality_tracker.get_service_fidelity(service_id, peer_id=node_id)
            samples.append(
                FidelitySampleResponse(
                    service_type=service_id,
                    fidelity=fidelity,
                    availability=peer.health_status == "healthy",
                    updated_at=peer.last_seen_at,
                )
            )
        
        if not samples:
            # Create a default sample if no services
            default_fidelity = quality_tracker.get_peer_fidelity(node_id, 0.95)
            samples.append(
                FidelitySampleResponse(
                    service_type="unknown",
                    fidelity=default_fidelity,
                    availability=peer.health_status == "healthy",
                    updated_at=peer.last_seen_at,
                )
            )
        
        fidelities = [s.fidelity for s in samples]
        
        return FidelityMetricsResponse(
            node_id=node_id,
            sample_count=len(samples),
            average_fidelity=sum(fidelities) / len(fidelities),
            min_fidelity=min(fidelities),
            max_fidelity=max(fidelities),
            samples=samples,
        )

    return router
