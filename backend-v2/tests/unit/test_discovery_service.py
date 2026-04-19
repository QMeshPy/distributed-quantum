"""Unit tests for DiscoveryService and the transport thread in offline mode.

All tests set ``enabled=False`` (or disable listeners) so no real TCP sockets
or trio threads are started.  The focus is on verifying the asyncio drain loop
and the config-driven wiring, not the live network behaviour.
"""

from __future__ import annotations

import asyncio
import queue
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

pytestmark = pytest.mark.anyio

from quantum_backend_v2.config.models import Libp2pSettings
from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import PeerHeartbeat
from quantum_backend_v2.discovery.service import DiscoveryService, build_discovery_service
from quantum_backend_v2.libp2p.transport import LibP2pNetworkThread


def _offline_settings(**kwargs: object) -> Libp2pSettings:
    """Settings with libp2p disabled — safe for unit tests."""
    defaults = {
        "enabled": False,
        "peer_id": "test-peer",
        "rendezvous_namespace": "test-ns",
        "activate_listeners": False,
        "heartbeat_interval_seconds": 30,
        "stale_peer_ttl_seconds": 60,
    }
    defaults.update(kwargs)  # type: ignore[arg-type]
    return Libp2pSettings(**defaults)


def _make_hb_event(peer_id: str = "remote-peer") -> DiscoveryEvent:
    hb = PeerHeartbeat(
        peer_id=peer_id,
        health_status="healthy",
        active_reservations=0,
        active_executions=0,
        peer_log_position=1,
    )
    return DiscoveryEvent(
        kind=DiscoveryEventKind.HEARTBEAT,
        raw_payload=hb.model_dump_json().encode(),
        received_at=datetime.now(timezone.utc),
    )


class TestDiscoveryServiceLifecycle:
    async def test_start_initialises_registry(self) -> None:
        mock_runtime = MagicMock()
        mock_runtime.host.get_id.return_value = "12D3KooWTest"
        mock_runtime.host.get_addrs.return_value = []

        service = build_discovery_service(
            settings=_offline_settings(),
            libp2p_runtime=mock_runtime,
            mongo_runtime=None,
        )
        service.start()

        # Registry is accessible after start
        assert service.registry is not None
        assert service.registry.peer_count() == 0

        await service.stop()

    async def test_start_is_idempotent(self) -> None:
        mock_runtime = MagicMock()
        service = build_discovery_service(
            settings=_offline_settings(),
            libp2p_runtime=mock_runtime,
            mongo_runtime=None,
        )
        service.start()
        first_registry = service.registry
        service.start()  # second call is a no-op
        assert service.registry is first_registry
        await service.stop()

    async def test_stop_before_start_is_safe(self) -> None:
        mock_runtime = MagicMock()
        service = build_discovery_service(
            settings=_offline_settings(),
            libp2p_runtime=mock_runtime,
            mongo_runtime=None,
        )
        # stop() before start() must not raise
        await service.stop()

    async def test_registry_raises_before_start(self) -> None:
        mock_runtime = MagicMock()
        service = build_discovery_service(
            settings=_offline_settings(),
            libp2p_runtime=mock_runtime,
            mongo_runtime=None,
        )
        with pytest.raises(RuntimeError, match="not been started"):
            _ = service.registry


class TestDiscoveryServiceDrainLoop:
    async def test_drain_loop_processes_queued_events(self) -> None:
        """Events placed on the queue should be reflected in the registry."""
        mock_runtime = MagicMock()
        service = build_discovery_service(
            settings=_offline_settings(),
            libp2p_runtime=mock_runtime,
            mongo_runtime=None,
        )
        service.start()

        # Manually inject an event into the shared queue (bypassing the thread)
        event = _make_hb_event("remote-peer-x")
        service._event_queue.put_nowait(event)

        # Give the drain loop one cycle to process the event
        await asyncio.sleep(1.5)

        entry = service.registry.get_peer("remote-peer-x")
        assert entry is not None
        assert entry.health_status == "healthy"

        await service.stop()

    async def test_multiple_events_drained_in_single_cycle(self) -> None:
        mock_runtime = MagicMock()
        service = build_discovery_service(
            settings=_offline_settings(),
            libp2p_runtime=mock_runtime,
            mongo_runtime=None,
        )
        service.start()

        for i in range(5):
            service._event_queue.put_nowait(_make_hb_event(f"peer-{i}"))

        await asyncio.sleep(1.5)

        assert service.registry.peer_count() == 5

        await service.stop()


class TestNetworkThreadOfflineMode:
    def test_disabled_settings_prevent_thread_start(self) -> None:
        mock_runtime = MagicMock()
        event_queue: queue.SimpleQueue[DiscoveryEvent] = queue.SimpleQueue()

        thread = LibP2pNetworkThread(
            settings=_offline_settings(enabled=False),
            runtime=mock_runtime,
            event_queue=event_queue,
        )
        thread.start()
        assert not thread.is_running
        thread.stop()

    def test_stop_on_never_started_thread_is_safe(self) -> None:
        mock_runtime = MagicMock()
        event_queue: queue.SimpleQueue[DiscoveryEvent] = queue.SimpleQueue()

        thread = LibP2pNetworkThread(
            settings=_offline_settings(enabled=False),
            runtime=mock_runtime,
            event_queue=event_queue,
        )
        thread.stop()  # must not raise


class TestLibp2pSettingsDefaults:
    def test_topics_derived_from_namespace(self) -> None:
        settings = Libp2pSettings(
            peer_id="qb2-dev",
            rendezvous_namespace="my-swarm",
        )
        assert settings.advertisement_topic == "my-swarm.peer-advertisement.v1"
        assert settings.heartbeat_topic == "my-swarm.peer-heartbeat.v1"

    def test_default_activate_listeners_is_true(self) -> None:
        settings = Libp2pSettings(peer_id="qb2-dev")
        assert settings.activate_listeners is True

    def test_default_heartbeat_interval(self) -> None:
        settings = Libp2pSettings(peer_id="qb2-dev")
        assert settings.heartbeat_interval_seconds == 60

    def test_default_stale_ttl(self) -> None:
        settings = Libp2pSettings(peer_id="qb2-dev")
        assert settings.stale_peer_ttl_seconds == 300

    def test_from_env_reads_new_fields(self) -> None:
        from quantum_backend_v2.config.models import AppSettings

        env = {
            "QB2_LIBP2P_ENABLED": "true",
            "QB2_LIBP2P_PEER_ID": "env-peer",
            "QB2_LIBP2P_HEARTBEAT_INTERVAL_SECONDS": "120",
            "QB2_LIBP2P_STALE_PEER_TTL_SECONDS": "600",
            "QB2_LIBP2P_ACTIVATE_LISTENERS": "false",
        }
        settings = AppSettings.from_env(env)
        assert settings.libp2p.heartbeat_interval_seconds == 120
        assert settings.libp2p.stale_peer_ttl_seconds == 600
        assert settings.libp2p.activate_listeners is False
