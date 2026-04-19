from __future__ import annotations

from fastapi.testclient import TestClient

from quantum_backend_v2.bootstrap import create_application


def test_health_endpoint_returns_ok(tmp_path) -> None:
    app = create_application(
        env={
            "QB2_ENVIRONMENT": "test",
            "QB2_SERVICE_NAME": "quantum-backend-v2-test",
            "QB2_JSON_LOGS": "false",
            "QB2_PEER_LOG_DIR": str(tmp_path / "peer-logs"),
            "QB2_PEER_ID": "test-peer",
            "QB2_LIBP2P_PEERSTORE_PATH": str(tmp_path / "libp2p" / "peerstore.sqlite3"),
            "QB2_LIBP2P_ACTIVATE_LISTENERS": "false",
        }
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "quantum-backend-v2-test"
    assert payload["environment"] == "test"
    assert payload["version"] == "0.1.0"
    assert payload["uptime_seconds"] >= 0.0
    assert payload["persistence"]["postgres"]["mode"] == "not_configured"
    assert payload["persistence"]["postgres"]["backend"] == "postgresql"
    assert payload["persistence"]["postgres"]["target"] == "local"
    assert payload["persistence"]["postgres"]["reachable"] is False
    assert payload["persistence"]["mongodb"]["mode"] == "not_configured"
    assert payload["persistence"]["mongodb"]["backend"] == "mongodb"
    assert payload["persistence"]["mongodb"]["target"] == "local"
    assert payload["persistence"]["mongodb"]["reachable"] is False
    assert payload["persistence"]["peer_log"]["mode"] == "ready"
    assert payload["persistence"]["peer_log"]["peer_id"] == "test-peer"
    assert payload["persistence"]["peer_log"]["event_count"] == 0


def test_ready_and_libp2p_bootstrap_endpoints_are_developer_friendly(tmp_path) -> None:
    app = create_application(
        env={
            "QB2_ENVIRONMENT": "test",
            "QB2_SERVICE_NAME": "quantum-backend-v2-test",
            "QB2_JSON_LOGS": "false",
            "QB2_PEER_LOG_DIR": str(tmp_path / "peer-logs"),
            "QB2_PEER_ID": "test-peer",
            "QB2_LIBP2P_PEER_ID": "libp2p-test-peer",
            "QB2_LIBP2P_RENDEZVOUS_NAMESPACE": "qb2-test-net",
            "QB2_LIBP2P_LISTEN_MULTIADDRS": "/ip4/127.0.0.1/tcp/4011",
            "QB2_LIBP2P_PEERSTORE_PATH": str(tmp_path / "libp2p" / "peerstore.sqlite3"),
            "QB2_LIBP2P_ACTIVATE_LISTENERS": "false",
        }
    )

    with TestClient(app) as client:
        ready_response = client.get("/api/v1/ready")
        bootstrap_response = client.get("/api/v1/bootstrap/libp2p")
        runtime_response = client.get("/api/v1/bootstrap/libp2p/runtime")

    assert ready_response.status_code == 200
    ready_payload = ready_response.json()
    assert ready_payload["status"] == "ready"
    assert ready_payload["persistence"]["postgres"]["mode"] == "not_configured"
    assert ready_payload["persistence"]["mongodb"]["mode"] == "not_configured"
    assert ready_payload["persistence"]["peer_log"]["mode"] == "ready"

    assert bootstrap_response.status_code == 200
    bootstrap_payload = bootstrap_response.json()
    assert bootstrap_payload["peer_id"] == "libp2p-test-peer"
    assert bootstrap_payload["rendezvous_namespace"] == "qb2-test-net"
    assert bootstrap_payload["listen_multiaddrs"] == ["/ip4/127.0.0.1/tcp/4011"]
    assert bootstrap_payload["advertisement_protocol"]["topic"] == "qb2-test-net.peer-advertisement.v1"
    assert bootstrap_payload["heartbeat_protocol"]["topic"] == "qb2-test-net.peer-heartbeat.v1"

    assert runtime_response.status_code == 200
    runtime_payload = runtime_response.json()
    assert runtime_payload["driver"] == "py-libp2p"
    assert runtime_payload["using_real_py_libp2p"] is True
    assert runtime_payload["host_type"] == "BasicHost"
    assert runtime_payload["peerstore_backend"] == "SyncPersistentPeerStore"
    assert runtime_payload["requested_peer_label"] == "libp2p-test-peer"
    assert runtime_payload["listeners_active"] is False
    assert runtime_payload["configured_listen_multiaddrs"] == ["/ip4/127.0.0.1/tcp/4011"]
    assert runtime_payload["advertised_multiaddrs"] == []
    assert runtime_payload["rendezvous_namespace"] == "qb2-test-net"
