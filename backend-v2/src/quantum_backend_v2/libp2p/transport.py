"""Trio-based network transport thread for libp2p host, GossipSub, and heartbeats.

``LibP2pNetworkThread`` bridges the trio world (py-libp2p) with the asyncio
world (FastAPI).  It runs entirely inside a daemon thread driven by
``trio.run``.  Events received over GossipSub topics are placed onto a
``queue.SimpleQueue`` (which is thread-safe).  The asyncio side drains the
queue independently; no blocking synchronisation is needed.

Lifecycle
---------
1. ``start()`` — spins up a daemon thread running ``trio.run(_trio_main)``.
2. ``_trio_main`` —
   a. starts ``host.run(listen_addrs=...)`` to activate TCP listeners;
   b. creates and starts GossipSub + Pubsub inside background services;
   c. subscribes to advertisement and heartbeat topics;
   d. publishes an initial self-advertisement;
   e. runs a heartbeat loop and two receive loops inside a nursery;
   f. polls ``_stop_event`` and cancels the nursery when it fires.
3. ``stop(timeout)`` — sets the stop event and joins the thread.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
from datetime import datetime, timezone

import trio
from multiaddr import Multiaddr

from libp2p.tools.anyio_service import background_trio_service

from quantum_backend_v2.config.models import Libp2pSettings
from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import PeerAdvertisement, PeerHeartbeat
from quantum_backend_v2.libp2p.bootstrap import Libp2pRuntime, create_real_libp2p_runtime
from quantum_backend_v2.libp2p.pubsub import create_gossipsub_pubsub

logger = logging.getLogger(__name__)

_STOP_POLL_INTERVAL = 0.5  # seconds


class LibP2pNetworkThread:
    """Runs py-libp2p host, GossipSub pubsub, and heartbeat scheduling in a
    background trio daemon thread.

    The thread is self-contained: all trio coroutines live inside it.  The
    only shared state between this thread and asyncio is the ``event_queue``
    (thread-safe ``queue.SimpleQueue``).
    """

    def __init__(
        self,
        settings: Libp2pSettings,
        runtime: Libp2pRuntime,
        event_queue: queue.SimpleQueue[DiscoveryEvent],
    ) -> None:
        self._settings = settings
        self._runtime = runtime
        self._event_queue = event_queue
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    @property
    def is_running(self) -> bool:
        """True if the background thread is alive."""
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        """Start the trio daemon thread.  No-op if libp2p is disabled."""
        if not self._settings.enabled:
            logger.info("libp2p disabled in settings — network thread not started")
            return
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=trio.run,
            args=(self._trio_main,),
            daemon=True,
            name="libp2p-network",
        )
        self._thread.start()
        logger.info("libp2p network thread started (peer_id=%s)", self._settings.peer_id)

    def stop(self, timeout: float = 10.0) -> None:
        """Signal the trio thread to stop and wait for it to exit."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)
            if self._thread.is_alive():
                logger.warning("libp2p network thread did not stop within %.1fs", timeout)
            else:
                logger.info("libp2p network thread stopped")

    # ------------------------------------------------------------------
    # Trio-side implementation
    # ------------------------------------------------------------------

    async def _trio_main(self) -> None:
        """Root trio coroutine: starts the host, pubsub, and all service loops."""
        settings = self._settings
        host = self._runtime.host

        gossipsub, pubsub = create_gossipsub_pubsub(
            host,
            heartbeat_interval=settings.heartbeat_interval_seconds,
        )

        listen_addrs = (
            [Multiaddr(addr) for addr in settings.listen_multiaddrs]
            if settings.activate_listeners and settings.listen_multiaddrs
            else None
        )

        try:
            async with host.run(listen_addrs=listen_addrs):
                logger.info(
                    "libp2p host running (listeners_active=%s, peer_id=%s)",
                    listen_addrs is not None,
                    str(host.get_id()),
                )
                async with background_trio_service(pubsub):
                    async with background_trio_service(gossipsub):
                        await pubsub.wait_until_ready()
                        logger.debug("GossipSub pubsub ready")

                        adv_sub = await pubsub.subscribe(settings.advertisement_topic)
                        hb_sub = await pubsub.subscribe(settings.heartbeat_topic)

                        await self._publish_advertisement(pubsub)

                        async with trio.open_nursery() as nursery:
                            nursery.start_soon(
                                self._receive_loop,
                                adv_sub,
                                DiscoveryEventKind.ADVERTISEMENT,
                            )
                            nursery.start_soon(
                                self._receive_loop,
                                hb_sub,
                                DiscoveryEventKind.HEARTBEAT,
                            )
                            nursery.start_soon(self._heartbeat_loop, pubsub)
                            nursery.start_soon(self._watch_stop, nursery)
        except Exception:
            logger.exception("libp2p network thread encountered an unhandled exception")

    async def _watch_stop(self, nursery: trio.Nursery) -> None:
        """Poll the threading stop event and cancel the nursery when it fires."""
        while not self._stop_event.is_set():
            await trio.sleep(_STOP_POLL_INTERVAL)
        logger.debug("stop event detected — cancelling libp2p nursery")
        nursery.cancel_scope.cancel()

    async def _receive_loop(
        self,
        subscription: object,
        kind: DiscoveryEventKind,
    ) -> None:
        """Drain a pubsub subscription and push raw events onto the shared queue."""
        while True:
            message = await subscription.get()  # type: ignore[attr-defined]
            self._event_queue.put_nowait(
                DiscoveryEvent(
                    kind=kind,
                    raw_payload=message.data,
                    received_at=datetime.now(timezone.utc),
                )
            )

    async def _heartbeat_loop(self, pubsub: object) -> None:
        """Publish a PeerHeartbeat on a fixed interval."""
        host = self._runtime.host
        settings = self._settings

        while True:
            await trio.sleep(settings.heartbeat_interval_seconds)
            heartbeat = PeerHeartbeat(
                peer_id=str(host.get_id()),
                health_status="healthy",
                active_reservations=0,
                active_executions=0,
                peer_log_position=0,
            )
            try:
                await pubsub.publish(  # type: ignore[attr-defined]
                    settings.heartbeat_topic,
                    heartbeat.model_dump_json().encode(),
                )
                logger.debug("heartbeat published for peer %s", heartbeat.peer_id)
            except Exception:
                logger.exception("failed to publish heartbeat")

    async def _publish_advertisement(self, pubsub: object) -> None:
        """Publish the initial PeerAdvertisement on startup."""
        host = self._runtime.host
        settings = self._settings

        advertisement = PeerAdvertisement(
            peer_id=str(host.get_id()),
            trust_tier="platform_managed",
            network_addresses=tuple(str(addr) for addr in host.get_addrs()),
            supported_protocols=(
                f"/qb2/{settings.rendezvous_namespace}/peer-exchange/1.0.0",
            ),
        )
        try:
            await pubsub.publish(  # type: ignore[attr-defined]
                settings.advertisement_topic,
                advertisement.model_dump_json().encode(),
            )
            logger.info(
                "initial advertisement published (peer_id=%s, addrs=%d)",
                advertisement.peer_id,
                len(advertisement.network_addresses),
            )
        except Exception:
            logger.exception("failed to publish initial advertisement")


def build_network_thread(
    settings: Libp2pSettings,
    runtime: Libp2pRuntime,
    event_queue: queue.SimpleQueue[DiscoveryEvent],
) -> LibP2pNetworkThread:
    """Factory that constructs a ``LibP2pNetworkThread``."""
    return LibP2pNetworkThread(
        settings=settings,
        runtime=runtime,
        event_queue=event_queue,
    )
