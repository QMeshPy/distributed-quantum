"""Discovery service — coordinates the libp2p transport thread and the peer registry.

``DiscoveryService`` is the single component the FastAPI lifespan talks to.

Startup sequence (asyncio side):
1. ``start()`` is called from the FastAPI lifespan after persistence startup.
2. ``start()`` spins up ``LibP2pNetworkThread`` (trio daemon thread).
3. ``start()`` creates an asyncio background task that drains the event queue.

Shutdown sequence:
1. ``stop()`` stops the trio daemon thread (sets stop event, joins thread).
2. ``stop()`` cancels and awaits the asyncio drain task.

Stale-peer sweeps run inside the drain loop on a configurable cadence so the
registry TTL is enforced without a separate scheduled task.
"""

from __future__ import annotations

import asyncio
import logging
import queue
from dataclasses import dataclass, field

from quantum_backend_v2.config.models import Libp2pSettings
from quantum_backend_v2.discovery.events import DiscoveryEvent
from quantum_backend_v2.discovery.registry import PeerRegistry
from quantum_backend_v2.libp2p.bootstrap import Libp2pRuntime
from quantum_backend_v2.libp2p.transport import LibP2pNetworkThread, build_network_thread
from quantum_backend_v2.persistence.mongodb import MongoRuntime

logger = logging.getLogger(__name__)

_DRAIN_INTERVAL_SECONDS = 1.0
_SWEEP_EVERY_N_DRAINS = 30  # sweep every ~30 seconds


@dataclass
class DiscoveryService:
    """Asyncio-facing discovery service.

    Owned and started by the FastAPI lifespan; passed to API routers
    for peer registry queries.
    """

    settings: Libp2pSettings
    libp2p_runtime: Libp2pRuntime
    mongo_runtime: MongoRuntime | None

    _event_queue: queue.SimpleQueue[DiscoveryEvent] = field(
        default_factory=queue.SimpleQueue, init=False
    )
    _network_thread: LibP2pNetworkThread | None = field(default=None, init=False)
    _registry: PeerRegistry | None = field(default=None, init=False)
    _drain_task: asyncio.Task[None] | None = field(default=None, init=False)

    @property
    def registry(self) -> PeerRegistry:
        """The peer registry.  Always populated after ``start()``."""
        if self._registry is None:
            raise RuntimeError("DiscoveryService has not been started yet")
        return self._registry

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Start the discovery service from the asyncio lifespan.

        Safe to call multiple times (subsequent calls are no-ops).
        """
        if self._registry is not None:
            return

        self._registry = PeerRegistry(
            mongo_runtime=self.mongo_runtime,
            stale_peer_ttl_seconds=self.settings.stale_peer_ttl_seconds,
        )
        self._network_thread = build_network_thread(
            settings=self.settings,
            runtime=self.libp2p_runtime,
            event_queue=self._event_queue,
        )
        self._network_thread.start()
        self._drain_task = asyncio.create_task(
            self._drain_loop(), name="discovery-drain"
        )
        logger.info(
            "discovery service started (namespace=%s, stale_ttl=%ds)",
            self.settings.rendezvous_namespace,
            self.settings.stale_peer_ttl_seconds,
        )

    async def stop(self) -> None:
        """Stop the service gracefully: shut down the thread and drain task."""
        if self._network_thread is not None:
            self._network_thread.stop()
            self._network_thread = None

        if self._drain_task is not None and not self._drain_task.done():
            self._drain_task.cancel()
            try:
                await self._drain_task
            except asyncio.CancelledError:
                pass
            self._drain_task = None

        logger.info("discovery service stopped")

    # ------------------------------------------------------------------
    # Asyncio drain loop
    # ------------------------------------------------------------------

    async def _drain_loop(self) -> None:
        """Drain the event queue and periodically sweep stale peers."""
        sweep_counter = 0

        while True:
            await asyncio.sleep(_DRAIN_INTERVAL_SECONDS)

            # Drain all queued events from the trio thread
            drained = 0
            while True:
                try:
                    event = self._event_queue.get_nowait()
                    if self._registry is not None:
                        await self._registry.process_event(event)
                    drained += 1
                except queue.Empty:
                    break

            if drained:
                logger.debug("drained %d discovery events from queue", drained)

            # Periodic stale sweep
            sweep_counter += 1
            if sweep_counter >= _SWEEP_EVERY_N_DRAINS and self._registry is not None:
                sweep_counter = 0
                stale = await self._registry.sweep_stale_peers()
                if stale:
                    logger.info("stale peer sweep: %d stale peers found", stale)


def build_discovery_service(
    settings: Libp2pSettings,
    libp2p_runtime: Libp2pRuntime,
    mongo_runtime: MongoRuntime | None,
) -> DiscoveryService:
    """Factory: construct a ``DiscoveryService`` from its dependencies."""
    return DiscoveryService(
        settings=settings,
        libp2p_runtime=libp2p_runtime,
        mongo_runtime=mongo_runtime,
    )
