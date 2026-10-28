"""
Integration test suite — Quantum Pharma Pipeline
=================================================
Direct HTTP calls against a minimal FastAPI test app. Pipeline mocked at
module level so tests run in milliseconds without PennyLane.

Scenarios:
  1. ONE-SHOT — single-pass optimization for 3 real PDB targets (2024-2025)
  2. ITERATIVE — multi-iteration discovery / scaffold-hop
  3. REPETITIVE — same payload submitted N times → isolation, unique IDs

PDB IDs (2023-2025 RCSB):
  8FH5  SARS-CoV-2 3CLpro/MPro + nirmatrelvir analogue
  8QNG  KRAS G12D + AMG510 (sotorasib) scaffold
  9BVX  CDK12 PROTAC/degrader complex
  8TXI  PI3Kδ oral inhibitor
  7NXB  EGFR T790M/C797S triple-mutant benchmark
"""
from __future__ import annotations
import json
import pytest
from unittest.mock import AsyncMock
from quantum_backend_v2.api.deps.auth import require_authenticated, _dev_bypass_user
from fastapi import FastAPI
from fastapi.testclient import TestClient
import quantum_backend_v2.api.routers.pharma as pharma_module
from quantum_backend_v2.api.routers.pharma import router as pharma_router

# Patch pipeline at module level — prevents PennyLane from running in tests
pharma_module._run_pharma_pipeline = AsyncMock()


@pytest.fixture(autouse=True)
def reset_store():
    pharma_module._JOB_STORE.clear()
    yield
    pharma_module._JOB_STORE.clear()


@pytest.fixture(scope="session")
def api():
    app = FastAPI(title="Pharma Integration Tests")
    app.dependency_overrides[require_authenticated] = _dev_bypass_user
    app.include_router(pharma_router)
    return TestClient(app, raise_server_exceptions=False)


def submit_and_get(api, payload: dict) -> dict:
    sub = api.post("/api/v1/pharma/submit", json=payload)
    assert sub.status_code == 202, f"Submit failed ({sub.status_code}): {sub.text}"
    jid = sub.json()["job_id"]
    r = api.get(f"/api/v1/pharma/jobs/{jid}")
    assert r.status_code == 200
    return r.json()


def print_job(label: str, job: dict) -> None:
    print(f"\n{'='*60}\n  {label}\n{'='*60}")
    print(json.dumps(job, indent=2))


