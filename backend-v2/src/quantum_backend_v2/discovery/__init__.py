"""Discovery models, events, registry, and service."""

from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import (
    PeerAdvertisement,
    PeerHeartbeat,
    ServiceAdvertisementSummary,
)
from quantum_backend_v2.discovery.registry import PeerRegistry, PeerRegistryEntry
from quantum_backend_v2.discovery.service import DiscoveryService, build_discovery_service

__all__ = [
    "DiscoveryEvent",
    "DiscoveryEventKind",
    "DiscoveryService",
    "PeerAdvertisement",
    "PeerHeartbeat",
    "PeerRegistry",
    "PeerRegistryEntry",
    "ServiceAdvertisementSummary",
    "build_discovery_service",
]
