"""Trio-based libp2p transport thread with pubsub and RPC support.

`LibP2pNetworkThread` bridges the trio world (py-libp2p) with the asyncio
world (FastAPI). Discovery events received over GossipSub are placed onto a
thread-safe queue, while request/response RPC uses libp2p streams opened
through the same background host.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from contextlib import suppress
import logging
import queue
import threading
import time
from datetime import datetime, timezone
from typing import Any

import trio
from libp2p.peer.id import ID
from libp2p.peer.peerinfo import info_from_p2p_addr
from libp2p.peer.peerstore import create_signed_peer_record
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

_STOP_POLL_INTERVAL = 0.5
_BOOTSTRAP_CONNECT_RETRIES = 20
_BOOTSTRAP_CONNECT_RETRY_DELAY_SECONDS = 0.5
_ADVERTISEMENT_REFRESH_EVERY_HEARTBEATS = 5
_READY_WAIT_SECONDS = 15.0
_STREAM_READ_MAX_BYTES = 2**32 - 1

RpcHandler = Callable[[bytes], Awaitable[bytes]]


class LibP2pNetworkThread:
    """Runs the py-libp2p host, pubsub, and RPC handlers in a trio thread."""

    def __init__(
        self,
        settings: Libp2pSettings,
        runtime: Libp2pRuntime,
        event_queue: queue.SimpleQueue[DiscoveryEvent] | None,
        service_ids: tuple[str, ...] | None = None,
        request_handlers: Mapping[str, RpcHandler] | None = None,
        heartbeat_provider: Callable[[], tuple[int, int]] | None = None,
        consume_discovery: bool = True,
    ) -> None:
        self._settings = settings
        self._runtime = runtime
        self._event_queue = event_queue
        self._service_ids = service_ids if service_ids is not None else KNOWN_SERVICE_IDS
        self._request_handlers = dict(request_handlers or {})
        self._heartbeat_provider = heartbeat_provider
        self._consume_discovery = consume_discovery
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._ready_event = threading.Event()
        self._trio_token: object | None = None

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    def start(self) -> None:
        """Start the trio daemon thread. No-op if libp2p is disabled."""
        if not self._settings.enabled:
            logger.info("libp2p disabled in settings - network thread not started")
            return
        self._stop_event.clear()
        self._ready_event.clear()
        self._thread = threading.Thread(
            target=trio.run,
            args=(self._trio_main,),
            daemon=True,
            name=f"libp2p-network-{self._settings.peer_id}",
        )
        self._thread.start()

        deadline = time.monotonic() + _READY_WAIT_SECONDS
        while time.monotonic() < deadline:
            if self._ready_event.wait(timeout=0.1):
                logger.info(
                    "libp2p network thread started (peer_id=%s)",
                    self._settings.peer_id,
                )
                return
            if self._thread is not None and not self._thread.is_alive():
                break

        raise RuntimeError("libp2p network thread did not become ready in time")

    def stop(self, timeout: float = 10.0) -> None:
        """Signal the trio thread to stop and wait for it to exit."""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)
            if self._thread.is_alive():
                logger.warning("libp2p network thread did not stop within %.1fs", timeout)
            else:
                logger.info("libp2p network thread stopped")
        self._ready_event.clear()
        self._trio_token = None

    def request_bytes(
        self,
        *,
        peer_id: str,
        protocol_id: str,
        payload: bytes,
        peer_addresses: tuple[str, ...] = (),
        timeout_seconds: float = 15.0,
    ) -> bytes:
        """Send a request over a libp2p stream from outside the trio thread."""
        if not self._settings.enabled:
            raise RuntimeError("libp2p is disabled")
        if self._trio_token is None or not self._ready_event.is_set():
            raise RuntimeError("libp2p network thread is not ready")
        return trio.from_thread.run(
            self._request_bytes,
            peer_id,
            protocol_id,
            payload,
            peer_addresses,
            timeout_seconds,
            trio_token=self._trio_token,
        )

    async def _trio_main(self) -> None:
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
                self._trio_token = trio.lowlevel.current_trio_token()
                self._register_request_handlers(host)
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

                        advertisement_subscription = None
                        heartbeat_subscription = None
                        if self._consume_discovery:
                            advertisement_subscription = await pubsub.subscribe(
                                settings.advertisement_topic
                            )
                            heartbeat_subscription = await pubsub.subscribe(
                                settings.heartbeat_topic
                            )

                        await self._publish_advertisement(pubsub)
                        self._ready_event.set()

                        async with trio.open_nursery() as nursery:
                            if (
                                advertisement_subscription is not None
                                and heartbeat_subscription is not None
                            ):
                                nursery.start_soon(
                                    self._receive_loop,
                                    advertisement_subscription,
                                    DiscoveryEventKind.ADVERTISEMENT,
                                )
                                nursery.start_soon(
                                    self._receive_loop,
                                    heartbeat_subscription,
                                    DiscoveryEventKind.HEARTBEAT,
                                )
                            nursery.start_soon(self._heartbeat_loop, pubsub)
                            nursery.start_soon(self._watch_stop, nursery)
        except Exception:
            logger.exception("libp2p network thread encountered an unhandled exception")
        finally:
            self._ready_event.clear()
            self._trio_token = None

    async def _watch_stop(self, nursery: trio.Nursery) -> None:
        while not self._stop_event.is_set():
            await trio.sleep(_STOP_POLL_INTERVAL)
        logger.debug("stop event detected - cancelling libp2p nursery")
        nursery.cancel_scope.cancel()

    async def _receive_loop(
        self,
        subscription: object,
        kind: DiscoveryEventKind,
    ) -> None:
        while True:
            message = await subscription.get()  # type: ignore[attr-defined]
            if self._event_queue is None:
                continue
            self._event_queue.put_nowait(
                DiscoveryEvent(
                    kind=kind,
                    raw_payload=message.data,
                    received_at=datetime.now(timezone.utc),
                )
            )

    async def _heartbeat_loop(self, pubsub: object) -> None:
        host = self._runtime.host
        settings = self._settings
        heartbeat_count = 0

        while True:
            active_reservations = 0
            active_executions = 0
            if self._heartbeat_provider is not None:
                try:
                    active_reservations, active_executions = self._heartbeat_provider()
                except Exception:
                    logger.exception("failed to collect heartbeat workload snapshot")

            heartbeat = PeerHeartbeat(
                peer_id=str(host.get_id()),
                health_status="healthy",
                active_reservations=active_reservations,
                active_executions=active_executions,
                peer_log_position=0,
            )
            try:
                await pubsub.publish(  # type: ignore[attr-defined]
                    settings.heartbeat_topic,
                    heartbeat.model_dump_json().encode("utf-8"),
                )
                logger.debug("heartbeat published for peer %s", heartbeat.peer_id)
            except Exception:
                logger.exception("failed to publish heartbeat")

            heartbeat_count += 1
            if heartbeat_count % _ADVERTISEMENT_REFRESH_EVERY_HEARTBEATS == 0:
                await self._publish_advertisement(pubsub, reason="periodic")
            await trio.sleep(settings.heartbeat_interval_seconds)

    async def _publish_advertisement(
        self,
        pubsub: object,
        *,
        reason: str = "initial",
    ) -> None:
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
                advertisement.model_dump_json().encode("utf-8"),
            )
            logger.info(
                "%s advertisement published (peer_id=%s, addrs=%d)",
                reason,
                advertisement.peer_id,
                len(advertisement.network_addresses),
            )
        except Exception:
            logger.exception("failed to publish %s advertisement", reason)

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

    def _register_request_handlers(self, host: object) -> None:
        for protocol_id, handler in self._request_handlers.items():
            host.set_stream_handler(  # type: ignore[attr-defined]
                protocol_id,
                self._build_stream_handler(handler),
            )

    def _build_stream_handler(self, handler: RpcHandler) -> Callable[[Any], Awaitable[None]]:
        async def stream_handler(stream: Any) -> None:
            try:
                payload = await stream.read(_STREAM_READ_MAX_BYTES)
                if not payload:
                    return
                response = await handler(bytes(payload))
                await stream.write(response)
                with suppress(Exception):
                    await stream.close_write()
            except Exception:
                with suppress(Exception):
                    await stream.reset()
                raise
            finally:
                with suppress(Exception):
                    await stream.close()

        return stream_handler

    async def _request_bytes(
        self,
        peer_id: str,
        protocol_id: str,
        payload: bytes,
        peer_addresses: tuple[str, ...],
        timeout_seconds: float,
    ) -> bytes:
        host = self._runtime.host
        await self._ensure_connected(
            host=host,
            peer_id=peer_id,
            peer_addresses=peer_addresses,
        )
        stream = await host.new_stream(ID.from_string(peer_id), [protocol_id])
        try:
            with trio.fail_after(timeout_seconds):
                await stream.write(payload)
                with suppress(Exception):
                    await stream.close_write()
                response = await stream.read(_STREAM_READ_MAX_BYTES)
                return bytes(response)
        except trio.TooSlowError as exc:
            with suppress(Exception):
                await stream.reset()
            raise TimeoutError("libp2p stream request timed out") from exc
        finally:
            with suppress(Exception):
                await stream.close()

    async def _ensure_connected(
        self,
        *,
        host: object,
        peer_id: str,
        peer_addresses: tuple[str, ...],
    ) -> None:
        connected_peer_ids = {
            str(connected_peer_id)
            for connected_peer_id in host.get_connected_peers()  # type: ignore[attr-defined]
        }
        if peer_id in connected_peer_ids:
            return

        for raw_addr in peer_addresses:
            full_addr = raw_addr if "/p2p/" in raw_addr else f"{raw_addr}/p2p/{peer_id}"
            try:
                await host.connect(info_from_p2p_addr(Multiaddr(full_addr)))  # type: ignore[attr-defined]
                return
            except Exception:
                logger.debug("failed to connect to peer %s via %s", peer_id, full_addr)


def build_network_thread(
    settings: Libp2pSettings,
    runtime: Libp2pRuntime,
    event_queue: queue.SimpleQueue[DiscoveryEvent] | None,
    service_ids: tuple[str, ...] | None = None,
    request_handlers: Mapping[str, RpcHandler] | None = None,
    heartbeat_provider: Callable[[], tuple[int, int]] | None = None,
    consume_discovery: bool = True,
) -> LibP2pNetworkThread:
    """Factory that constructs a `LibP2pNetworkThread`."""
    return LibP2pNetworkThread(
        settings=settings,
        runtime=runtime,
        event_queue=event_queue,
        service_ids=service_ids,
        request_handlers=request_handlers,
        heartbeat_provider=heartbeat_provider,
        consume_discovery=consume_discovery,
    )
