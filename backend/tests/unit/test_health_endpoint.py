from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import OperationFailure, ServerSelectionTimeoutError

from quantum_backend_v2.api.models.circuits import CircuitSubmitRequest
from quantum_backend_v2.api.models.enrollment import EnrollPeerRequest
from quantum_backend_v2.api.models.reservations import ReserveRequest
from quantum_backend_v2.api.models.workflows import (
    BenchmarkSubmitRequest,
    SubmitWorkflowRequest,
)
from quantum_backend_v2.api.routers import system_router
from quantum_backend_v2.config import load_settings
from quantum_backend_v2.libp2p import create_real_libp2p_runtime
from quantum_backend_v2.persistence import PersistenceRuntime


@pytest.fixture
def mongo_client(monkeypatch):
    client = MagicMock()
    client.admin.command = AsyncMock(return_value={"ok": 1})
    client.close = AsyncMock()
    monkeypatch.setattr(
        "quantum_backend_v2.persistence.mongodb.AsyncMongoClient", Mock(return_value=client)
    )
    return client


@pytest.fixture
def app_env(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "quantum_backend_v2.config.loader._load_env_file",
        Mock(side_effect=AssertionError("unit tests must not read local .env files")),
    )
    return {
        "QB2_ENVIRONMENT": "test",
        "QB2_SERVICE_NAME": "quantum-backend-test",
        "QB2_JSON_LOGS": "false",
        "QB2_MONGODB_TARGET": "local",
        "QB2_MONGODB_LOCAL_URI": "mongodb://mongo.example:27017",
        "QB2_MONGODB_DATABASE": "health_tests",
        "QB2_PEER_LOG_DIR": str(tmp_path / "peer-logs"),
        "QB2_PEER_ID": "test-peer",
        "QB2_LIBP2P_PEER_ID": "libp2p-test-peer",
        "QB2_LIBP2P_RENDEZVOUS_NAMESPACE": "qb2-test-net",
        "QB2_LIBP2P_LISTEN_MULTIADDRS": "/ip4/127.0.0.1/tcp/4011",
        "QB2_LIBP2P_PEERSTORE_PATH": str(tmp_path / "libp2p" / "peerstore.sqlite3"),
        "QB2_LIBP2P_ACTIVATE_LISTENERS": "false",
    }


@pytest.fixture
def peer_runtime(app_env):
    runtime = create_real_libp2p_runtime(load_settings(env=app_env).libp2p)
    yield runtime
    runtime.peerstore.close()


@pytest.fixture
def client(app_env, mongo_client, peer_runtime):
    settings = load_settings(env=app_env)
    app = FastAPI()
    app.include_router(
        system_router(
            service_name=settings.service_name,
            environment=settings.environment,
            started_monotonic=time.monotonic(),
            version="0.1.0",
            persistence_runtime=PersistenceRuntime.from_settings(settings.persistence),
            libp2p_plan=peer_runtime.plan,
            libp2p_runtime=peer_runtime,
        )
    )
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint_returns_ok(client, mongo_client) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "quantum-backend-test"
    assert payload["environment"] == "test"
    assert payload["version"] == "0.1.0"
    assert payload["uptime_seconds"] >= 0.0
    assert set(payload["persistence"]) == {"mongodb", "peer_log"}
    assert payload["persistence"]["mongodb"]["mode"] == "configured"
    assert payload["persistence"]["mongodb"]["backend"] == "mongodb"
    assert payload["persistence"]["mongodb"]["target"] == "local"
    assert payload["persistence"]["mongodb"]["database"] == "health_tests"
    assert payload["persistence"]["mongodb"]["configured"] is True
    assert payload["persistence"]["mongodb"]["reachable"] is False
    assert payload["persistence"]["peer_log"]["mode"] == "ready"
    assert payload["persistence"]["peer_log"]["peer_id"] == "test-peer"
    assert payload["persistence"]["peer_log"]["event_count"] == 0
    mongo_client.admin.command.assert_not_called()