# ─────────────────────────────────────────────────────────────
# SCENARIO 1: ONE-SHOT
# ─────────────────────────────────────────────────────────────
class TestOneShotOptimization:
    MPROTHIB = {
        "mode": "optimization", "target_pdb_id": "8FH5",
        "initial_ligand_smiles":
            "CC1(C2CC2NC(=O)C(F)(F)F)CN1C(=O)C(NC(=O)C1=NC(=O)CS1)(C#N)C(C)(C)C",
        "max_iterations": 1, "candidate_count": 10,
    }
    KRAS_AMG = {
        "mode": "optimization", "target_pdb_id": "8QNG",
        "initial_ligand_smiles": "CS(=O)(=O)Cc1cc2c(cc1F)nc(N)c1c(=O)n2c1-c1ccccc1",
        "max_iterations": 1, "candidate_count": 10,
    }
    EGFR_COV = {
        "mode": "optimization", "target_pdb_id": "7NXB",
        "initial_ligand_smiles":
            "C=CC(=O)Nc1cccc(Nc2nc3cccc(Oc4cccc5c4nccc45)n3n2)c1",
        "max_iterations": 1, "candidate_count": 10,
    }

    def test_mprothib_8fh5(self, api):
        job = submit_and_get(api, self.MPROTHIB)
        print_job("ONE-SHOT / 8FH5 MPro + nirmatrelvir analogue", job)
        assert job["status"] in ("queued", "running", "completed", "failed")

    def test_mprothib_mode(self, api):
        assert submit_and_get(api, self.MPROTHIB)["mode"] == "optimization"

    def test_mprothib_pdb(self, api):
        assert submit_and_get(api, self.MPROTHIB)["target_pdb_id"] == "8FH5"

    def test_mprothib_job_id_prefix(self, api):
        assert submit_and_get(api, self.MPROTHIB)["job_id"].startswith("pharma_")

    def test_mprothib_submitted_at(self, api):
        assert submit_and_get(api, self.MPROTHIB)["submitted_at"]

    def test_mprothib_state_present(self, api):
        assert "state" in submit_and_get(api, self.MPROTHIB)

    def test_kras_8qng(self, api):
        job = submit_and_get(api, self.KRAS_AMG)
        print_job("ONE-SHOT / 8QNG KRAS G12D + AMG510 scaffold", job)
        assert job["status"] in ("queued", "running", "completed", "failed")

    def test_kras_pdb(self, api):
        assert submit_and_get(api, self.KRAS_AMG)["target_pdb_id"] == "8QNG"

    def test_egfr_7nxb(self, api):
        job = submit_and_get(api, self.EGFR_COV)
        print_job("ONE-SHOT / 7NXB EGFR T790M/C797S + covalent ligand", job)
        assert job["status"] in ("queued", "running", "completed", "failed")

    def test_egfr_pdb(self, api):
        assert submit_and_get(api, self.EGFR_COV)["target_pdb_id"] == "7NXB"

    def test_all_3_pdb_in_list(self, api):
        for p in [self.MPROTHIB, self.KRAS_AMG, self.EGFR_COV]:
            api.post("/api/v1/pharma/submit", json=p)
        pdb_ids = {j["target_pdb_id"] for j in api.get("/api/v1/pharma/jobs").json()}
        assert {"8FH5", "8QNG", "7NXB"}.issubset(pdb_ids)


# ─────────────────────────────────────────────────────────────
# SCENARIO 2: ITERATIVE DISCOVERY
# ─────────────────────────────────────────────────────────────
class TestIterativeDrugDiscovery:
    CDK12 = {
        "mode": "discovery", "target_pdb_id": "9BVX",
        "candidate_count": 10, "max_iterations": 3,
    }
    PI3K_DISC = {
        "mode": "discovery", "target_pdb_id": "8TXI",
        "candidate_count": 10, "max_iterations": 3,
    }
    PI3K_OPT = {
        "mode": "optimization", "target_pdb_id": "8TXI",
        "initial_ligand_smiles": "CC(=O)Nc1ccc2c(c1)nc(Nc1ccc(OC)cc1)n2",
        "candidate_count": 10, "max_iterations": 3,
    }

    def test_cdk12_discovery_3iter(self, api):
        job = submit_and_get(api, self.CDK12)
        print_job("ITERATIVE / 9BVX CDK12 discovery — 3 iterations", job)
        assert job["status"] in ("queued", "running", "completed", "failed")

    def test_cdk12_mode(self, api):
        assert submit_and_get(api, self.CDK12)["mode"] == "discovery"

    def test_cdk12_pdb(self, api):
        assert submit_and_get(api, self.CDK12)["target_pdb_id"] == "9BVX"

    def test_pi3k_discovery_3iter(self, api):
        job = submit_and_get(api, self.PI3K_DISC)
        print_job("ITERATIVE / 8TXI PI3Kd discovery — 3 iterations", job)
        assert job["status"] in ("queued", "running", "completed", "failed")

    def test_pi3k_opt_3iter(self, api):
        job = submit_and_get(api, self.PI3K_OPT)
        print_job("ITERATIVE / 8TXI PI3Kd optimization + scaffold hop — 3 iterations", job)
        assert job["mode"] == "optimization"
        assert job["target_pdb_id"] == "8TXI"

    def test_all_3_queryable(self, api):
        ids = {api.post("/api/v1/pharma/submit", json=p).json()["job_id"]
               for p in [self.CDK12, self.PI3K_DISC, self.PI3K_OPT]}
        stored = {j["job_id"] for j in api.get("/api/v1/pharma/jobs").json()}
        assert ids.issubset(stored)

    def test_cancel_204(self, api):
        jid = api.post("/api/v1/pharma/submit", json=self.CDK12).json()["job_id"]
        assert api.delete(f"/api/v1/pharma/jobs/{jid}").status_code == 204

    def test_cancelled_status(self, api):
        jid = api.post("/api/v1/pharma/submit", json=self.PI3K_DISC).json()["job_id"]
        api.delete(f"/api/v1/pharma/jobs/{jid}")
        assert api.get(f"/api/v1/pharma/jobs/{jid}").json()["status"] == "cancelled"

    def test_5_iters_ok(self, api):
        payload = {**self.CDK12, "max_iterations": 5}
        assert submit_and_get(api, payload)["status"] in (
            "queued", "running", "completed", "failed")

    def test_21_iters_rejected(self, api):
        assert api.post("/api/v1/pharma/submit",
                        json={**self.CDK12, "max_iterations": 21}).status_code == 422


