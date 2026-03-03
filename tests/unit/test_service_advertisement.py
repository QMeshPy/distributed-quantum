from __future__ import annotations

import pytest
from pydantic import ValidationError

from quantum_coordinator.domain.models import GateType
from quantum_coordinator.service_discovery.advertisement import (
    SUPPORTED_PROTOCOL_VERSION,
    ServiceAdvertisement,
)


def test_service_advertisement_round_trip_wire_serialization() -> None:
    advertisement = ServiceAdvertisement(
        node_id="peer-1",
        service_type=GateType.CNOT,
        fidelity=0.97,
        qubit_min=1,
        qubit_max=3,
        availability=True,
    )

    parsed = ServiceAdvertisement.from_wire_bytes(advertisement.to_wire_bytes())

    assert parsed == advertisement


def test_service_advertisement_rejects_invalid_fidelity() -> None:
    with pytest.raises(ValidationError):
        ServiceAdvertisement(
            node_id="peer-1",
            service_type=GateType.CZ,
            fidelity=1.1,
            qubit_min=1,
            qubit_max=2,
            availability=True,
        )


def test_service_advertisement_rejects_inverted_qubit_range() -> None:
    with pytest.raises(ValidationError):
        ServiceAdvertisement(
            node_id="peer-1",
            service_type=GateType.BELL_PAIR,
            fidelity=0.9,
            qubit_min=3,
            qubit_max=1,
            availability=True,
        )


def test_service_advertisement_rejects_unsupported_version() -> None:
    with pytest.raises(ValidationError):
        ServiceAdvertisement(
            protocol_version="2.0",
            node_id="peer-1",
            service_type=GateType.CNOT,
            fidelity=0.95,
            qubit_min=1,
            qubit_max=2,
            availability=True,
        )


def test_supported_protocol_version_constant() -> None:
    assert SUPPORTED_PROTOCOL_VERSION == "1.0"
