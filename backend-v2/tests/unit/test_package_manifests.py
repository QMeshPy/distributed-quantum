from __future__ import annotations

import pytest

from quantum_backend_v2.packages import (
    BenchmarkMode,
    PackageIntegrity,
    PeerPublishedQuantumServiceManifest,
    RuntimeClass,
    ServiceInterfaceSchema,
    ServiceVisibility,
)
from quantum_backend_v2.protocols import ProtocolDescriptor, ProtocolVersion


def test_protocol_descriptor_requires_stream_or_topic() -> None:
    with pytest.raises(ValueError, match="stream_id or topic"):
        ProtocolDescriptor(
            name="reservation",
            version=ProtocolVersion(major=1, minor=0, patch=0),
        )


def test_service_manifest_accepts_quantum_vs_classical_package() -> None:
    manifest = PeerPublishedQuantumServiceManifest(
        service_id="svc.quantum.dcf",
        version="1.0.0",
        title="Quantum DCF Comparator",
        summary="Runs a quantum-assisted discounted cashflow workflow with a classical baseline.",
        publisher_peer_id="peer-123",
        publisher_account_id="acct-123",
        runtime_class=RuntimeClass.WASM,
        protocol=ProtocolDescriptor(
            name="fragment-execution",
            version=ProtocolVersion(major=1, minor=0, patch=0),
            stream_id="/qb2/fragment-execution/1.0.0",
        ),
        quantum_capability="financial.quantum_dcf",
        classical_baseline_capability="financial.classical_dcf",
        entrypoint="dist/main.wasm",
        tags=("Finance", "Quantum", "DCF"),
        input_schema=ServiceInterfaceSchema(name="DCFInput", json_schema={"type": "object"}),
        output_schema=ServiceInterfaceSchema(name="DCFOutput", json_schema={"type": "object"}),
        benchmark={
            "mode": BenchmarkMode.QUANTUM_VS_CLASSICAL,
            "benchmark_family": "financial-modelling",
        },
        integrity=PackageIntegrity(
            algorithm="sha256",
            digest="a" * 64,
            manifest_signature="sig-" + ("b" * 32),
        ),
        visibility=ServiceVisibility.NETWORK_PUBLIC,
        supported_architectures=("x86_64", "arm64"),
    )

    assert manifest.tags == ("finance", "quantum", "dcf")
    assert manifest.supported_architectures == ("x86_64", "arm64")


def test_service_manifest_requires_classical_baseline_for_comparison() -> None:
    with pytest.raises(ValueError, match="classical_baseline_capability"):
        PeerPublishedQuantumServiceManifest(
            service_id="svc.quantum.risk",
            version="1.0.0",
            title="Quantum Risk Engine",
            summary="Benchmarks a quantum risk heuristic against a missing classical baseline.",
            publisher_peer_id="peer-999",
            runtime_class=RuntimeClass.CONTAINER,
            protocol=ProtocolDescriptor(
                name="fragment-execution",
                version=ProtocolVersion(major=1, minor=0, patch=0),
                stream_id="/qb2/fragment-execution/1.0.0",
            ),
            quantum_capability="financial.quantum_risk",
            entrypoint="docker://risk:latest",
            tags=("risk",),
            input_schema=ServiceInterfaceSchema(name="RiskInput", json_schema={"type": "object"}),
            output_schema=ServiceInterfaceSchema(name="RiskOutput", json_schema={"type": "object"}),
            benchmark={
                "mode": BenchmarkMode.QUANTUM_VS_CLASSICAL,
                "benchmark_family": "financial-modelling",
            },
            integrity=PackageIntegrity(
                algorithm="sha256",
                digest="c" * 64,
                manifest_signature="sig-" + ("d" * 32),
            ),
        )
