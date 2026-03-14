from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from quantum_coordinator.api.app import create_app
from quantum_coordinator.config.models import AppConfig, DatabaseConfig, Libp2pConfig
from quantum_coordinator.domain.models import JobStatus
from quantum_coordinator.infra.persistence.job_store import JobRecord


def test_job_summary_response_omits_heavy_quantum_fields(tmp_path: Path) -> None:
    app = create_app(
        AppConfig(
            database=DatabaseConfig(path=str(tmp_path / "job-summary.db")),
            libp2p=Libp2pConfig(enabled=False),
        )
    )
    now = datetime.now(timezone.utc)
    app.state.job_store.upsert(
        JobRecord(
            job_id="job-summary-1",
            status=JobStatus.COMPLETED,
            circuit_text="OPENQASM 3;",
            plan_id="plan-summary-1",
            error=None,
            result_json=(
                '{"job_id":"job-summary-1","fragment_results":[],'
                '"quantum_result":{"counts":{"00":1024},'
                '"measured_probabilities":{"00":1.0},'
                '"probabilities":{"00":1.0},'
                '"statevector":["(1+0j)","0j"],'
                '"reduced_density_matrices":{"q0":[["(1+0j)","0j"],["0j","0j"]]}}}'
            ),
            created_at=now,
            updated_at=now,
        )
    )

    with TestClient(app) as client:
        full_response = client.get("/api/v1/jobs/job-summary-1")
        assert full_response.status_code == 200
        full_payload = full_response.json()
        assert full_payload["result"]["quantum_result"]["statevector"] == ["1+0j", "0j"]
        assert full_payload["result"]["quantum_result"]["probabilities"] == {"00": 1.0}
        assert full_payload["result"]["quantum_result"]["reduced_density_matrices"] == {
            "q0": [["1+0j", "0j"], ["0j", "0j"]]
        }

        summary_response = client.get(
            "/api/v1/jobs/job-summary-1",
            params={"result_detail": "summary"},
        )
        assert summary_response.status_code == 200
        summary_payload = summary_response.json()
        assert summary_payload["result"]["quantum_result"]["counts"] == {"00": 1024}
        assert summary_payload["result"]["quantum_result"]["measured_probabilities"] == {
            "00": 1.0
        }
        assert summary_payload["result"]["quantum_result"]["probabilities"] is None
        assert summary_payload["result"]["quantum_result"]["statevector"] is None
        assert summary_payload["result"]["quantum_result"]["reduced_density_matrices"] is None
