from __future__ import annotations

from datetime import timedelta
from pathlib import Path

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.infra.persistence import SQLiteServiceRegistryStore
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.registry import ServiceRegistry


def test_sqlite_store_round_trip(tmp_path: Path) -> None:
    db_path = tmp_path / "registry.db"
    store = SQLiteServiceRegistryStore(str(db_path))

    advertisement = ServiceAdvertisement(
        node_id="node-1",
        service_type=GateType.CNOT,
        fidelity=0.98,
        qubit_min=1,
        qubit_max=2,
        availability=True,
    )

    store.save(advertisement)
    loaded = store.load_all()

    assert len(loaded) == 1
    assert loaded[0] == advertisement


def test_registry_loads_from_sqlite_snapshot(tmp_path: Path) -> None:
    db_path = tmp_path / "registry.db"
    store = SQLiteServiceRegistryStore(str(db_path))
    store.save(
        ServiceAdvertisement(
            node_id="node-2",
            service_type=GateType.CZ,
            fidelity=0.91,
            qubit_min=1,
            qubit_max=2,
            availability=True,
        )
    )

    registry = ServiceRegistry(stale_after=timedelta(seconds=60), store=store)

    available = registry.query(service_type=GateType.CZ, available_only=True)
    assert len(available) == 1
    assert available[0].node_id == "node-2"
