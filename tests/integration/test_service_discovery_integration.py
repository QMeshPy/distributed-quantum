from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import timedelta
from time import monotonic

import pytest

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.libp2p import InMemoryPubSubAdapter, InMemoryPubSubBus
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.discovery import ServiceDiscovery
from quantum_coordinator.service_discovery.registry import ServiceRegistry


async def _wait_for(condition: Callable[[], bool], timeout_seconds: float) -> None:
    deadline = monotonic() + timeout_seconds
    while monotonic() < deadline:
        if condition():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Condition did not become true before timeout")


@pytest.mark.anyio
async def test_three_nodes_exchange_service_advertisements() -> None:
    bus = InMemoryPubSubBus()
    registries: list[ServiceRegistry] = []
    discoveries: list[ServiceDiscovery] = []

    for peer_id in ("peer-1", "peer-2", "peer-3"):
        registry = ServiceRegistry(stale_after=timedelta(seconds=60))
        discovery = ServiceDiscovery(
            pubsub=InMemoryPubSubAdapter(peer_id=peer_id, bus=bus),
            registry=registry,
            refresh_interval=timedelta(milliseconds=20),
        )
        await discovery.start()
        registries.append(registry)
        discoveries.append(discovery)

    try:
        advertisements = [
            ServiceAdvertisement(
                node_id="peer-1",
                service_type=GateType.CNOT,
                fidelity=0.98,
                qubit_min=1,
                qubit_max=2,
                availability=True,
            ),
            ServiceAdvertisement(
                node_id="peer-2",
                service_type=GateType.CZ,
                fidelity=0.95,
                qubit_min=1,
                qubit_max=2,
                availability=True,
            ),
            ServiceAdvertisement(
                node_id="peer-3",
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
            timeout_seconds=2.0,
        )

        for registry in registries:
            assert len(registry.query(available_only=True)) == 3
            assert len(registry.query(service_type=GateType.CNOT)) == 1
            assert len(registry.query(service_type=GateType.CZ)) == 1
            assert len(registry.query(service_type=GateType.BELL_PAIR)) == 1
    finally:
        for discovery in discoveries:
            await discovery.stop()
