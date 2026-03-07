from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from time import monotonic, sleep

from fastapi.testclient import TestClient

from quantum_coordinator.api.app import create_app
from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence import SQLiteJobStore
from quantum_coordinator.infra.persistence.job_store import JobRecord
from tests.support.real_libp2p import make_real_libp2p_config

CIRCUIT_TEXT = """
OPENQASM 2.0;
qreg q[2];
cx q[0], q[1];
"""


def _wait_for_job_terminal(client: TestClient, job_id: str, timeout_seconds: float = 5.0) -> dict:
    deadline = monotonic() + timeout_seconds
    while monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in {"COMPLETED", "FAILED"}:
            return payload
        sleep(0.05)
    raise AssertionError(f"job {job_id} did not reach terminal state")


def _wait_for_services(
    client: TestClient,
    *,
    headers: dict[str, str] | None = None,
    timeout_seconds: float = 5.0,
) -> list[dict[str, object]]:
    deadline = monotonic() + timeout_seconds
    request_headers = headers or {}
    while monotonic() < deadline:
        response = client.get("/api/v1/services", headers=request_headers)
        if response.status_code == 200:
            services = response.json()
            if services:
                return services
        sleep(0.05)
    raise AssertionError("services were not advertised before timeout")


def test_submit_and_poll_job_completion(tmp_path: Path) -> None:
    database_path = str(tmp_path / "submit.db")
    app = create_app(make_real_libp2p_config(database_path))

    with TestClient(app) as client:
        services = _wait_for_services(client)
        assert services

        submit_response = client.post(
            "/api/v1/circuits/submit",
            json={"circuit": CIRCUIT_TEXT},
        )
        assert submit_response.status_code == 200
        submit_payload = submit_response.json()
        assert submit_payload["status"] == "QUEUED"
        assert submit_payload["job_id"].startswith("job-")

        terminal = _wait_for_job_terminal(client, submit_payload["job_id"])
        assert terminal["status"] == "COMPLETED"
        assert terminal["result"] is not None
        assert len(terminal["result"]["fragment_results"]) == 1


def test_services_and_fidelity_metrics_endpoints(tmp_path: Path) -> None:
    database_path = str(tmp_path / "metrics.db")
    app = create_app(make_real_libp2p_config(database_path))

    with TestClient(app) as client:
        services = _wait_for_services(client)
        assert len(services) >= 1

        node_id = str(services[0]["node_id"])
        metrics_response = client.get(f"/api/v1/metrics/fidelity/{node_id}")
        assert metrics_response.status_code == 200
        metrics = metrics_response.json()
        assert metrics["node_id"] == node_id
        assert metrics["sample_count"] >= 1
        assert 0.0 <= metrics["min_fidelity"] <= 1.0
        assert 0.0 <= metrics["max_fidelity"] <= 1.0


def test_auth_and_rate_limit_guards(tmp_path: Path) -> None:
    database_path = str(tmp_path / "auth-rate.db")
    app = create_app(
        make_real_libp2p_config(
            database_path,
            enable_auth=True,
            api_key="topsecret",
            enable_rate_limit=True,
            rate_limit_per_minute=1,
        )
    )

    with TestClient(app) as client:
        unauthorized = client.get("/api/v1/services")
        assert unauthorized.status_code == 401

        authorized = client.get("/api/v1/services", headers={"X-API-Key": "topsecret"})
        assert authorized.status_code == 200

        limited = client.get("/api/v1/services", headers={"X-API-Key": "topsecret"})
        assert limited.status_code == 429


def test_startup_recovery_reprocesses_unfinished_jobs(tmp_path: Path) -> None:
    database_path = str(tmp_path / "recovery.db")
    job_store = SQLiteJobStore(database_path)
    now = datetime.now(timezone.utc)
    job_store.upsert(
        JobRecord(
            job_id="job-recover-1",
            status=JobStatus.QUEUED,
            circuit_text=CIRCUIT_TEXT,
            plan_id=None,
            error=None,
            result_json=None,
            created_at=now,
            updated_at=now,
        )
    )

    app = create_app(make_real_libp2p_config(database_path))
    with TestClient(app) as client:
        _wait_for_services(client)
        response = client.get("/api/v1/jobs/job-recover-1")
        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "COMPLETED"
        assert payload["result"] is not None