# ─────────────────────────────────────────────────────────────
# SCENARIO 3: REPETITIVE
# ─────────────────────────────────────────────────────────────
class TestRepetitiveTesting:
    """
    Reference compounds vs. latest high-value drug targets:
      aspirin     (MW 180)  vs. 8FH5 (MPro)
      ibuprofen   (MW 206)  vs. 8QNG (KRAS G12D)
      paracetamol (MW 151)  vs. 7NXB (EGFR triple mutant)
      caffeine    (MW 194)  vs. 9BVX (CDK12)
    """
    ASPIRIN_8FH5 = {
        "mode": "optimization", "target_pdb_id": "8FH5",
        "initial_ligand_smiles": "CC(=O)Oc1ccccc1C(=O)O",
        "max_iterations": 1, "candidate_count": 10,
    }
    IBUPROFEN_8QNG = {
        "mode": "optimization", "target_pdb_id": "8QNG",
        "initial_ligand_smiles": "CC(C)Cc1ccc(cc1)C(C)C(=O)O",
        "max_iterations": 1, "candidate_count": 10,
    }
    PARACETAMOL_7NXB = {
        "mode": "optimization", "target_pdb_id": "7NXB",
        "initial_ligand_smiles": "CC(=O)Nc1ccc(O)cc1",
        "max_iterations": 1, "candidate_count": 10,
    }
    CAFFEINE_9BVX = {
        "mode": "optimization", "target_pdb_id": "9BVX",
        "initial_ligand_smiles": "Cn1cnc2c1c(=O)n(c(=O)n2C)C",
        "max_iterations": 1, "candidate_count": 10,
    }

    def test_aspirin_8fh5_3x_unique_ids(self, api):
        ids = [api.post("/api/v1/pharma/submit", json=self.ASPIRIN_8FH5).json()["job_id"]
               for _ in range(3)]
        print_job("REPETITIVE / aspirin vs 8FH5 — 3 independent runs", {"submitted_ids": ids})
        assert len(set(ids)) == 3

    def test_all_3_aspirin_jobs_individually_retrievable(self, api):
        ids = [api.post("/api/v1/pharma/submit", json=self.ASPIRIN_8FH5).json()["job_id"]
               for _ in range(3)]
        for jid in ids:
            r = api.get(f"/api/v1/pharma/jobs/{jid}")
            assert r.status_code == 200
            assert r.json()["job_id"] == jid

    def test_cancel_one_leaves_sibling_intact(self, api):
        id0 = api.post("/api/v1/pharma/submit", json=self.IBUPROFEN_8QNG).json()["job_id"]
        id1 = api.post("/api/v1/pharma/submit", json=self.IBUPROFEN_8QNG).json()["job_id"]
        api.delete(f"/api/v1/pharma/jobs/{id0}")
        assert api.get(f"/api/v1/pharma/jobs/{id0}").json()["status"] == "cancelled"
        assert api.get(f"/api/v1/pharma/jobs/{id1}").json()["status"] in (
            "queued", "running", "completed", "failed")

    def test_paracetamol_7nxb_3x(self, api):
        for i in range(3):
            jid = api.post("/api/v1/pharma/submit", json=self.PARACETAMOL_7NXB).json()["job_id"]
            job = api.get(f"/api/v1/pharma/jobs/{jid}").json()
            print_job(f"REPETITIVE / paracetamol vs 7NXB — run {i+1}", job)
            assert job["target_pdb_id"] == "7NXB"
            assert job["mode"] == "optimization"

    def test_caffeine_9bvx_2x(self, api):
        for i in range(2):
            jid = api.post("/api/v1/pharma/submit", json=self.CAFFEINE_9BVX).json()["job_id"]
            job = api.get(f"/api/v1/pharma/jobs/{jid}").json()
            print_job(f"REPETITIVE / caffeine vs 9BVX — run {i+1}", job)
            assert job["target_pdb_id"] == "9BVX"

    def test_4_jobs_in_list(self, api):
        for p in [self.ASPIRIN_8FH5, self.IBUPROFEN_8QNG,
                  self.PARACETAMOL_7NXB, self.CAFFEINE_9BVX]:
            api.post("/api/v1/pharma/submit", json=p)
        assert len(api.get("/api/v1/pharma/jobs").json()) == 4

    def test_job_schema_complete(self, api):
        required = {"job_id", "status", "mode", "target_pdb_id", "submitted_at", "state"}
        for p in [self.ASPIRIN_8FH5, self.IBUPROFEN_8QNG]:
            api.post("/api/v1/pharma/submit", json=p)
        for job in api.get("/api/v1/pharma/jobs").json():
            assert required.issubset(set(job.keys()))

    def test_pdb_ids_round_trip(self, api):
        for payload, expected in [
            (self.ASPIRIN_8FH5, "8FH5"),
            (self.IBUPROFEN_8QNG, "8QNG"),
            (self.PARACETAMOL_7NXB, "7NXB"),
            (self.CAFFEINE_9BVX, "9BVX"),
        ]:
            assert submit_and_get(api, payload)["target_pdb_id"] == expected


