from __future__ import annotations

from fastapi.testclient import TestClient

from quantum_coordinator.api.app import create_app
from quantum_coordinator.config.models import AppConfig


def test_health_endpoint_returns_ok() -> None:
    app = create_app(AppConfig())
    client = TestClient(app)

    response = client.get("/api/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "quantum-coordinator"
    assert payload["environment"] == "development"
    assert payload["uptime_seconds"] >= 0.0
