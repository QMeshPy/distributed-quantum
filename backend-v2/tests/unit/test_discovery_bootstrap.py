from __future__ import annotations

from quantum_backend_v2.bootstrap import create_libp2p_plan, create_libp2p_runtime
from quantum_backend_v2.config import Libp2pSettings
from quantum_backend_v2.discovery import PeerAdvertisement, PeerHeartbeat, ServiceAdvertisementSummary


def test_libp2p_plan_builds_expected_protocol_suite() -> None:
    plan = create_libp2p_plan(
        Libp2pSettings(
            enabled=True,
            peer_id="peer-zeta",
            listen_multiaddrs=("/ip4/0.0.0.0/tcp/4011",),
            bootstrap_peers=("/dns4/bootstrap/tcp/4011",),
            rendezvous_namespace="qb2-swarm",
        )
    )

    assert plan.peer_id == "peer-zeta"
    assert plan.advertisement_protocol.topic == "qb2-swarm.peer-advertisement.v1"
    assert plan.heartbeat_protocol.topic == "qb2-swarm.peer-heartbeat.v1"
    assert plan.peer_exchange_protocol.stream_id == "/qb2/qb2-swarm/peer-exchange/1.0.0"


def test_real_libp2p_runtime_uses_py_libp2p_host_and_peerstore(tmp_path) -> None:
    runtime = create_libp2p_runtime(
        Libp2pSettings(
            enabled=True,
            peer_id="peer-zeta",
            listen_multiaddrs=("/ip4/0.0.0.0/tcp/4011",),
            bootstrap_peers=("/dns4/bootstrap/tcp/4011",),
            rendezvous_namespace="qb2-swarm",
            peerstore_path=tmp_path / "libp2p" / "peerstore.sqlite3",
            activate_listeners=False,
        )
    )

    summary = runtime.summary()

    assert summary.driver == "py-libp2p"
    assert summary.using_real_py_libp2p is True
    assert summary.host_type == "BasicHost"
    assert summary.peerstore_backend == "SyncPersistentPeerStore"
    assert summary.requested_peer_label == "peer-zeta"
    assert summary.host_peer_id.startswith("12D3KooW")
    assert summary.listeners_active is False
    assert summary.configured_listen_multiaddrs == ("/ip4/0.0.0.0/tcp/4011",)
    assert summary.advertised_multiaddrs == ()
    assert summary.rendezvous_namespace == "qb2-swarm"


def test_discovery_payload_models_capture_peer_published_services() -> None:
    advertisement = PeerAdvertisement(
        peer_id="peer-zeta",
        trust_tier="verified",
        network_addresses=("/ip4/10.0.0.5/tcp/4011",),
        supported_protocols=("/qb2/qb2-swarm/peer-exchange/1.0.0",),
        service_summaries=(
            ServiceAdvertisementSummary(
                service_id="svc.quantum.portfolio",
                version="1.2.0",
                quantum_capability="finance.quantum_portfolio",
                benchmark_mode="quantum_vs_classical",
            ),
        ),
        peer_log_position=42,
    )
    heartbeat = PeerHeartbeat(
        peer_id="peer-zeta",
        health_status="healthy",
        active_reservations=2,
        active_executions=1,
        peer_log_position=42,
    )

    assert advertisement.service_summaries[0].service_id == "svc.quantum.portfolio"
    assert advertisement.peer_log_position == 42
    assert heartbeat.health_status == "healthy"
    assert heartbeat.active_executions == 1
