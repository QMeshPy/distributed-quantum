"""Real py-libp2p network fabric for coordinator + embedded service nodes."""

from __future__ import annotations

import json
import threading
from collections.abc import Awaitable, Callable
from contextlib import AsyncExitStack
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import anyio
from anyio.from_thread import BlockingPortal, start_blocking_portal

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.libp2p.protocols import (
    GATE_EXEC_PROTOCOL_ID_DEFAULT,
    SERVICE_AD_TOPIC_DEFAULT,
)
from quantum_coordinator.infra.libp2p.pylibp2p import (
    PyLibp2pNode,
    build_libp2p_node,
    run_libp2p_services,
)
from quantum_coordinator.service_discovery.advertisement import (
    ServiceAdvertisement,
    validate_advertisement_payload,
)
from quantum_coordinator.service_discovery.registry import ServiceRegistry


@dataclass(frozen=True)
class _EmbeddedService:
    node: PyLibp2pNode
    advertisements: tuple[ServiceAdvertisement, ...]


class PyLibp2pFabric:
    """Manages a real libp2p topology and gate execution stream calls.

    The fabric runs on a dedicated Trio backend via ``BlockingPortal``.
    """

    def __init__(
        self,
        *,
        coordinator_listen_addrs: tuple[str, ...],
        topic: str = SERVICE_AD_TOPIC_DEFAULT,
        gate_protocol_id: str = GATE_EXEC_PROTOCOL_ID_DEFAULT,
        embedded_service_count: int = 3,
        embedded_service_base_port: int = 9200,
        embedded_ad_interval_seconds: float = 5.0,
        enable_mdns: bool = False,
        registry: ServiceRegistry | None = None,
    ) -> None:
        if embedded_service_count < 1:
            raise ValueError("embedded_service_count must be >= 1")

        self._coordinator_listen_addrs = coordinator_listen_addrs
        self._topic = topic
        self._gate_protocol_id = gate_protocol_id
        self._embedded_service_count = embedded_service_count
        self._embedded_service_base_port = embedded_service_base_port
        self._embedded_ad_interval_seconds = embedded_ad_interval_seconds
        self._enable_mdns = enable_mdns
        self._registry = registry

        self._portal_cm: Any | None = None
        self._portal: BlockingPortal | None = None
        self._trio_thread: threading.Thread | None = None
        self._stop_event: Any = None  # trio.Event, set in Trio thread
        self._bootstrap_error: BaseException | None = None  # set if _trio_main_loop fails
        self._coordinator: PyLibp2pNode | None = None
        self._services: list[_EmbeddedService] = []
        self._service_addrs: dict[str, tuple[str, ...]] = {}
        self._advertise_tasks: list[Any] = []  # trio tasks

    async def start(self) -> None:
        """Start Trio portal, coordinator node, and embedded service nodes."""
        await anyio.to_thread.run_sync(self._start_sync)

    async def stop(self) -> None:
        """Stop advertise tasks and close all libp2p services."""
        await anyio.to_thread.run_sync(self._stop_sync)

    def available_advertisements(self) -> list[ServiceAdvertisement]:
        """Return currently configured embedded service advertisements."""
        ads: list[ServiceAdvertisement] = []
        for service in self._services:
            ads.extend(service.advertisements)
        return ads

    async def next_advertisement(
        self,
        timeout_seconds: float | None = None,
    ) -> ServiceAdvertisement | None:
        """Read one advertisement observed by coordinator pubsub subscriber."""
        return await anyio.to_thread.run_sync(
            self._next_advertisement_sync,
            timeout_seconds,
        )

    async def invoke_gate(
        self,
        node_id: str,
        payload: bytes,
        timeout_seconds: float,
    ) -> bytes:
        """Invoke remote gate execution protocol on target node."""
        return await anyio.to_thread.run_sync(
            self._invoke_gate_sync,
            node_id,
            payload,
            timeout_seconds,
        )

    def _start_sync(self) -> None:
        if self._portal is not None:
            return

        ready_event = threading.Event()

        def run_trio_thread() -> None:
            self._bootstrap_error = None
            portal_cm = start_blocking_portal(backend="trio")
            portal = portal_cm.__enter__()
            self._portal_cm = portal_cm
            self._portal = portal
            try:
                portal.call(self._trio_main_loop, ready_event)
            except BaseException as e:
                self._bootstrap_error = e
                ready_event.set()
            finally:
                try:
                    portal_cm.__exit__(None, None, None)
                except Exception:
                    pass
                self._portal_cm = None
                self._portal = None

        self._trio_thread = threading.Thread(target=run_trio_thread, daemon=True)
        self._trio_thread.start()
        if not ready_event.wait(timeout=60.0):
            self._portal_cm = None
            self._portal = None
            self._trio_thread = None
            raise RuntimeError("libp2p fabric failed to become ready within 60s")
        if self._bootstrap_error is not None:
            raise RuntimeError(
                "libp2p fabric bootstrap failed"
            ) from self._bootstrap_error

    def _stop_sync(self) -> None:
        portal = self._portal
        if portal is None:
            return

        portal.call(self._trio_set_stop_and_cancel_tasks)
        thread = self._trio_thread
        if thread is not None:
            thread.join(timeout=10.0)
        self._trio_thread = None

        if self._portal_cm is not None:
            try:
                self._portal_cm.__exit__(None, None, None)
            except Exception:
                pass
            self._portal_cm = None
        self._portal = None
        self._stop_event = None
        self._coordinator = None
        self._services = []
        self._service_addrs = {}
        self._advertise_tasks = []

    async def _trio_main_loop(self, ready_event: threading.Event) -> None:
        import trio

        self._stop_event = trio.Event()
        stack = AsyncExitStack()
        await stack.__aenter__()
        try:
            coordinator = build_libp2p_node(
                listen_addrs=self._coordinator_listen_addrs,
                enable_mdns=self._enable_mdns,
            )
            await stack.enter_async_context(
                run_libp2p_services(coordinator.host, coordinator.pubsub)
            )
            await coordinator.pubsub_adapter.subscribe(self._topic)

            coordinator_addrs = coordinator.listen_addrs()
            if not coordinator_addrs:
                raise RuntimeError("coordinator has no listen addresses")

            services: list[_EmbeddedService] = []
            service_addrs: dict[str, tuple[str, ...]] = {}
            for idx in range(self._embedded_service_count):
                service_node = build_libp2p_node(
                    listen_addrs=_embedded_listen_addrs(
                        self._embedded_service_base_port + idx
                    ),
                    enable_mdns=self._enable_mdns,
                )
                await stack.enter_async_context(
                    run_libp2p_services(service_node.host, service_node.pubsub)
                )
                await _connect_with_retry(
                    connect_fn=service_node.stream_adapter.connect_to_peer,
                    target_addrs=coordinator_addrs,
                )

                resolved_service_addrs = service_node.listen_addrs()
                if not resolved_service_addrs:
                    raise RuntimeError(
                        f"service node {service_node.peer_id} has no listen addresses"
                    )

                advertisements = self._build_service_advertisements(service_node, idx)
                service_addrs[service_node.peer_id] = resolved_service_addrs
                service_node.stream_adapter.set_request_handler(
                    self._gate_protocol_id,
                    self._build_gate_handler(advertisements),
                )
                services.append(
                    _EmbeddedService(
                        node=service_node,
                        advertisements=advertisements,
                    )
                )

            self._coordinator = coordinator
            self._services = services
            self._service_addrs = service_addrs
            # Embedded services are local to this coordinator, so seed the
            # registry directly instead of blasting a startup pubsub burst.
            self._seed_registry_with_embedded_services(services)

            async with trio.open_nursery() as nursery:
                for idx in range(len(services)):
                    nursery.start_soon(self._trio_advertise_loop, idx)
                ready_event.set()
                await self._stop_event.wait()
                nursery.cancel_scope.cancel()
        finally:
            await stack.aclose()
            self._coordinator = None
            self._services = []
            self._service_addrs = {}

    async def _trio_set_stop_and_cancel_tasks(self) -> None:
        if self._stop_event is not None:
            self._stop_event.set()

    async def _trio_advertise_loop(self, service_index: int) -> None:
        import trio

        service = self._services[service_index]
        advertisement_count = len(service.advertisements)
        if advertisement_count == 0:
            await trio.sleep_forever()

        stagger_seconds = (
            self._embedded_ad_interval_seconds / max(len(self._services), 1)
        ) * service_index
        await trio.sleep(self._embedded_ad_interval_seconds + stagger_seconds)

        next_advertisement_index = service_index % advertisement_count
        while True:
            # Refresh one capability at a time to avoid pubsub rate-limit bursts.
            advertisement = service.advertisements[next_advertisement_index]
            await self._publish_service_advertisements(service, (advertisement,))
            next_advertisement_index = (
                next_advertisement_index + 1
            ) % advertisement_count
            await trio.sleep(self._embedded_ad_interval_seconds)

    def _seed_registry_with_embedded_services(
        self,
        services: list[_EmbeddedService],
    ) -> None:
        if self._registry is None:
            return

        now = datetime.now(timezone.utc)
        for service in services:
            for advertisement in service.advertisements:
                self._registry.upsert(
                    advertisement.model_copy(update={"updated_at": now}),
                )

    async def _publish_service_advertisements(
        self,
        service: _EmbeddedService,
        advertisements: tuple[ServiceAdvertisement, ...] | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        ads_to_publish = advertisements or service.advertisements
        for advertisement in ads_to_publish:
            refreshed = advertisement.model_copy(update={"updated_at": now})
            await service.node.pubsub_adapter.publish(
                self._topic,
                refreshed.to_wire_bytes(),
            )

    def _next_advertisement_sync(
        self,
        timeout_seconds: float | None,
    ) -> ServiceAdvertisement | None:
        portal = self._portal
        if portal is None:
            return None
        return portal.call(self._trio_next_advertisement, timeout_seconds)

    async def _trio_next_advertisement(
        self,
        timeout_seconds: float | None,
    ) -> ServiceAdvertisement | None:
        coordinator = self._coordinator
        if coordinator is None:
            return None

        message = await coordinator.pubsub_adapter.next_message(
            self._topic,
            timeout_seconds=timeout_seconds,
        )
        if message is None:
            return None
        advertisement, _ = validate_advertisement_payload(message.payload)
        return advertisement

    def _invoke_gate_sync(
        self,
        node_id: str,
        payload: bytes,
        timeout_seconds: float,
    ) -> bytes:
        portal = self._portal
        if portal is None:
            raise RuntimeError("py-libp2p fabric is not started")
        return portal.call(self._trio_invoke_gate, node_id, payload, timeout_seconds)

    async def _trio_invoke_gate(
        self,
        node_id: str,
        payload: bytes,
        timeout_seconds: float,
    ) -> bytes:
        coordinator = self._coordinator
        if coordinator is None:
            raise RuntimeError("coordinator node unavailable")

        await self._ensure_service_connection(coordinator, node_id)
        try:
            return await coordinator.stream_adapter.request(
                node_id,
                self._gate_protocol_id,
                payload,
                timeout_seconds=timeout_seconds,
            )
        except Exception:
            await self._ensure_service_connection(coordinator, node_id, reconnect=True)
            return await coordinator.stream_adapter.request(
                node_id,
                self._gate_protocol_id,
                payload,
                timeout_seconds=timeout_seconds,
            )

    async def _ensure_service_connection(
        self,
        coordinator: PyLibp2pNode,
        node_id: str,
        reconnect: bool = False,
    ) -> None:
        connected_peers = {str(peer_id) for peer_id in coordinator.host.get_connected_peers()}
        if node_id in connected_peers and not reconnect:
            return

        target_addrs = self._service_addrs.get(node_id)
        if not target_addrs and self._registry is not None:
            for entry in self._registry.all_entries():
                if entry.advertisement.node_id == node_id and entry.advertisement.listen_addrs:
                    target_addrs = tuple(entry.advertisement.listen_addrs)
                    break
        if not target_addrs:
            raise RuntimeError(f"No listen addresses known for peer {node_id}")

        await _connect_with_retry(
            connect_fn=coordinator.stream_adapter.connect_to_peer,
            target_addrs=target_addrs,
        )

    def _build_service_advertisements(
        self,
        node: PyLibp2pNode,
        index: int,
    ) -> tuple[ServiceAdvertisement, ...]:
        fidelity = max(0.80, 0.97 - (index * 0.01))
        updated_at = datetime.now(timezone.utc)
        return tuple(
            ServiceAdvertisement(
                node_id=node.peer_id,
                listen_addrs=node.listen_addrs(),
                service_type=gate_type,
                fidelity=fidelity,
                qubit_min=1,
                qubit_max=32,
                availability=True,
                updated_at=updated_at,
            )
            for gate_type in GateType
        )

    def _build_gate_handler(
        self,
        advertisements: tuple[ServiceAdvertisement, ...],
    ) -> Callable[[bytes], Awaitable[bytes]]:
        supported = {ad.service_type: ad for ad in advertisements}

        async def handler(raw: bytes) -> bytes:
            try:
                payload = json.loads(raw.decode("utf-8"))
                service_type = GateType(str(payload.get("service_type")))
            except Exception:
                return _encode_gate_response(
                    success=False,
                    observed_fidelity=0.0,
                    error="invalid_request",
                )

            ad = supported.get(service_type)
            if ad is None or not ad.availability:
                return _encode_gate_response(
                    success=False,
                    observed_fidelity=0.0,
                    error="unsupported_service",
                )

            min_fidelity = float(payload.get("min_fidelity", 0.0))
            if ad.fidelity < min_fidelity:
                return _encode_gate_response(
                    success=False,
                    observed_fidelity=ad.fidelity,
                    error="fidelity_below_threshold",
                )

            return _encode_gate_response(
                success=True,
                observed_fidelity=ad.fidelity,
                error=None,
            )

        return handler


def _encode_gate_response(
    *,
    success: bool,
    observed_fidelity: float,
    error: str | None,
) -> bytes:
    payload = {
        "success": success,
        "observed_fidelity": observed_fidelity,
        "error": error,
    }
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


async def _connect_with_retry(
    connect_fn: Callable[[str], Awaitable[None]],
    target_addrs: tuple[str, ...],
    attempts: int = 20,
    delay_seconds: float = 0.1,
) -> None:
    import trio

    if not target_addrs:
        raise RuntimeError("No target addresses available for libp2p connection")

    last_error: Exception | None = None
    for _ in range(attempts):
        for target_addr in target_addrs:
            try:
                await connect_fn(target_addr)
                return
            except Exception as exc:
                last_error = exc
        await trio.sleep(delay_seconds)

    if last_error is None:
        raise RuntimeError(f"Unable to connect to any address in {target_addrs!r}")
    raise RuntimeError(f"Unable to connect to {target_addrs!r}: {last_error}") from last_error


def _embedded_listen_addrs(port: int) -> tuple[str, ...]:
    from libp2p.utils.address_validation import get_available_interfaces

    addrs = get_available_interfaces(port)
    # Prefer single ip4 loopback for predictable local testing
    for addr in addrs:
        if "/ip4/127.0.0.1/" in str(addr):
            return (str(addr),)
    return tuple(str(addr) for addr in addrs)
