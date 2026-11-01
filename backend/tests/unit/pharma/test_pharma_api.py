"""Unit tests — pharma FastAPI router (pipeline patched at module level)."""
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

import quantum_backend_v2.api.routers.pharma as pharma_router_module
from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.pharma import build_pharma_router

from .fakes import FakePharmaJobService

SECRET = "correct-shared-secret"
X402_HEADERS = {"X-X402-Gateway-Secret": SECRET}


@pytest.fixture(autouse=True)
def pipeline_and_auth(monkeypatch):
    # Keep PennyLane out of the tests: the background task becomes a no-op.
    monkeypatch.setattr(pharma_router_module, "_run_pharma_job", AsyncMock())
    configure_auth(enabled=True, allow_dev_bearer_tokens=True)
    yield
    configure_auth(enabled=True, allow_dev_bearer_tokens=False)


@pytest.fixture
def service():
    return FakePharmaJobService()


def _client(service, user="alice", secret=None):
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(build_pharma_router(pharma_job_service=service, x402_gateway_secret=secret))
    client = TestClient(app)
    if user is not None:
        client.headers["Authorization"] = f"Bearer dev-{user}"
    return client


@pytest.fixture
def client(service):
    return _client(service)


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


class TestPharmaOwnership:
    def test_requests_without_a_token_are_rejected(self, service):
        anonymous = _client(service, user=None)
        assert anonymous.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).status_code == 401
        assert anonymous.get("/api/v1/pharma/jobs").status_code == 401
        assert anonymous.get("/api/v1/pharma/jobs/pharma_x").status_code == 401
        assert anonymous.delete("/api/v1/pharma/jobs/pharma_x").status_code == 401
        assert service.jobs == {}

    def test_job_is_stored_under_the_caller(self, client, service):
        jid = client.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        assert service.jobs[jid].owner_user_id == "alice"

    def test_list_returns_only_own_jobs(self, service):
        alice, bobby = _client(service, "alice"), _client(service, "bobby")
        mine = alice.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        bobby.post("/api/v1/pharma/submit", json=DISCOVERY_PAYLOAD)
        assert [j["job_id"] for j in alice.get("/api/v1/pharma/jobs").json()] == [mine]

    def test_other_users_job_is_hidden_from_get_live_and_cancel(self, service):
        alice, bobby = _client(service, "alice"), _client(service, "bobby")
        jid = alice.post("/api/v1/pharma/submit", json=OPT_PAYLOAD).json()["job_id"]
        assert bobby.get(f"/api/v1/pharma/jobs/{jid}").status_code == 404
        assert bobby.get(f"/api/v1/pharma/jobs/{jid}/live").status_code == 404
        assert bobby.delete(f"/api/v1/pharma/jobs/{jid}").status_code == 404
        assert alice.get(f"/api/v1/pharma/jobs/{jid}").json()["status"] == "queued"

    def test_overlong_ligand_smiles_422(self, client):
        assert client.post("/api/v1/pharma/submit",
                           json={**OPT_PAYLOAD, "initial_ligand_smiles": "C" * 501}).status_code == 422


class TestPharmaX402Routes:
    SUBMIT = "/api/v1/pharma/internal/x402/submit"

    def test_routes_are_disabled_without_secret(self, service):
        assert _client(service, user=None).post(self.SUBMIT, json=OPT_PAYLOAD).status_code == 404

    def test_submit_requires_secret_and_creates_no_job_when_rejected(self, service):
        client = _client(service, user=None, secret=SECRET)
        wrong = {"X-X402-Gateway-Secret": "wrong"}
        assert client.post(self.SUBMIT, json=OPT_PAYLOAD).status_code == 401
        assert client.post(self.SUBMIT, headers=wrong, json=OPT_PAYLOAD).status_code == 401
        assert service.jobs == {}

    def test_submit_and_status_use_the_paid_owner(self, service):
        client = _client(service, user=None, secret=SECRET)
        accepted = client.post(self.SUBMIT, headers=X402_HEADERS, json=OPT_PAYLOAD)
        assert accepted.status_code == 202
        jid = accepted.json()["job_id"]
        assert service.jobs[jid].owner_user_id == "x402-algorand"
        status = client.get(f"/api/v1/pharma/internal/x402/jobs/{jid}", headers=X402_HEADERS)
        assert status.status_code == 200
        assert status.json()["job_id"] == jid

    def test_status_requires_secret_and_hides_other_owners_jobs(self, service):
        client = _client(service, user=None, secret=SECRET)
        user_job = _client(service, "alice").post("/api/v1/pharma/submit", json=OPT_PAYLOAD)
        jid = user_job.json()["job_id"]
        url = f"/api/v1/pharma/internal/x402/jobs/{jid}"
        assert client.get(url).status_code == 401
        assert client.get(url, headers=X402_HEADERS).status_code == 404

    def test_submit_rejects_oversized_jobs(self, service):
        client = _client(service, user=None, secret=SECRET)
        too_many_iterations = {**OPT_PAYLOAD, "max_iterations": 6}
        too_many_candidates = {**OPT_PAYLOAD, "candidate_count": 101}
        for payload in (too_many_iterations, too_many_candidates):
            assert client.post(self.SUBMIT, headers=X402_HEADERS, json=payload).status_code == 422
        assert service.jobs == {}