def test_ready_and_libp2p_bootstrap_endpoints_are_developer_friendly(client, mongo_client) -> None:
    ready_response = client.get("/api/v1/ready")
    bootstrap_response = client.get("/api/v1/bootstrap/libp2p")
    runtime_response = client.get("/api/v1/bootstrap/libp2p/runtime")

    assert ready_response.status_code == 200
    ready_payload = ready_response.json()
    assert ready_payload["status"] == "ready"
    assert set(ready_payload["persistence"]) == {"mongodb", "peer_log"}
    assert ready_payload["persistence"]["mongodb"]["mode"] == "ready"
    assert ready_payload["persistence"]["mongodb"]["configured"] is True
    assert ready_payload["persistence"]["mongodb"]["reachable"] is True
    assert ready_payload["persistence"]["mongodb"]["message"] is None
    assert ready_payload["persistence"]["peer_log"]["mode"] == "ready"
    mongo_client.admin.command.assert_awaited_once_with("ping")

    assert bootstrap_response.status_code == 200
    bootstrap_payload = bootstrap_response.json()
    assert bootstrap_payload["peer_id"] == "libp2p-test-peer"
    assert bootstrap_payload["rendezvous_namespace"] == "qb2-test-net"
    assert bootstrap_payload["listen_multiaddrs"] == ["/ip4/127.0.0.1/tcp/4011"]
    assert (
        bootstrap_payload["advertisement_protocol"]["topic"] == "qb2-test-net.peer-advertisement.v1"
    )
    assert bootstrap_payload["heartbeat_protocol"]["topic"] == "qb2-test-net.peer-heartbeat.v1"

    assert runtime_response.status_code == 200
    runtime_payload = runtime_response.json()
    assert runtime_payload["driver"] == "py-libp2p"
    assert runtime_payload["using_real_py_libp2p"] is True
    assert runtime_payload["host_type"] == "BasicHost"
    assert runtime_payload["peerstore_backend"] == "CompatibleSyncPersistentPeerStore"
    assert runtime_payload["requested_peer_label"] == "libp2p-test-peer"
    assert runtime_payload["listeners_active"] is False
    assert runtime_payload["configured_listen_multiaddrs"] == ["/ip4/127.0.0.1/tcp/4011"]
    assert runtime_payload["advertised_multiaddrs"] == ["/ip4/127.0.0.1/tcp/4011"]
    assert runtime_payload["rendezvous_namespace"] == "qb2-test-net"


@pytest.mark.parametrize(
    "failure",
    [ServerSelectionTimeoutError("mongo unavailable"), OperationFailure("authentication failed")],
)
def test_ready_returns_503_when_mongodb_is_unavailable(client, mongo_client, failure) -> None:
    mongo_client.admin.command.side_effect = failure

    response = client.get("/api/v1/ready")
    health_response = client.get("/api/v1/health")

    assert response.status_code == 503
    payload = response.json()
    assert payload["status"] == "degraded"
    assert payload["persistence"]["mongodb"]["mode"] == "unavailable"
    assert payload["persistence"]["mongodb"]["configured"] is True
    assert payload["persistence"]["mongodb"]["reachable"] is False
    assert payload["persistence"]["mongodb"]["message"] == f"{type(failure).__name__}: {failure}"
    assert payload["persistence"]["peer_log"]["mode"] == "ready"
    assert health_response.status_code == 200
    assert health_response.json()["status"] == "ok"
    assert health_response.json()["persistence"]["mongodb"]["mode"] == "configured"
    mongo_client.admin.command.assert_awaited_once_with("ping")


def test_root_redirects_to_docs_and_favicon_is_quiet(
    app_env, mongo_client, peer_runtime, monkeypatch
) -> None:
    from quantum_backend_v2.bootstrap import application

    monkeypatch.setattr(application, "create_libp2p_runtime", lambda _: peer_runtime)
    # These static routes do not need the app's database and network lifespan workers.
    client = TestClient(application.create_application(env=app_env))
    root = client.get("/", follow_redirects=False)
    favicon = client.get("/favicon.ico")
    client.close()

    assert root.status_code == 307
    assert root.headers["location"] == "/docs"
    assert favicon.status_code == 204


def test_request_models_publish_swagger_examples() -> None:
    assert "OPENQASM 2.0" in CircuitSubmitRequest.model_json_schema()["example"]["circuit"]
    assert EnrollPeerRequest.model_json_schema()["example"]["trust_tier"] == "user_contributed"
    assert (
        SubmitWorkflowRequest.model_json_schema()["example"]["workflow_type"] == "quantum_circuit"
    )
    assert (
        BenchmarkSubmitRequest.model_json_schema()["example"]["benchmark_family"]
        == "portfolio-optimization"
    )
    assert ReserveRequest.model_json_schema()["example"]["ttl_seconds"] == 120
