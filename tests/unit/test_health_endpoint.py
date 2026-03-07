from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from quantum_coordinator.api.app import create_app
from tests.support.real_libp2p import make_real_libp2p_config


def test_health_endpoint_returns_ok(tmp_path: Path) -> None:
    app = create_app(make_real_libp2p_config(str(tmp_path / "health.db")))

    with TestClient(app) as client:
        response = client.get("/api/v1/health")

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ok"
        assert payload["service"] == "quantum-coordinator"
        assert payload["environment"] == "development"
        assert payload["uptime_seconds"] >= 0.0
