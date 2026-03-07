from __future__ import annotations

from collections.abc import Callable
from contextlib import AsyncExitStack
from datetime import timedelta
from time import monotonic

import anyio
import pytest

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.libp2p import build_libp2p_node, run_libp2p_services
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.discovery import ServiceDiscovery
from quantum_coordinator.service_discovery.registry import ServiceRegistry


@pytest.fixture
def anyio_backend() -> str:
    return "trio"


async def _wait_for(condition: Callable[[], bool], timeout_seconds: float) -> None:
    deadline = monotonic() + timeout_seconds
    while monotonic() < deadline:
        if condition():
            return
        await anyio.sleep(0.05)
    raise AssertionError("Condition did not become true before timeout")


def _listen_addrs(port: int) -> tuple[str, ...]:
    from libp2p.utils.address_validation import get_available_interfaces

    return tuple(str(addr) for addr in get_available_interfaces(port))


@pytest.mark.anyio
async def test_three_nodes_exchange_service_advertisements() -> None:
    from libp2p.utils.address_validation import find_free_port

    ports = [find_free_port() for _ in range(3)]
    nodes = [build_libp2p_node(listen_addrs=_listen_addrs(port)) for port in ports]
    registries: list[ServiceRegistry] = []
    discoveries: list[ServiceDiscovery] = []

    async with AsyncExitStack() as stack:
        for node in nodes:
            await stack.enter_async_context(run_libp2p_services(node.host, node.pubsub))

        await nodes[1].stream_adapter.connect_to_peer(nodes[0].listen_addrs()[0])
        await nodes[2].stream_adapter.connect_to_peer(nodes[0].listen_addrs()[0])
        await anyio.sleep(1.0)

        for node in nodes:
            registry = ServiceRegistry(stale_after=timedelta(seconds=60))
            discovery = ServiceDiscovery(
                pubsub=node.pubsub_adapter,
                registry=registry,
                refresh_interval=timedelta(milliseconds=100),
            )
            await discovery.start()
            registries.append(registry)
            discoveries.append(discovery)

        try:
            await anyio.sleep(1.0)
            advertisements = [
                ServiceAdvertisement(
                    node_id=nodes[0].peer_id,
                    listen_addrs=nodes[0].listen_addrs(),
                    service_type=GateType.CNOT,
                    fidelity=0.98,
                    qubit_min=1,
                    qubit_max=2,
                    availability=True,
                ),
                ServiceAdvertisement(
                    node_id=nodes[1].peer_id,
                    listen_addrs=nodes[1].listen_addrs(),
                    service_type=GateType.CZ,
                    fidelity=0.95,
                    qubit_min=1,
                    qubit_max=2,
                    availability=True,
                ),
                ServiceAdvertisement(
                    node_id=nodes[2].peer_id,
                    listen_addrs=nodes[2].listen_addrs(),
                    service_type=GateType.BELL_PAIR,
                    fidelity=0.92,
                    qubit_min=1,
                    qubit_max=3,
                    availability=True,
                ),
            ]

            for discovery, advertisement in zip(discoveries, advertisements, strict=True):
                await discovery.advertise_service(advertisement)

            await _wait_for(
                condition=lambda: all(registry.count() == 3 for registry in registries),
                timeout_seconds=5.0,
            )

            for registry in registries:
                assert len(registry.query(available_only=True)) == 3
                assert len(registry.query(service_type=GateType.CNOT)) == 1
                assert len(registry.query(service_type=GateType.CZ)) == 1
                assert len(registry.query(service_type=GateType.BELL_PAIR)) == 1
        finally:
            for discovery in reversed(discoveries):
                await discovery.stop()
