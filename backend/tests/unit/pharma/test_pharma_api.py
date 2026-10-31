"""Unit tests — pharma FastAPI router (pipeline patched at module level)."""
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock
from quantum_backend_v2.api.deps.auth import require_authenticated, _dev_bypass_user
from fastapi import FastAPI
from fastapi.testclient import TestClient

import quantum_backend_v2.api.routers.pharma as pharma_router_module
from quantum_backend_v2.api.routers.pharma import router as pharma_router

# Patch the pipeline at import time so TestClient never executes PennyLane
pharma_router_module._run_pharma_pipeline = AsyncMock()


@pytest.fixture(autouse=True)
def reset_job_store():
    pharma_router_module._JOB_STORE.clear()
    yield
    pharma_router_module._JOB_STORE.clear()


@pytest.fixture
def client():
    app = FastAPI()
    app.dependency_overrides[require_authenticated] = _dev_bypass_user
    app.include_router(pharma_router)
    return TestClient(app)


OPT_PAYLOAD = {
    "mode": "optimization", "target_pdb_id": "6LU7",
    "initial_ligand_smiles": "CC(=O)Oc1ccccc1C(=O)O",
    "max_iterations": 2, "candidate_count": 10,
}
DISCOVERY_PAYLOAD = {
    "mode": "discovery", "target_pdb_id": "1IEP", "candidate_count": 10,
}
ONE_SHOT_PAYLOAD = {
    "mode": "optimization", "target_pdb_id": "3HTB",
    "initial_ligand_smiles": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
    "max_iterations": 1, "candidate_count": 10,
}


class TestPharmaSubmit:
    def test_submit_optimization_202(self, client):
        r = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD)
        assert r.status_code == 202, r.text

    def test_submit_returns_job_id(self, client):
        assert client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"].startswith("pharma_")

    def test_submit_status_queued(self, client):
        assert client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["status"] == "queued"

    def test_submit_submitted_at_present(self, client):
        assert "submitted_at" in client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()

    def test_submit_discovery_202(self, client):
        assert client.post("/api/v1/pharma/submit", json=DISCOVERY_PAYLOAD).status_code == 202

    def test_submit_one_shot_202(self, client):
        assert client.post("/api/v1/pharma/submit", json=ONE_SHOT_PAYLOAD).status_code == 202

    def test_submit_missing_pdb_id_422(self, client):
        assert client.post("/api/v1/pharma/submit",
                           json={"mode": "optimization", "candidate_count": 10}).status_code == 422

    def test_submit_invalid_mode_422(self, client):
        assert client.post("/api/v1/pharma/submit",
                           json={"mode": "teleport", "target_pdb_id": "6LU7"}).status_code == 422

    def test_submit_pdb_id_too_short_422(self, client):
        assert client.post("/api/v1/pharma/submit",
                           json={"mode": "discovery", "target_pdb_id": "AB"}).status_code == 422

    def test_submit_pdb_id_too_long_422(self, client):
        assert client.post("/api/v1/pharma/submit",
                           json={"mode": "discovery", "target_pdb_id": "ABCDEFGHIJK"}).status_code == 422

    def test_submit_max_iterations_25_422(self, client):
        assert client.post("/api/v1/pharma/submit",
                           json={**OPT_PAYLOAD, "max_iterations": 25}).status_code == 422

    def test_submit_candidate_count_5_422(self, client):
        assert client.post("/api/v1/pharma/submit",
                           json={**OPT_PAYLOAD, "candidate_count": 5}).status_code == 422


class TestPharmaListJobs:
    def test_list_200(self, client):
        assert client.get("/api/v1/pharma/jobs").status_code == 200

    def test_list_empty_at_start(self, client):
        assert client.get("/api/v1/pharma/jobs").json() == []

    def test_list_after_submit_has_job(self, client):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        assert jid in [j["job_id"] for j in client.get("/api/v1/pharma/jobs").json()]

    def test_list_3_jobs(self, client):
        for p in [OPT_PAYLOAD, DISCOVERY_PAYLOAD, ONE_SHOT_PAYLOAD]:
            client.post("/api/v1/pharma/submit", json=p)
        assert len(client.get("/api/v1/pharma/jobs").json()) == 3


class TestPharmaGetJob:
    def test_get_existing_200(self, client):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        assert client.get(f"/api/v1/pharma/jobs/{jid}").status_code == 200

    def test_get_nonexistent_404(self, client):
        assert client.get("/api/v1/pharma/jobs/pharma_notreal").status_code == 404

    def test_job_has_required_fields(self, client):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        data = client.get(f"/api/v1/pharma/jobs/{jid}").json()
        for f in ("job_id", "status", "mode", "target_pdb_id", "submitted_at"):
            assert f in data

    def test_mode_stored(self, client):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        assert client.get(f"/api/v1/pharma/jobs/{jid}").json()["mode"] == "optimization"

    def test_pdb_id_stored(self, client):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        assert client.get(f"/api/v1/pharma/jobs/{jid}").json()["target_pdb_id"] == "6LU7"


class TestPharmaCancelJob:
    def test_cancel_queued_204(self, client):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        assert client.delete(f"/api/v1/pharma/jobs/{jid}").status_code == 204

    def test_cancel_nonexistent_404(self, client):
        assert client.delete("/api/v1/pharma/jobs/pharma_notreal").status_code == 404

    def test_status_cancelled_after_delete(self, client):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        client.delete(f"/api/v1/pharma/jobs/{jid}")
        assert client.get(f"/api/v1/pharma/jobs/{jid}").json()["status"] == "cancelled"

    def test_cancel_two_jobs(self, client):
        ids = [client.post("/api/v1/pharma/submit", json=p).json()["job_id"]
               for p in [OPT_PAYLOAD, DISCOVERY_PAYLOAD]]
        for jid in ids:
            assert client.delete(f"/api/v1/pharma/jobs/{jid}").status_code == 204
