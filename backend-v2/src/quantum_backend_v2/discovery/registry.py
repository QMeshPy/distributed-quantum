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
from sqlalchemy import select

from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import PeerAdvertisement, PeerHeartbeat
from quantum_backend_v2.identity.models import PeerTrustTier
from quantum_backend_v2.persistence.mongodb import (
    MongoRuntime,
    PeerCapabilityDocument,
    TopologyProjectionDocument,
)
from quantum_backend_v2.persistence.postgres import PeerEnrollmentRecord

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc_datetime(value: datetime | None, fallback: datetime | None = None) -> datetime:
    resolved = value or fallback or _utc_now()
    if resolved.tzinfo is None or resolved.tzinfo.utcoffset(resolved) is None:
        return resolved.replace(tzinfo=timezone.utc)
    return resolved.astimezone(timezone.utc)


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
    session_factory: object | None = None
    enforce_enrollment: bool = False
    trusted_peer_ids: set[str] = field(default_factory=set)
    _entries: dict[str, PeerRegistryEntry] = field(default_factory=dict, init=False)

    # ------------------------------------------------------------------
    # Public interface consumed by the API router
    # ------------------------------------------------------------------

    def peer_count(self) -> int:
        """Current number of cached peers after stale eviction."""
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

    async def rehydrate(self) -> None:
        """Rebuild the in-memory registry cache from MongoDB projections."""
        if self.mongo_runtime is None:
            self._entries = {}
            return

        capability_docs = await PeerCapabilityDocument.find_all().to_list()
        topology_docs = await TopologyProjectionDocument.find_all().to_list()

        entries: dict[str, PeerRegistryEntry] = {}
        for doc in capability_docs:
            observed_at = _as_utc_datetime(doc.last_advertised_at, doc.updated_at)
            trust_tier = doc.capabilities[0] if doc.capabilities else "unknown"
            entries[doc.peer_id] = PeerRegistryEntry(
                peer_id=doc.peer_id,
                trust_tier=trust_tier,
                network_addresses=tuple(doc.network_addresses),
                supported_protocols=tuple(doc.protocol_versions.keys()),
                service_ids=tuple(doc.published_service_ids),
                first_seen_at=observed_at,
                last_seen_at=observed_at,
                last_advertisement_at=_as_utc_datetime(doc.last_advertised_at, doc.updated_at),
            )

        for doc in topology_docs:
            observed_at = _as_utc_datetime(doc.observed_at)
            existing = entries.get(doc.peer_id)
            if existing is None:
                entries[doc.peer_id] = PeerRegistryEntry(
                    peer_id=doc.peer_id,
                    trust_tier=doc.trust_tier,
                    health_status=doc.health_status,
                    active_reservations=doc.active_reservations,
                    active_executions=doc.active_executions,
                    peer_log_position=doc.peer_log_position,
                    first_seen_at=observed_at,
                    last_seen_at=observed_at,
                    last_heartbeat_at=observed_at,
                )
                continue

            entries[doc.peer_id] = existing.model_copy(
                update={
                    "trust_tier": existing.trust_tier
                    if existing.trust_tier != "unknown"
                    else doc.trust_tier,
                    "health_status": doc.health_status,
                    "active_reservations": doc.active_reservations,
                    "active_executions": doc.active_executions,
                    "peer_log_position": doc.peer_log_position,
                    "last_seen_at": max(_as_utc_datetime(existing.last_seen_at), observed_at),
                    "last_heartbeat_at": observed_at,
                }
            )

        active_entries: dict[str, PeerRegistryEntry] = {}
        stale_peer_ids: list[str] = []
        for peer_id, entry in entries.items():
            if self._is_stale(entry):
                stale_peer_ids.append(peer_id)
                logger.info(
                    "peer %s is stale during rehydrate (last_seen=%s, ttl=%ds)",
                    peer_id,
                    entry.last_seen_at.isoformat(),
                    self.stale_peer_ttl_seconds,
                )
                await self._purge_persisted_peer(peer_id)
                continue
            active_entries[peer_id] = entry

        self._entries = active_entries
        logger.info(
            "rehydrated discovery registry with %d cached peers (%d stale peers purged)",
            len(active_entries),
            len(stale_peer_ids),
        )

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
        """Evict stale peers from cache, purge projections, and return their count."""
        stale_peer_ids = [
            entry.peer_id for entry in self._entries.values() if self._is_stale(entry)
        ]
        if not stale_peer_ids:
            return 0

        for peer_id in stale_peer_ids:
            entry = self._entries.pop(peer_id, None)
            if entry is None:
                continue
            logger.info(
                "peer %s is stale (last_seen=%s, ttl=%ds)",
                peer_id,
                entry.last_seen_at.isoformat(),
                self.stale_peer_ttl_seconds,
            )
            await self._purge_persisted_peer(peer_id)

        return len(stale_peer_ids)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_stale(self, entry: PeerRegistryEntry) -> bool:
        delta = (_utc_now() - _as_utc_datetime(entry.last_seen_at)).total_seconds()
        return delta > self.stale_peer_ttl_seconds

    async def _apply_advertisement(
        self, adv: PeerAdvertisement, received_at: datetime
    ) -> None:
        existing = self._entries.get(adv.peer_id)
        rejoined = existing is not None and self._is_stale(existing)
        effective_trust_tier, allow_services, forced_health_status = (
            await self._resolve_enrollment_visibility(adv.peer_id)
        )
        service_ids = (
            tuple(s.service_id for s in adv.service_summaries)
            if allow_services
            else ()
        )
        health_status = forced_health_status or (
            existing.health_status if existing is not None else "unknown"
        )

        if existing is None:
            entry = PeerRegistryEntry(
                peer_id=adv.peer_id,
                trust_tier=effective_trust_tier or adv.trust_tier,
                health_status=health_status,
                network_addresses=adv.network_addresses,
                supported_protocols=adv.supported_protocols,
                service_ids=service_ids,
                peer_log_position=adv.peer_log_position,
                first_seen_at=received_at,
                last_seen_at=received_at,
                last_advertisement_at=received_at,
                rejoined=False,
            )
        else:
            entry = existing.model_copy(
                update={
                    "trust_tier": effective_trust_tier or adv.trust_tier,
                    "health_status": health_status,
                    "network_addresses": adv.network_addresses,
                    "supported_protocols": adv.supported_protocols,
                    "service_ids": service_ids,
                    "peer_log_position": adv.peer_log_position,
                    "last_seen_at": received_at,
                    "last_advertisement_at": received_at,
                    "rejoined": rejoined,
                }
            )

        self._entries[adv.peer_id] = entry

        if rejoined:
            logger.info("peer %s rejoined the network", adv.peer_id)

        await self._upsert_capability_document(
            peer_id=adv.peer_id,
            trust_tier=entry.trust_tier,
            network_addresses=entry.network_addresses,
            supported_protocols=entry.supported_protocols,
            service_ids=entry.service_ids,
            received_at=received_at,
        )

    async def _apply_heartbeat(
        self, hb: PeerHeartbeat, received_at: datetime
    ) -> None:
        existing = self._entries.get(hb.peer_id)
        effective_trust_tier, _, forced_health_status = (
            await self._resolve_enrollment_visibility(hb.peer_id)
        )
        health_status = forced_health_status or hb.health_status

        if existing is None:
            entry = PeerRegistryEntry(
                peer_id=hb.peer_id,
                trust_tier=effective_trust_tier or "unknown",
                health_status=health_status,
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
                    "trust_tier": effective_trust_tier or existing.trust_tier,
                    "health_status": health_status,
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
        await self._upsert_topology_document(
            peer_id=hb.peer_id,
            trust_tier=entry.trust_tier,
            health_status=entry.health_status,
            active_reservations=entry.active_reservations,
            active_executions=entry.active_executions,
            peer_log_position=entry.peer_log_position,
            observed_at=received_at,
        )

    async def _upsert_capability_document(
        self,
        *,
        peer_id: str,
        trust_tier: str,
        network_addresses: tuple[str, ...],
        supported_protocols: tuple[str, ...],
        service_ids: tuple[str, ...],
        received_at: datetime,
    ) -> None:
        if self.mongo_runtime is None:
            return
        try:
            existing = await PeerCapabilityDocument.find_one(
                PeerCapabilityDocument.peer_id == peer_id
            )
            if existing is None:
                doc = PeerCapabilityDocument(
                    peer_id=peer_id,
                    capabilities=[trust_tier],
                    published_service_ids=list(service_ids),
                    network_addresses=list(network_addresses),
                    protocol_versions={proto: "1.0.0" for proto in supported_protocols},
                    last_advertised_at=received_at,
                    updated_at=received_at,
                )
                await doc.insert()
            else:
                existing.capabilities = [trust_tier]
                existing.published_service_ids = list(service_ids)
                existing.network_addresses = list(network_addresses)
                existing.protocol_versions = {
                    proto: "1.0.0" for proto in supported_protocols
                }
                existing.last_advertised_at = received_at
                existing.updated_at = received_at
                await existing.save()
        except Exception:
            logger.exception(
                "failed to upsert PeerCapabilityDocument for peer %s", peer_id
            )

    async def _upsert_topology_document(
        self,
        *,
        peer_id: str,
        trust_tier: str,
        health_status: str,
        active_reservations: int,
        active_executions: int,
        peer_log_position: int,
        observed_at: datetime,
    ) -> None:
        if self.mongo_runtime is None:
            return
        try:
            existing = await TopologyProjectionDocument.find_one(
                TopologyProjectionDocument.peer_id == peer_id
            )
            if existing is None:
                doc = TopologyProjectionDocument(
                    peer_id=peer_id,
                    connected_peers=[],
                    trust_tier=trust_tier,
                    health_status=health_status,
                    active_reservations=active_reservations,
                    active_executions=active_executions,
                    peer_log_position=peer_log_position,
                    observed_at=observed_at,
                )
                await doc.insert()
            else:
                existing.trust_tier = trust_tier
                existing.health_status = health_status
                existing.active_reservations = active_reservations
                existing.active_executions = active_executions
                existing.peer_log_position = peer_log_position
                existing.observed_at = observed_at
                await existing.save()
        except Exception:
            logger.exception(
                "failed to upsert TopologyProjectionDocument for peer %s", peer_id
            )

    async def _purge_persisted_peer(self, peer_id: str) -> None:
        if self.mongo_runtime is None:
            return
        try:
            database = self.mongo_runtime.database
            await database[PeerCapabilityDocument.Settings.name].delete_many(
                {"peer_id": peer_id}
            )
            await database[TopologyProjectionDocument.Settings.name].delete_many(
                {"peer_id": peer_id}
            )
        except Exception:
            logger.exception(
                "failed to purge discovery projections for stale peer %s", peer_id
            )

    async def _resolve_enrollment_visibility(
        self,
        peer_id: str,
    ) -> tuple[str | None, bool, str | None]:
        if not self.enforce_enrollment or peer_id in self.trusted_peer_ids:
            return None, True, None

        record = await self._load_enrollment(peer_id)
        if record is None:
            return PeerTrustTier.PUBLIC_UNTRUSTED.value, False, "unapproved"

        if record.enrollment_status == "ready":
            return record.trust_tier, True, None

        if record.enrollment_status in {"quarantined", "rejected"}:
            return PeerTrustTier.QUARANTINED.value, False, record.enrollment_status

        return record.trust_tier, False, "pending_approval"

    async def _load_enrollment(self, peer_id: str) -> PeerEnrollmentRecord | None:
        if self.session_factory is None:
            return None

        async with self.session_factory() as session:  # type: ignore[operator]
            result = await session.execute(
                select(PeerEnrollmentRecord).where(PeerEnrollmentRecord.peer_id == peer_id)
            )
            return result.scalar_one_or_none()
