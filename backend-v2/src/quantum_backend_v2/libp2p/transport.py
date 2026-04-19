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

import logging
import queue
import threading
from datetime import datetime, timezone

import trio
from libp2p.peer.peerstore import create_signed_peer_record
from libp2p.peer.peerinfo import info_from_p2p_addr
from libp2p.tools.anyio_service import background_trio_service
from multiaddr import Multiaddr

from quantum_backend_v2.config.models import Libp2pSettings
from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import (
    PeerAdvertisement,
    PeerHeartbeat,
    ServiceAdvertisementSummary,
)
from quantum_backend_v2.libp2p.addressing import resolve_advertised_network_addresses
from quantum_backend_v2.libp2p.bootstrap import Libp2pRuntime
from quantum_backend_v2.libp2p.pubsub import create_gossipsub_pubsub
from quantum_backend_v2.quality.catalog import KNOWN_SERVICE_IDS

logger = logging.getLogger(__name__)

_STOP_POLL_INTERVAL = 0.5  # seconds
_BOOTSTRAP_CONNECT_RETRIES = 20
_BOOTSTRAP_CONNECT_RETRY_DELAY_SECONDS = 0.5


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
        service_ids: tuple[str, ...] | None = None,
    ) -> None:
        self._settings = settings
        self._runtime = runtime
        self._event_queue = event_queue
        self._service_ids = service_ids if service_ids is not None else KNOWN_SERVICE_IDS
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
            else ()
        )

        try:
            async with host.run(listen_addrs=listen_addrs):
                self._refresh_local_peer_record(host)
                logger.info(
                    "libp2p host running (listeners_active=%s, peer_id=%s)",
                    bool(listen_addrs),
                    str(host.get_id()),
                )
                async with background_trio_service(gossipsub):
                    async with background_trio_service(pubsub):
                        await pubsub.wait_until_ready()
                        await trio.sleep(0.2)
                        logger.debug("GossipSub pubsub ready")
                        await self._connect_bootstrap_peers(host)

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
            await trio.sleep(settings.heartbeat_interval_seconds)

    async def _publish_advertisement(self, pubsub: object) -> None:
        """Publish the initial PeerAdvertisement on startup."""
        host = self._runtime.host
        settings = self._settings

        advertisement = PeerAdvertisement(
            peer_id=str(host.get_id()),
            trust_tier="platform_managed",
            network_addresses=resolve_advertised_network_addresses(host, settings),
            supported_protocols=(f"/qb2/{settings.rendezvous_namespace}/peer-exchange/1.0.0",),
            service_summaries=tuple(
                ServiceAdvertisementSummary(
                    service_id=service_id,
                    version="1.0.0",
                    quantum_capability=service_id,
                    benchmark_mode="quantum_vs_classical",
                )
                for service_id in self._service_ids
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

    async def _connect_bootstrap_peers(self, host: object) -> None:
        if not self._settings.bootstrap_peers:
            return

        for raw_addr in self._settings.bootstrap_peers:
            peer_info = info_from_p2p_addr(Multiaddr(raw_addr))
            for attempt in range(1, _BOOTSTRAP_CONNECT_RETRIES + 1):
                try:
                    await host.connect(peer_info)  # type: ignore[attr-defined]
                    logger.info(
                        "connected to bootstrap peer %s on attempt %d",
                        peer_info.peer_id,
                        attempt,
                    )
                    break
                except Exception:
                    if attempt >= _BOOTSTRAP_CONNECT_RETRIES:
                        logger.exception(
                            "failed to connect to bootstrap peer %s after %d attempts",
                            raw_addr,
                            _BOOTSTRAP_CONNECT_RETRIES,
                        )
                    else:
                        await trio.sleep(_BOOTSTRAP_CONNECT_RETRY_DELAY_SECONDS)

    def _refresh_local_peer_record(self, host: object) -> None:
        try:
            advertised_addrs = [
                Multiaddr(addr)
                for addr in resolve_advertised_network_addresses(host, self._settings)
            ]
            envelope = create_signed_peer_record(
                host.get_id(),  # type: ignore[attr-defined]
                advertised_addrs,
                host.get_private_key(),  # type: ignore[attr-defined]
            )
            host.get_peerstore().set_local_record(envelope)  # type: ignore[attr-defined]
        except Exception:
            logger.exception("failed to refresh local signed peer record")


def build_network_thread(
    settings: Libp2pSettings,
    runtime: Libp2pRuntime,
    event_queue: queue.SimpleQueue[DiscoveryEvent],
    service_ids: tuple[str, ...] | None = None,
) -> LibP2pNetworkThread:
    """Factory that constructs a ``LibP2pNetworkThread``."""
    return LibP2pNetworkThread(
        settings=settings,
        runtime=runtime,
        event_queue=event_queue,
        service_ids=service_ids,
    )
