"""Unit tests for PeerRegistry — TTL enforcement, stale handling, and rejoin flow."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

pytestmark = pytest.mark.anyio

from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import (
    PeerAdvertisement,
    PeerHeartbeat,
    ServiceAdvertisementSummary,
)
from quantum_backend_v2.discovery.registry import PeerRegistry


def _adv_event(peer_id: str = "peer-alpha") -> DiscoveryEvent:
    adv = PeerAdvertisement(
        peer_id=peer_id,
        trust_tier="platform_managed",
        network_addresses=("/ip4/10.0.0.1/tcp/4011",),
        supported_protocols=("/qb2/test/peer-exchange/1.0.0",),
        service_summaries=(
            ServiceAdvertisementSummary(
                service_id="svc.quantum.test",
                version="1.0.0",
                quantum_capability="test.capability",
                benchmark_mode="quantum_vs_classical",
            ),
        ),
        peer_log_position=7,
    )
    return DiscoveryEvent(
        kind=DiscoveryEventKind.ADVERTISEMENT,
        raw_payload=adv.model_dump_json().encode(),
        received_at=datetime.now(timezone.utc),
    )


def _hb_event(peer_id: str = "peer-alpha", health: str = "healthy") -> DiscoveryEvent:
    hb = PeerHeartbeat(
        peer_id=peer_id,
        health_status=health,
        active_reservations=1,
        active_executions=0,
        peer_log_position=7,
    )
    return DiscoveryEvent(
        kind=DiscoveryEventKind.HEARTBEAT,
        raw_payload=hb.model_dump_json().encode(),
        received_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def registry() -> PeerRegistry:
    return PeerRegistry(mongo_runtime=None, stale_peer_ttl_seconds=60)


class TestPeerRegistryAdvertisement:
    async def test_first_advertisement_registers_peer(self, registry: PeerRegistry) -> None:
        await registry.process_event(_adv_event("peer-alpha"))

        entry = registry.get_peer("peer-alpha")
        assert entry is not None
        assert entry.peer_id == "peer-alpha"
        assert entry.trust_tier == "platform_managed"
        assert entry.network_addresses == ("/ip4/10.0.0.1/tcp/4011",)
        assert "svc.quantum.test" in entry.service_ids
        assert entry.peer_log_position == 7

    async def test_repeated_advertisement_updates_entry(self, registry: PeerRegistry) -> None:
        await registry.process_event(_adv_event("peer-alpha"))

        adv2 = PeerAdvertisement(
            peer_id="peer-alpha",
            trust_tier="org_managed",
            network_addresses=("/ip4/10.0.0.2/tcp/4011",),
            supported_protocols=(),
            peer_log_position=99,
        )
        event2 = DiscoveryEvent(
            kind=DiscoveryEventKind.ADVERTISEMENT,
            raw_payload=adv2.model_dump_json().encode(),
            received_at=datetime.now(timezone.utc),
        )
        await registry.process_event(event2)

        entry = registry.get_peer("peer-alpha")
        assert entry is not None
        assert entry.trust_tier == "org_managed"
        assert entry.network_addresses == ("/ip4/10.0.0.2/tcp/4011",)
        assert entry.peer_log_position == 99


class TestPeerRegistryHeartbeat:
    async def test_heartbeat_registers_unknown_peer(self, registry: PeerRegistry) -> None:
        await registry.process_event(_hb_event("peer-beta"))

        entry = registry.get_peer("peer-beta")
        assert entry is not None
        assert entry.health_status == "healthy"
        assert entry.active_reservations == 1

    async def test_heartbeat_updates_health_status(self, registry: PeerRegistry) -> None:
        await registry.process_event(_hb_event("peer-beta", health="healthy"))
        await registry.process_event(_hb_event("peer-beta", health="degraded"))

        entry = registry.get_peer("peer-beta")
        assert entry is not None
        assert entry.health_status == "degraded"

    async def test_unenrolled_peer_heartbeat_is_not_marked_healthy(self) -> None:
        registry = PeerRegistry(
            mongo_runtime=None,
            stale_peer_ttl_seconds=60,
            enforce_enrollment=True,
        )
        registry._load_enrollment = AsyncMock(return_value=None)  # type: ignore[method-assign]

        await registry.process_event(_hb_event("peer-unapproved", health="healthy"))

        entry = registry.get_peer("peer-unapproved")
        assert entry is not None
        assert entry.health_status == "unapproved"


class TestPeerRegistryEnrollmentVisibility:
    async def test_unenrolled_peer_advertisement_is_sandboxed(self) -> None:
        registry = PeerRegistry(
            mongo_runtime=None,
            stale_peer_ttl_seconds=60,
            enforce_enrollment=True,
        )
        registry._load_enrollment = AsyncMock(return_value=None)  # type: ignore[method-assign]

        await registry.process_event(_adv_event("peer-unapproved"))

        entry = registry.get_peer("peer-unapproved")
        assert entry is not None
        assert entry.trust_tier == "public_untrusted"
        assert entry.service_ids == ()


class TestPeerRegistryStaleHandling:
    async def test_peer_is_not_stale_immediately_after_event(
        self, registry: PeerRegistry
    ) -> None:
        await registry.process_event(_adv_event("peer-alpha"))
        assert not registry.is_peer_stale("peer-alpha")

    async def test_peer_becomes_stale_past_ttl(self, registry: PeerRegistry) -> None:
        await registry.process_event(_adv_event("peer-alpha"))

        # Backdating last_seen_at past the TTL by mutating the cached entry
        entry = registry._entries["peer-alpha"]
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=61)
        registry._entries["peer-alpha"] = entry.model_copy(
            update={"last_seen_at": stale_time}
        )

        assert registry.is_peer_stale("peer-alpha")

    async def test_list_peers_excludes_stale_by_default(
        self, registry: PeerRegistry
    ) -> None:
        await registry.process_event(_adv_event("peer-alpha"))
        await registry.process_event(_adv_event("peer-beta"))

        # Backdate peer-beta past TTL
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=65)
        entry = registry._entries["peer-beta"]
        registry._entries["peer-beta"] = entry.model_copy(
            update={"last_seen_at": stale_time}
        )

        active = registry.list_peers(include_stale=False)
        all_peers = registry.list_peers(include_stale=True)

        assert len(active) == 1
        assert active[0].peer_id == "peer-alpha"
        assert len(all_peers) == 2

    async def test_stale_sweep_returns_count(self, registry: PeerRegistry) -> None:
        await registry.process_event(_adv_event("peer-alpha"))
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=65)
        entry = registry._entries["peer-alpha"]
        registry._entries["peer-alpha"] = entry.model_copy(
            update={"last_seen_at": stale_time}
        )
        registry.mongo_runtime = object()
        registry._purge_persisted_peer = AsyncMock()  # type: ignore[method-assign]

        count = await registry.sweep_stale_peers()
        assert count == 1
        assert registry.get_peer("peer-alpha") is None
        registry._purge_persisted_peer.assert_awaited_once_with("peer-alpha")  # type: ignore[attr-defined]


class TestPeerRegistryRejoin:
    async def test_stale_peer_rejoin_on_re_advertisement(
        self, registry: PeerRegistry
    ) -> None:
        # First advertisement — peer is active
        await registry.process_event(_adv_event("peer-gamma"))

        # Backdate to make stale
        stale_time = datetime.now(timezone.utc) - timedelta(seconds=70)
        entry = registry._entries["peer-gamma"]
        registry._entries["peer-gamma"] = entry.model_copy(
            update={"last_seen_at": stale_time}
        )
        assert registry.is_peer_stale("peer-gamma")

        # Peer re-advertises (rejoin)
        await registry.process_event(_adv_event("peer-gamma"))

        entry = registry.get_peer("peer-gamma")
        assert entry is not None
        assert entry.rejoined is True
        assert not registry.is_peer_stale("peer-gamma")

    async def test_stale_peer_rejoin_on_heartbeat(
        self, registry: PeerRegistry
    ) -> None:
        await registry.process_event(_hb_event("peer-delta"))

        stale_time = datetime.now(timezone.utc) - timedelta(seconds=70)
        entry = registry._entries["peer-delta"]
        registry._entries["peer-delta"] = entry.model_copy(
            update={"last_seen_at": stale_time}
        )

        await registry.process_event(_hb_event("peer-delta"))

        entry = registry.get_peer("peer-delta")
        assert entry is not None
        assert entry.rejoined is True


class TestPeerRegistryQueryInterface:
    async def test_peer_count_tracks_all_seen_peers(self, registry: PeerRegistry) -> None:
        assert registry.peer_count() == 0
        await registry.process_event(_adv_event("peer-alpha"))
        await registry.process_event(_adv_event("peer-beta"))
        assert registry.peer_count() == 2

    async def test_get_peer_returns_none_for_unknown(self, registry: PeerRegistry) -> None:
        assert registry.get_peer("unknown-peer") is None

    async def test_is_stale_returns_false_for_unknown_peer(
        self, registry: PeerRegistry
    ) -> None:
        assert not registry.is_peer_stale("completely-unknown")


class _AsyncDocList:
    def __init__(self, documents: list[object]) -> None:
        self._documents = documents

    async def to_list(self) -> list[object]:
        return self._documents


class _DeleteRecorder:
    def __init__(self) -> None:
        self.filters: list[dict[str, str]] = []

    async def delete_many(self, query: dict[str, str]) -> None:
        self.filters.append(query)


class TestPeerRegistryRehydrate:
    async def test_rehydrate_normalizes_naive_datetimes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from quantum_backend_v2.persistence.mongodb import (
            PeerCapabilityDocument,
            TopologyProjectionDocument,
        )

        naive_now = datetime.now(timezone.utc).replace(tzinfo=None)
        capability_doc = SimpleNamespace(
            peer_id="peer-restored",
            capabilities=["platform_managed"],
            published_service_ids=["svc.quantum.test"],
            network_addresses=["/ip4/10.0.0.5/tcp/4011"],
            protocol_versions={"/qb2/test/peer-exchange/1.0.0": "1.0.0"},
            last_advertised_at=naive_now,
            updated_at=naive_now,
        )
        topology_doc = SimpleNamespace(
            peer_id="peer-restored",
            trust_tier="platform_managed",
            health_status="healthy",
            active_reservations=1,
            active_executions=2,
            peer_log_position=9,
            observed_at=naive_now,
        )

        monkeypatch.setattr(
            PeerCapabilityDocument,
            "find_all",
            lambda: _AsyncDocList([capability_doc]),
        )
        monkeypatch.setattr(
            TopologyProjectionDocument,
            "find_all",
            lambda: _AsyncDocList([topology_doc]),
        )

        registry = PeerRegistry(mongo_runtime=object(), stale_peer_ttl_seconds=60)

        await registry.rehydrate()

        entry = registry.get_peer("peer-restored")
        assert entry is not None
        assert entry.last_seen_at.tzinfo is not None
        assert entry.last_advertisement_at is not None
        assert entry.last_advertisement_at.tzinfo is not None
        assert not registry.is_peer_stale("peer-restored")

    async def test_rehydrate_purges_stale_persisted_peers(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from quantum_backend_v2.persistence.mongodb import (
            PeerCapabilityDocument,
            TopologyProjectionDocument,
        )

        stale_now = datetime.now(timezone.utc) - timedelta(seconds=120)
        capability_doc = SimpleNamespace(
            peer_id="peer-stale",
            capabilities=["platform_managed"],
            published_service_ids=["svc.quantum.test"],
            network_addresses=["/ip4/10.0.0.9/tcp/4011"],
            protocol_versions={"/qb2/test/peer-exchange/1.0.0": "1.0.0"},
            last_advertised_at=stale_now,
            updated_at=stale_now,
        )
        topology_doc = SimpleNamespace(
            peer_id="peer-stale",
            trust_tier="platform_managed",
            health_status="healthy",
            active_reservations=0,
            active_executions=0,
            peer_log_position=1,
            observed_at=stale_now,
        )

        monkeypatch.setattr(
            PeerCapabilityDocument,
            "find_all",
            lambda: _AsyncDocList([capability_doc]),
        )
        monkeypatch.setattr(
            TopologyProjectionDocument,
            "find_all",
            lambda: _AsyncDocList([topology_doc]),
        )

        registry = PeerRegistry(mongo_runtime=object(), stale_peer_ttl_seconds=60)
        registry._purge_persisted_peer = AsyncMock()  # type: ignore[method-assign]

        await registry.rehydrate()

        assert registry.peer_count() == 0
        assert registry.get_peer("peer-stale") is None
        registry._purge_persisted_peer.assert_awaited_once_with("peer-stale")  # type: ignore[attr-defined]


class TestPeerRegistryPersistenceCleanup:
    async def test_purge_persisted_peer_deletes_both_discovery_collections(self) -> None:
        capability_collection = _DeleteRecorder()
        topology_collection = _DeleteRecorder()
        mongo_runtime = SimpleNamespace(
            database={
                "peer_capabilities": capability_collection,
                "topology_projections": topology_collection,
            }
        )
        registry = PeerRegistry(mongo_runtime=mongo_runtime, stale_peer_ttl_seconds=60)

        await registry._purge_persisted_peer("peer-alpha")

        assert capability_collection.filters == [{"peer_id": "peer-alpha"}]
        assert topology_collection.filters == [{"peer_id": "peer-alpha"}]
