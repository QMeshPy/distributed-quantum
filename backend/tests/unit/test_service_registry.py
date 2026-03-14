from __future__ import annotations

from datetime import datetime, timedelta, timezone

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.registry import ServiceRegistry


def test_registry_query_filters_by_type_fidelity_and_availability() -> None:
    registry = ServiceRegistry(stale_after=timedelta(seconds=60))

    registry.upsert(
        ServiceAdvertisement(
            node_id="node-1",
            service_type=GateType.CNOT,
            fidelity=0.95,
            qubit_min=1,
            qubit_max=2,
            availability=True,
        )
    )
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-2",
            service_type=GateType.CNOT,
            fidelity=0.75,
            qubit_min=1,
            qubit_max=2,
            availability=True,
        )
    )
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-3",
            service_type=GateType.CZ,
            fidelity=0.99,
            qubit_min=1,
            qubit_max=2,
            availability=False,
        )
    )

    results = registry.query(service_type=GateType.CNOT, min_fidelity=0.9, available_only=True)

    assert [ad.node_id for ad in results] == ["node-1"]


def test_registry_prunes_stale_entries_to_unavailable() -> None:
    stale_after = timedelta(seconds=30)
    now = datetime.now(timezone.utc)

    registry = ServiceRegistry(stale_after=stale_after)
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-1",
            service_type=GateType.CNOT,
            fidelity=0.95,
            qubit_min=1,
            qubit_max=2,
            availability=True,
            updated_at=now - timedelta(minutes=5),
        )
    )

    updated = registry.prune_stale(now=now)

    assert len(updated) == 1
    assert updated[0].availability is False
    assert registry.query(service_type=GateType.CNOT, available_only=True) == []
