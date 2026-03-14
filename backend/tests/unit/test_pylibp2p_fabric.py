from __future__ import annotations

from dataclasses import dataclass, field

import anyio
import pytest

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.libp2p.fabric import PyLibp2pFabric, _EmbeddedService
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement


@pytest.fixture
def anyio_backend() -> str:
    return "trio"


@dataclass
class _FakePubSubAdapter:
    messages: list[tuple[str, bytes]] = field(default_factory=list)

    async def publish(self, topic: str, message: bytes) -> None:
        self.messages.append((topic, message))


@dataclass
class _FakeNode:
    pubsub_adapter: _FakePubSubAdapter


def _build_advertisement(service_type: GateType) -> ServiceAdvertisement:
    return ServiceAdvertisement(
        node_id="fake-node",
        listen_addrs=("/ip4/127.0.0.1/tcp/9200",),
        service_type=service_type,
        fidelity=0.99,
        qubit_min=1,
        qubit_max=32,
        availability=True,
    )


@pytest.mark.anyio
async def test_advertise_loop_rotates_one_capability_per_interval() -> None:
    pubsub = _FakePubSubAdapter()
    fabric = PyLibp2pFabric(
        coordinator_listen_addrs=("/ip4/127.0.0.1/tcp/9100",),
        embedded_service_count=1,
        embedded_ad_interval_seconds=0.01,
    )
    fabric._services = [
        _EmbeddedService(
            node=_FakeNode(pubsub_adapter=pubsub),  # type: ignore[arg-type]
            advertisements=(
                _build_advertisement(GateType.HADAMARD),
                _build_advertisement(GateType.CNOT),
                _build_advertisement(GateType.QFT),
            ),
        )
    ]

    with anyio.move_on_after(0.05):
        await fabric._trio_advertise_loop(0)

    published_service_types = [
        ServiceAdvertisement.from_wire_bytes(raw).service_type
        for _, raw in pubsub.messages
    ]
    assert published_service_types[:3] == [
        GateType.HADAMARD,
        GateType.CNOT,
        GateType.QFT,
    ]
    assert len(pubsub.messages) <= 5
