"""Unit tests for the /api/v1/discovery/* endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.anyio

from quantum_backend_v2.api.routers.discovery import build_discovery_router
from quantum_backend_v2.config.models import Libp2pSettings
from quantum_backend_v2.discovery.registry import PeerRegistry, PeerRegistryEntry
from quantum_backend_v2.discovery.service import DiscoveryService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _make_entry(
    peer_id: str,
    health: str = "healthy",
    trust: str = "platform_managed",
    last_seen_offset_seconds: float = 0.0,
) -> PeerRegistryEntry:
    now = _utc_now() - timedelta(seconds=last_seen_offset_seconds)
    return PeerRegistryEntry(
        peer_id=peer_id,
        trust_tier=trust,
        health_status=health,
        network_addresses=("/ip4/10.0.0.1/tcp/4011",),
        supported_protocols=("/qb2/test/peer-exchange/1.0.0",),
        service_ids=("svc.quantum.test",),
        active_reservations=0,
        active_executions=0,
        peer_log_position=1,
        first_seen_at=now,
        last_seen_at=now,
        last_advertisement_at=now,
        last_heartbeat_at=now,
        rejoined=False,
    )


def _make_service_with_peers(*entries: PeerRegistryEntry) -> DiscoveryService:
    """Build a DiscoveryService with a pre-populated registry for testing."""
    settings = Libp2pSettings(
        enabled=False,
        peer_id="test-peer",
        rendezvous_namespace="test-ns",
        activate_listeners=False,
        stale_peer_ttl_seconds=60,
    )
    mock_runtime = MagicMock()
    service = DiscoveryService(
        settings=settings,
        libp2p_runtime=mock_runtime,
        mongo_runtime=None,
    )
    # Bypass start() and inject a pre-built registry
    registry = PeerRegistry(mongo_runtime=None, stale_peer_ttl_seconds=60)
    for entry in entries:
        registry._entries[entry.peer_id] = entry
    service._registry = registry
    return service


@pytest.fixture
def app_with_two_peers():
    from fastapi import FastAPI

    service = _make_service_with_peers(
        _make_entry("peer-alpha"),
        _make_entry("peer-beta", health="degraded"),
    )
    router = build_discovery_router(discovery_service=service)
    app = FastAPI()
    app.include_router(router)
    return app


class TestListPeersEndpoint:
    async def test_returns_all_active_peers(self, app_with_two_peers) -> None:
        async with AsyncClient(
            transport=ASGITransport(app=app_with_two_peers), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/discovery/peers")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 2
        assert body["include_stale"] is False
        peer_ids = {p["peer_id"] for p in body["peers"]}
        assert peer_ids == {"peer-alpha", "peer-beta"}

    async def test_stale_filter_excludes_old_peers(self) -> None:
        from fastapi import FastAPI

        service = _make_service_with_peers(
            _make_entry("peer-fresh"),
            _make_entry("peer-stale", last_seen_offset_seconds=70),
        )
        router = build_discovery_router(discovery_service=service)
        app = FastAPI()
        app.include_router(router)

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp_active = await client.get("/api/v1/discovery/peers?include_stale=false")
            resp_all = await client.get("/api/v1/discovery/peers?include_stale=true")

        assert resp_active.json()["total"] == 1
        assert resp_active.json()["peers"][0]["peer_id"] == "peer-fresh"
        assert resp_all.json()["total"] == 2


class TestGetPeerEndpoint:
    async def test_returns_peer_detail(self, app_with_two_peers) -> None:
        async with AsyncClient(
            transport=ASGITransport(app=app_with_two_peers), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/discovery/peers/peer-alpha")
        assert resp.status_code == 200
        body = resp.json()
        assert body["peer_id"] == "peer-alpha"
        assert body["trust_tier"] == "platform_managed"
        assert "/ip4/10.0.0.1/tcp/4011" in body["network_addresses"]
        assert "svc.quantum.test" in body["service_ids"]
        assert body["is_stale"] is False

    async def test_returns_404_for_unknown_peer(self, app_with_two_peers) -> None:
        async with AsyncClient(
            transport=ASGITransport(app=app_with_two_peers), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/discovery/peers/does-not-exist")
        assert resp.status_code == 404


class TestTopologyEndpoint:
    async def test_topology_counts_active_and_stale(self) -> None:
        from fastapi import FastAPI

        service = _make_service_with_peers(
            _make_entry("peer-1"),
            _make_entry("peer-2"),
            _make_entry("peer-stale", last_seen_offset_seconds=70),
        )
        router = build_discovery_router(discovery_service=service)
        app = FastAPI()
        app.include_router(router)

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/discovery/topology")

        assert resp.status_code == 200
        body = resp.json()
        assert body["total_peers"] == 3
        assert body["active_peers"] == 2
        assert body["stale_peers"] == 1
