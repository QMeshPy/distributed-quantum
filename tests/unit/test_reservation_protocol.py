from __future__ import annotations

from datetime import datetime, timedelta, timezone

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.reservation.models import ReservationState
from quantum_coordinator.reservation.protocol import ReservationProtocol
from quantum_coordinator.service_discovery.advertisement import ServiceAdvertisement
from quantum_coordinator.service_discovery.registry import ServiceRegistry


def _registry() -> ServiceRegistry:
    registry = ServiceRegistry(stale_after=timedelta(seconds=60))
    registry.upsert(
        ServiceAdvertisement(
            node_id="node-1",
            service_type=GateType.CNOT,
            fidelity=0.95,
            qubit_min=1,
            qubit_max=3,
            availability=True,
        )
    )
    return registry


def test_reservation_accepts_when_node_available() -> None:
    protocol = ReservationProtocol(registry=_registry(), default_window=timedelta(seconds=1))

    request = protocol.make_request(
        job_id="job-1",
        fragment_id="frag-1",
        node_id="node-1",
        service_type=GateType.CNOT.value,
        min_fidelity=0.9,
    )
    response = protocol.reserve(request)

    assert response.accepted is True
    assert response.state == ReservationState.COMMITTED
    assert response.reservation_id is not None


def test_reservation_rejects_on_conflict_and_suggests_window() -> None:
    protocol = ReservationProtocol(registry=_registry(), default_window=timedelta(seconds=30))

    now = datetime.now(timezone.utc)
    request_1 = protocol.make_request(
        job_id="job-1",
        fragment_id="frag-1",
        node_id="node-1",
        service_type=GateType.CNOT.value,
        min_fidelity=0.9,
        now=now,
    )
    response_1 = protocol.reserve(request_1)
    assert response_1.accepted is True

    request_2 = protocol.make_request(
        job_id="job-2",
        fragment_id="frag-2",
        node_id="node-1",
        service_type=GateType.CNOT.value,
        min_fidelity=0.9,
        now=now + timedelta(seconds=5),
    )
    response_2 = protocol.reserve(request_2)

    assert response_2.accepted is False
    assert response_2.state == ReservationState.REJECTED
    assert response_2.suggested_window_start is not None
