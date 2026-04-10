from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from quantum_coordinator.api.app import create_app
from quantum_coordinator.config.models import AppConfig, DatabaseConfig, Libp2pConfig
from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence.job_store import JobRecord


def test_jobs_list_endpoint_returns_recent_jobs_and_filters_by_status(tmp_path: Path) -> None:
    app = create_app(
        AppConfig(
            database=DatabaseConfig(path=str(tmp_path / "job-list.db")),
            libp2p=Libp2pConfig(enabled=False),
        )
    )
    now = datetime.now(timezone.utc)
    records = [
        JobRecord(
            job_id="job-old",
            status=JobStatus.FAILED,
            circuit_text="OPENQASM 3;\nh q[0];",
            plan_id="plan-old",
            error="planner error",
            result_json=None,
            created_at=now - timedelta(minutes=10),
            updated_at=now - timedelta(minutes=10),
        ),
        JobRecord(
            job_id="job-new",
            status=JobStatus.QUEUED,
            circuit_text="OPENQASM 3;\nmeasure q[0] -> c[0];",
            plan_id=None,
            error=None,
            result_json=None,
            created_at=now,
            updated_at=now,
        ),
    ]

    for record in records:
        app.state.job_store.upsert(record)

    with TestClient(app) as client:
        response = client.get("/api/v1/jobs")
        assert response.status_code == 200
        payload = response.json()

        assert [item["job_id"] for item in payload] == ["job-new", "job-old"]
        assert payload[0]["status"] == "QUEUED"
        assert payload[0]["circuit_preview"] == "OPENQASM 3;"
        assert payload[0]["result_available"] is False

        filtered = client.get("/api/v1/jobs", params=[("status", "FAILED")])
        assert filtered.status_code == 200
        filtered_payload = filtered.json()
        assert [item["job_id"] for item in filtered_payload] == ["job-old"]
