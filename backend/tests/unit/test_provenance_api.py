"""Exercise the HTTP contract and ownership checks without external services."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from quantum_backend_v2.api.deps import auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.provenance import build_provenance_router
from quantum_backend_v2.provenance.hashing import bundle_hash
from quantum_backend_v2.provenance.service import ProvenanceService, StoredProvenance
from quantum_backend_v2.provenance.verification import RunEvidence, build_result_bundle


class MemoryRepository:
    def __init__(self) -> None:
        self.run = RunEvidence(
            run_id="workflow-1",
            workflow_definition_id="circuit-execution",
            owner_user_id="owner-1",
            input_snapshot={"circuit": "h q[0];"},
            plan_id="plan-1",
            result={"fragment_results": [], "quantum_result": {"counts": {"0": 1}}},
        )
        bundle = build_result_bundle(
            self.run, created_at=datetime(2026, 10, 21, tzinfo=timezone.utc)
        )
        self.stored = StoredProvenance(
            bundle_id=bundle.bundle_id,
            workflow_run_id=self.run.run_id,
            payload=bundle.model_dump(mode="json"),
            content_hash=bundle_hash(bundle),
        )

    async def get_bundle(self, bundle_id: str) -> StoredProvenance | None:
        return self.stored if bundle_id == self.stored.bundle_id else None

    async def get_run(self, run_id: str) -> RunEvidence | None:
        return self.run if run_id == self.run.run_id else None


@pytest.mark.anyio
async def test_endpoint_requires_auth_and_hides_other_users_records(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth, "_auth_required", True)
    monkeypatch.setattr(auth, "_allow_dev_bearer_tokens", True)
    repository = MemoryRepository()
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(build_provenance_router(service=ProvenanceService(repository)))
    path = f"/api/v1/provenance/{repository.stored.bundle_id}/verify"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get(path)).status_code == 401
        assert (
            await client.get(path, headers={"Authorization": "Bearer dev-other"})
        ).status_code == 404
        response = await client.get(path, headers={"Authorization": "Bearer dev-owner-1"})
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
        data = response.json()
        assert data["status"] == "partially_verified"
        assert {check["kind"] for check in data["checks"]} == {"hash", "storage", "anchor"}
        assert (
            await client.get(
                "/api/v1/provenance/missing/verify", headers={"Authorization": "Bearer dev-owner-1"}
            )
        ).status_code == 404


@pytest.mark.anyio
async def test_admin_can_verify_and_payload_owner_cannot_grant_access() -> None:
    repository = MemoryRepository()
    service = ProvenanceService(repository)
    repository.stored.payload["owner_user_id"] = "attacker"
    assert (
        await service.verify(repository.stored.bundle_id, user_id="attacker", is_admin=False)
        is None
    )
    report = await service.verify(repository.stored.bundle_id, user_id="admin", is_admin=True)
    assert report is not None
    assert report.status == "unverified"
    assert any(check.name == "run_identity" and check.status == "failed" for check in report.checks)


@pytest.mark.anyio
async def test_corrupt_bundle_reports_failure_without_leaking_payload() -> None:
    repository = MemoryRepository()
    repository.stored.payload["input_hash"] = "invalid"
    report = await ProvenanceService(repository).verify(
        repository.stored.bundle_id, user_id="owner-1", is_admin=False
    )
    assert report is not None
    assert report.status == "unverified"
    assert report.checks[0].name == "schema"
    assert "payload" not in report.model_dump()