# ─────────────────────────────────────────────────────────────
# SCENARIO 4: BOUNDARY VALIDATION
# ─────────────────────────────────────────────────────────────
class TestBoundaryValidation:
    def test_candidate_500_ok(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "discovery", "target_pdb_id": "8FH5", "candidate_count": 500,
        }).status_code == 202

    def test_candidate_10_ok(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "discovery", "target_pdb_id": "8FH5", "candidate_count": 10,
        }).status_code == 202

    def test_candidate_9_rejected(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "discovery", "target_pdb_id": "8FH5", "candidate_count": 9,
        }).status_code == 422

    def test_iterations_20_ok(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "optimization", "target_pdb_id": "8FH5",
            "initial_ligand_smiles": "CC(=O)Oc1ccccc1C(=O)O", "max_iterations": 20,
        }).status_code == 202

    def test_iterations_21_rejected(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "optimization", "target_pdb_id": "8FH5", "max_iterations": 21,
        }).status_code == 422

    def test_pdb_3chars_ok(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "discovery", "target_pdb_id": "1AB", "candidate_count": 10,
        }).status_code == 202

    def test_pdb_2chars_rejected(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "discovery", "target_pdb_id": "AB", "candidate_count": 10,
        }).status_code == 422

    def test_pdb_10chars_ok(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "discovery", "target_pdb_id": "1234567890", "candidate_count": 10,
        }).status_code == 202

    def test_pdb_11chars_rejected(self, api):
        assert api.post("/api/v1/pharma/submit", json={
            "mode": "discovery", "target_pdb_id": "12345678901", "candidate_count": 10,
        }).status_code == 422

    def test_empty_body_422(self, api):
        assert api.post("/api/v1/pharma/submit", json={}).status_code == 422

    def test_invalid_json_422(self, api):
        r = api.post("/api/v1/pharma/submit",
                     content=b"not json",
                     headers={"Content-Type": "application/json"})
        assert r.status_code == 422
