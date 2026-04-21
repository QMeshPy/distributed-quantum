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
from pathlib import Path

from quantum_backend_v2.config.models import Libp2pSettings
from quantum_backend_v2.discovery.events import DiscoveryEvent, DiscoveryEventKind
from quantum_backend_v2.discovery.models import (
    PeerAdvertisement,
    PeerHeartbeat,
    ServiceAdvertisementSummary,
)
from quantum_backend_v2.discovery.registry import PeerRegistry, PeerRegistryEntry
from quantum_backend_v2.libp2p.addressing import (
    normalize_local_loopback_addr,
    resolve_advertised_network_addresses,
)
from quantum_backend_v2.libp2p.bootstrap import Libp2pRuntime, create_real_libp2p_runtime
from quantum_backend_v2.libp2p.fragment_worker import PeerFragmentWorker
from quantum_backend_v2.libp2p.protocol_ids import build_execution_protocol_ids
from quantum_backend_v2.libp2p.transport import (
    LibP2pNetworkThread,
    build_network_thread,
)
from quantum_backend_v2.persistence.mongodb import MongoRuntime
from quantum_backend_v2.quality.catalog import KNOWN_SERVICE_IDS

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
    session_factory: object | None = None
    enforce_enrollment: bool = False

    _event_queue: queue.SimpleQueue[DiscoveryEvent] = field(
        default_factory=queue.SimpleQueue, init=False
    )
    _network_thread: LibP2pNetworkThread | None = field(default=None, init=False)
    _service_peer_threads: list[LibP2pNetworkThread] = field(default_factory=list, init=False)
    _registry: PeerRegistry | None = field(default=None, init=False)
    _drain_task: asyncio.Task[None] | None = field(default=None, init=False)

    @property
    def registry(self) -> PeerRegistry:
        """The peer registry.  Always populated after ``start()``."""
        if self._registry is None:
            raise RuntimeError("DiscoveryService has not been started yet")
        return self._registry

    @property
    def coordinator_network(self) -> LibP2pNetworkThread:
        """The coordinator's active libp2p transport thread."""
        if self._network_thread is None:
            raise RuntimeError("DiscoveryService has not been started yet")
        return self._network_thread

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Start the discovery service from the asyncio lifespan.

        Safe to call multiple times (subsequent calls are no-ops).
        """
        if self._registry is not None:
            return

        trusted_peer_ids = {str(self.libp2p_runtime.host.get_id())}
        self._registry = PeerRegistry(
            mongo_runtime=self.mongo_runtime,
            stale_peer_ttl_seconds=self.settings.stale_peer_ttl_seconds,
            session_factory=self.session_factory,
            enforce_enrollment=self.enforce_enrollment,
            trusted_peer_ids=trusted_peer_ids,
        )
        await self._registry.rehydrate()
        self._network_thread = build_network_thread(
            settings=self.settings,
            runtime=self.libp2p_runtime,
            event_queue=self._event_queue,
            service_ids=self._local_service_ids(),
        )
        self._network_thread.start()
        if self.settings.enabled:
            self._start_embedded_service_peers()
            self._seed_local_peer_events(self._local_service_ids())
        self._drain_task = asyncio.create_task(self._drain_loop(), name="discovery-drain")
        logger.info(
            "discovery service started (namespace=%s, stale_ttl=%ds)",
            self.settings.rendezvous_namespace,
            self.settings.stale_peer_ttl_seconds,
        )

    async def stop(self) -> None:
        """Stop the service gracefully: shut down the thread and drain task."""
        for thread in reversed(self._service_peer_threads):
            thread.stop()
        self._service_peer_threads.clear()

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

    async def request_peer_rpc(
        self,
        *,
        peer_id: str,
        protocol_id: str,
        payload: bytes,
        peer_addresses: tuple[str, ...] = (),
        timeout_seconds: float = 15.0,
    ) -> bytes:
        """Send a request over the coordinator's libp2p transport."""
        return await asyncio.to_thread(
            self.coordinator_network.request_bytes,
            peer_id=peer_id,
            protocol_id=protocol_id,
            payload=payload,
            peer_addresses=peer_addresses,
            timeout_seconds=timeout_seconds,
        )

    async def wait_for_service_peers(
        self,
        *,
        minimum_count: int | None = None,
        timeout_seconds: float = 10.0,
    ) -> list[PeerRegistryEntry]:
        """Wait until a minimum number of healthy service peers are visible."""
        expected_count = minimum_count
        if expected_count is None:
            if self.settings.dev_service_peer_count > 0:
                expected_count = self.settings.dev_service_peer_count
            else:
                expected_count = 1 if self.settings.enabled else 0
        if expected_count <= 0:
            return self._healthy_service_peers()

        deadline = asyncio.get_running_loop().time() + timeout_seconds
        while True:
            peers = self._healthy_service_peers()
            if len(peers) >= expected_count:
                return peers
            if asyncio.get_running_loop().time() >= deadline:
                raise RuntimeError(
                    "timed out waiting for healthy service peers "
                    f"(expected={expected_count}, observed={len(peers)})"
                )
            await asyncio.sleep(0.2)

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

    def _seed_local_peer_events(self, service_ids: tuple[str, ...]) -> None:
        peer_id = str(self.libp2p_runtime.host.get_id())

        advertisement = PeerAdvertisement(
            peer_id=peer_id,
            trust_tier="platform_managed",
            network_addresses=resolve_advertised_network_addresses(
                self.libp2p_runtime.host, self.settings
            ),
            supported_protocols=(f"/qb2/{self.settings.rendezvous_namespace}/peer-exchange/1.0.0",),
            service_summaries=tuple(
                ServiceAdvertisementSummary(
                    service_id=service_id,
                    version="1.0.0",
                    quantum_capability=service_id,
                    benchmark_mode="quantum_vs_classical",
                )
                for service_id in service_ids
            ),
        )
        heartbeat = PeerHeartbeat(
            peer_id=peer_id,
            health_status="healthy",
            active_reservations=0,
            active_executions=0,
            peer_log_position=0,
        )
        self._event_queue.put_nowait(
            DiscoveryEvent(
                kind=DiscoveryEventKind.ADVERTISEMENT,
                raw_payload=advertisement.model_dump_json().encode(),
                received_at=advertisement.emitted_at,
            )
        )
        self._event_queue.put_nowait(
            DiscoveryEvent(
                kind=DiscoveryEventKind.HEARTBEAT,
                raw_payload=heartbeat.model_dump_json().encode(),
                received_at=heartbeat.emitted_at,
            )
        )

    def _local_service_ids(self) -> tuple[str, ...]:
        if self.settings.dev_service_peer_count > 0:
            return ()
        return KNOWN_SERVICE_IDS

    def _start_embedded_service_peers(self) -> None:
        if self.settings.dev_service_peer_count <= 0:
            return
        if not self.settings.activate_listeners:
            raise RuntimeError(
                "local embedded service peers require QB2_LIBP2P_ACTIVATE_LISTENERS=true"
            )

        bootstrap_peers = self._bootstrap_peer_multiaddrs()
        for worker_index in range(self.settings.dev_service_peer_count):
            worker_settings = self._build_embedded_service_settings(
                worker_index=worker_index,
                bootstrap_peers=bootstrap_peers,
            )
            worker_runtime = create_real_libp2p_runtime(worker_settings)
            worker_protocols = build_execution_protocol_ids(
                worker_settings.rendezvous_namespace
            )
            worker_peer_id = str(worker_runtime.host.get_id())
            worker = PeerFragmentWorker(peer_id=worker_peer_id)
            if self._registry is not None:
                self._registry.trusted_peer_ids.add(worker_peer_id)
            worker_thread = build_network_thread(
                settings=worker_settings,
                runtime=worker_runtime,
                event_queue=None,
                service_ids=KNOWN_SERVICE_IDS,
                request_handlers={
                    worker_protocols.reservation_prepare: worker.handle_prepare,
                    worker_protocols.reservation_commit: worker.handle_commit,
                    worker_protocols.reservation_cancel: worker.handle_cancel,
                    worker_protocols.fragment_dispatch: worker.handle_dispatch,
                },
                heartbeat_provider=worker.heartbeat_snapshot,
                consume_discovery=False,
            )
            worker_thread.start()
            self._service_peer_threads.append(worker_thread)

        logger.info(
            "started %d embedded libp2p worker peers for local distributed dev",
            len(self._service_peer_threads),
        )

    def _build_embedded_service_settings(
        self,
        *,
        worker_index: int,
        bootstrap_peers: tuple[str, ...],
    ) -> Libp2pSettings:
        worker_number = worker_index + 1
        worker_peer_label = f"{self.settings.peer_id}-worker-{worker_number}"
        worker_port = self.settings.dev_service_base_port + worker_index
        return self.settings.model_copy(
            update={
                "peer_id": worker_peer_label,
                "listen_multiaddrs": (f"/ip4/127.0.0.1/tcp/{worker_port}",),
                "bootstrap_peers": bootstrap_peers,
                "peerstore_path": _with_path_suffix(
                    self.settings.peerstore_path,
                    f"worker-{worker_number}",
                ),
            }
        )

    def _bootstrap_peer_multiaddrs(self) -> tuple[str, ...]:
        local_peer_id = str(self.libp2p_runtime.host.get_id())
        advertised = resolve_advertised_network_addresses(
            self.libp2p_runtime.host,
            self.settings,
        )
        if not advertised:
            raise RuntimeError("local embedded service peers require at least one listen multiaddr")
        return tuple(
            _append_p2p_suffix(normalize_local_loopback_addr(addr), local_peer_id)
            for addr in advertised
        )

    def _healthy_service_peers(self) -> list[PeerRegistryEntry]:
        return [
            peer
            for peer in self.registry.list_peers(include_stale=False)
            if peer.health_status == "healthy" and peer.service_ids
        ]


def _append_p2p_suffix(addr: str, peer_id: str) -> str:
    if "/p2p/" in addr:
        return addr
    return f"{addr}/p2p/{peer_id}"


def _with_path_suffix(path: Path, suffix: str) -> Path:
    if path.suffix:
        return path.with_name(f"{path.stem}-{suffix}{path.suffix}")
    return path.with_name(f"{path.name}-{suffix}")


def build_discovery_service(
    settings: Libp2pSettings,
    libp2p_runtime: Libp2pRuntime,
    mongo_runtime: MongoRuntime | None,
    session_factory: object | None = None,
    enforce_enrollment: bool = False,
) -> DiscoveryService:
    """Factory: construct a ``DiscoveryService`` from its dependencies."""
    return DiscoveryService(
        settings=settings,
        libp2p_runtime=libp2p_runtime,
        mongo_runtime=mongo_runtime,
        session_factory=session_factory,
        enforce_enrollment=enforce_enrollment,
    )
