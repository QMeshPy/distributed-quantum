from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.routers.circuits import build_circuits_router


class _JobService:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.owner_user_id: str | None = None
        self.run = SimpleNamespace(
            id="job-paid",
            status="queued",
            artifact_bundle_id=None,
            input_snapshot={"circuit": "OPENQASM 2.0; qreg q[1];"},
            output_snapshot={},
            fragment_count=0,
            completed_fragments=0,
            failed_fragments=0,
            created_at=now,
            updated_at=now,
        )

    async def submit(self, *, circuit_text: str, owner_user_id: str) -> Any:
        self.owner_user_id = owner_user_id
        self.run.input_snapshot = {"circuit": circuit_text}
        return self.run

    async def process(self, job_id: str) -> None:
        return None

    async def get_job_for_owner(self, job_id: str, *, owner_user_id: str) -> Any:
        if job_id == self.run.id and owner_user_id == self.owner_user_id:
            return self.run
        return None

    def get_result_payload(self, run: Any) -> None:
        return None

    def get_error(self, run: Any) -> None:
        return None

    def build_progress(self, run: Any) -> None:
        return None


def _client(secret: str | None) -> tuple[TestClient, _JobService]:
    service = _JobService()
    app = FastAPI()
    app.include_router(
        build_circuits_router(
            job_service=service,  # type: ignore[arg-type]
            x402_gateway_secret=secret,
        )
    )
    return TestClient(app), service


def test_x402_internal_routes_are_disabled_without_secret() -> None:
    client, _ = _client(None)

    response = client.post(
        "/api/v1/internal/x402/circuits/submit",
        json={"circuit": "OPENQASM 2.0; qreg q[1];"},
    )

    assert response.status_code == 404


def test_x402_internal_routes_require_secret_and_reuse_paid_owner() -> None:
    client, service = _client("correct-shared-secret")
    endpoint = "/api/v1/internal/x402/circuits/submit"

    rejected = client.post(endpoint, json={"circuit": "OPENQASM 2.0; qreg q[1];"})
    accepted = client.post(
        endpoint,
        headers={"X-X402-Gateway-Secret": "correct-shared-secret"},
        json={"circuit": "OPENQASM 2.0; qreg q[1];"},
    )
    status = client.get(
        "/api/v1/internal/x402/jobs/job-paid",
        headers={"X-X402-Gateway-Secret": "correct-shared-secret"},
    )

    assert rejected.status_code == 401
    assert accepted.status_code == 201
    assert accepted.json() == {"job_id": "job-paid", "status": "queued"}
    assert service.owner_user_id == "x402-algorand"
    assert status.status_code == 200
    assert status.json()["job_id"] == "job-paid"
