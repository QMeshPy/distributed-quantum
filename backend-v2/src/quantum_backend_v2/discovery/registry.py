"""Peer registry materialization for discovery events.

``PeerRegistry`` is the asyncio-facing component that consumes ``DiscoveryEvent``
objects from the shared queue and writes them into MongoDB.

Design contract
---------------
- The in-memory ``_entries`` dict is a **disposable read cache only**.  If the
  process restarts it is rebuilt from MongoDB on demand, never assumed.
- The canonical source of truth for peer state is MongoDB
  (``PeerCapabilityDocument`` and ``TopologyProjectionDocument``).
- TTL enforcement: a peer is considered stale if no heartbeat or advertisement
  has been received within ``stale_peer_ttl_seconds``.
- Rejoin: when a stale peer re-advertises, its entry is refreshed and its stale
  status is cleared.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import PeerAdvertisement, PeerHeartbeat
from quantum_backend_v2.persistence.mongodb import (
    MongoRuntime,
    PeerCapabilityDocument,
    TopologyProjectionDocument,
)

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Registry entry — in-memory cache only, never authoritative
# ---------------------------------------------------------------------------


class PeerRegistryEntry(BaseModel):
    """Cached view of a peer seen in the discovery network.

    This model is disposable: it can always be reconstructed from MongoDB.
    """

    model_config = ConfigDict(extra="forbid")

    peer_id: str
    trust_tier: str = Field(default="unknown")
    health_status: str = Field(default="unknown")
    network_addresses: tuple[str, ...] = Field(default_factory=tuple)
    supported_protocols: tuple[str, ...] = Field(default_factory=tuple)
    service_ids: tuple[str, ...] = Field(default_factory=tuple)
    active_reservations: int = Field(default=0, ge=0)
    active_executions: int = Field(default=0, ge=0)
    peer_log_position: int = Field(default=0, ge=0)
    first_seen_at: datetime = Field(default_factory=_utc_now)
    last_seen_at: datetime = Field(default_factory=_utc_now)
    last_advertisement_at: datetime | None = None
    last_heartbeat_at: datetime | None = None
    rejoined: bool = False


# ---------------------------------------------------------------------------
# PeerRegistry
# ---------------------------------------------------------------------------


@dataclass
class PeerRegistry:
    """Asyncio-facing peer registry backed by MongoDB.

    ``process_event`` is called by the asyncio drain loop in ``DiscoveryService``
    for every event received from the trio transport thread.
    """

    mongo_runtime: MongoRuntime | None
    stale_peer_ttl_seconds: int
    _entries: dict[str, PeerRegistryEntry] = field(default_factory=dict, init=False)

    # ------------------------------------------------------------------
    # Public interface consumed by the API router
    # ------------------------------------------------------------------

    def peer_count(self) -> int:
        """Total number of peers seen (including stale ones)."""
        return len(self._entries)

    def list_peers(self, *, include_stale: bool = False) -> list[PeerRegistryEntry]:
        """Return peer entries from the in-memory cache.

        Only non-stale peers are returned by default.
        """
        entries = list(self._entries.values())
        if not include_stale:
            entries = [e for e in entries if not self._is_stale(e)]
        return sorted(entries, key=lambda e: e.last_seen_at, reverse=True)

    def get_peer(self, peer_id: str) -> PeerRegistryEntry | None:
        """Return a single peer entry by peer_id (or None if not known)."""
        return self._entries.get(peer_id)

    def is_peer_stale(self, peer_id: str) -> bool:
        """Return True if the peer is known but stale, False otherwise."""
        entry = self._entries.get(peer_id)
        if entry is None:
            return False
        return self._is_stale(entry)

    # ------------------------------------------------------------------
    # Event processing — called from the asyncio drain loop
    # ------------------------------------------------------------------

    async def process_event(self, event: DiscoveryEvent) -> None:
        """Deserialise and apply a discovery event to the registry."""
        try:
            if event.kind == DiscoveryEventKind.ADVERTISEMENT:
                payload = PeerAdvertisement.model_validate_json(event.raw_payload)
                await self._apply_advertisement(payload, event.received_at)
            elif event.kind == DiscoveryEventKind.HEARTBEAT:
                payload = PeerHeartbeat.model_validate_json(event.raw_payload)
                await self._apply_heartbeat(payload, event.received_at)
        except Exception:
            logger.exception(
                "failed to process discovery event kind=%s", event.kind.value
            )

    # ------------------------------------------------------------------
    # Stale peer sweep — called periodically by DiscoveryService
    # ------------------------------------------------------------------

    async def sweep_stale_peers(self) -> int:
        """Mark stale peers in MongoDB and return the count of stale peers found."""
        stale = [e for e in self._entries.values() if self._is_stale(e)]
        if not stale:
            return 0

        for entry in stale:
            logger.info(
                "peer %s is stale (last_seen=%s, ttl=%ds)",
                entry.peer_id,
                entry.last_seen_at.isoformat(),
                self.stale_peer_ttl_seconds,
            )
            await self._mark_stale_in_mongo(entry.peer_id)

        return len(stale)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_stale(self, entry: PeerRegistryEntry) -> bool:
        delta = (_utc_now() - entry.last_seen_at).total_seconds()
        return delta > self.stale_peer_ttl_seconds

    async def _apply_advertisement(
        self, adv: PeerAdvertisement, received_at: datetime
    ) -> None:
        existing = self._entries.get(adv.peer_id)
        rejoined = existing is not None and self._is_stale(existing)

        if existing is None:
            entry = PeerRegistryEntry(
                peer_id=adv.peer_id,
                trust_tier=adv.trust_tier,
                network_addresses=adv.network_addresses,
                supported_protocols=adv.supported_protocols,
                service_ids=tuple(
                    s.service_id for s in adv.service_summaries
                ),
                peer_log_position=adv.peer_log_position,
                first_seen_at=received_at,
                last_seen_at=received_at,
                last_advertisement_at=received_at,
                rejoined=False,
            )
        else:
            entry = existing.model_copy(
                update={
                    "trust_tier": adv.trust_tier,
                    "network_addresses": adv.network_addresses,
                    "supported_protocols": adv.supported_protocols,
                    "service_ids": tuple(
                        s.service_id for s in adv.service_summaries
                    ),
                    "peer_log_position": adv.peer_log_position,
                    "last_seen_at": received_at,
                    "last_advertisement_at": received_at,
                    "rejoined": rejoined,
                }
            )

        self._entries[adv.peer_id] = entry

        if rejoined:
            logger.info("peer %s rejoined the network", adv.peer_id)

        await self._upsert_capability_document(adv)

    async def _apply_heartbeat(
        self, hb: PeerHeartbeat, received_at: datetime
    ) -> None:
        existing = self._entries.get(hb.peer_id)

        if existing is None:
            entry = PeerRegistryEntry(
                peer_id=hb.peer_id,
                health_status=hb.health_status,
                active_reservations=hb.active_reservations,
                active_executions=hb.active_executions,
                peer_log_position=hb.peer_log_position,
                first_seen_at=received_at,
                last_seen_at=received_at,
                last_heartbeat_at=received_at,
            )
        else:
            rejoined = self._is_stale(existing)
            entry = existing.model_copy(
                update={
                    "health_status": hb.health_status,
                    "active_reservations": hb.active_reservations,
                    "active_executions": hb.active_executions,
                    "peer_log_position": hb.peer_log_position,
                    "last_seen_at": received_at,
                    "last_heartbeat_at": received_at,
                    "rejoined": rejoined,
                }
            )
            if rejoined:
                logger.info("peer %s sent heartbeat after stale period", hb.peer_id)

        self._entries[hb.peer_id] = entry
        await self._upsert_topology_document(hb, received_at)

    async def _upsert_capability_document(self, adv: PeerAdvertisement) -> None:
        if self.mongo_runtime is None:
            return
        try:
            existing = await PeerCapabilityDocument.find_one(
                PeerCapabilityDocument.peer_id == adv.peer_id
            )
            if existing is None:
                doc = PeerCapabilityDocument(
                    peer_id=adv.peer_id,
                    capabilities=[adv.trust_tier],
                    published_service_ids=[
                        s.service_id for s in adv.service_summaries
                    ],
                    protocol_versions={
                        proto: "1.0.0" for proto in adv.supported_protocols
                    },
                )
                await doc.insert()
            else:
                existing.capabilities = [adv.trust_tier]
                existing.published_service_ids = [
                    s.service_id for s in adv.service_summaries
                ]
                existing.protocol_versions = {
                    proto: "1.0.0" for proto in adv.supported_protocols
                }
                existing.updated_at = _utc_now()
                await existing.save()
        except Exception:
            logger.exception(
                "failed to upsert PeerCapabilityDocument for peer %s", adv.peer_id
            )

    async def _upsert_topology_document(
        self, hb: PeerHeartbeat, observed_at: datetime
    ) -> None:
        if self.mongo_runtime is None:
            return
        try:
            existing = await TopologyProjectionDocument.find_one(
                TopologyProjectionDocument.peer_id == hb.peer_id
            )
            if existing is None:
                doc = TopologyProjectionDocument(
                    peer_id=hb.peer_id,
                    connected_peers=[],
                    trust_tier="unknown",
                    health_status=hb.health_status,
                    observed_at=observed_at,
                )
                await doc.insert()
            else:
                existing.health_status = hb.health_status
                existing.observed_at = observed_at
                await existing.save()
        except Exception:
            logger.exception(
                "failed to upsert TopologyProjectionDocument for peer %s", hb.peer_id
            )

    async def _mark_stale_in_mongo(self, peer_id: str) -> None:
        if self.mongo_runtime is None:
            return
        try:
            doc = await TopologyProjectionDocument.find_one(
                TopologyProjectionDocument.peer_id == peer_id
            )
            if doc is not None:
                doc.health_status = "stale"
                await doc.save()
        except Exception:
            logger.exception(
                "failed to mark peer %s as stale in MongoDB", peer_id
            )
