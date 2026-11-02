"""Finance attachments preserve commitments and use the existing owner lookup."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.deps.auth import require_authenticated
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.financial import build_financial_router
from quantum_backend_v2.api.routers.options import build_options_router
from quantum_backend_v2.api.routers.risk import build_risk_router
from quantum_backend_v2.application.finance_provenance import build_finance_provenance
from quantum_backend_v2.provenance.finance_inputs import restore_finance_inputs
from quantum_backend_v2.provenance.hashing import bundle_hash, canonical_json
from quantum_backend_v2.provenance.models import ProvenanceBundle


@pytest.mark.parametrize(
    "path,build,argument",
    [
        ("finance", build_financial_router, "financial_job_service"),
        ("options", build_options_router, "options_job_service"),
        ("risk", build_risk_router, "risk_job_service"),
    ],
)
def test_download_keeps_exact_evidence_and_owner_lookup(path, build, argument):
    inputs = {
        "time_to_expiry": 1.0,
        "negative_zero": -0.0,
        "large": 9007199254740993,
        "price_observations": [],
    }
    evidence = build_finance_provenance(
        "download-job", "owner", inputs, {"value": 1}, workflow="options-pricing"
    )
    record = SimpleNamespace(result_payload={"provenance": evidence})
    service = SimpleNamespace(get_job=AsyncMock(return_value=record))
    owner = SimpleNamespace(user_id="owner")
    app = FastAPI()
    register_exception_handlers(app)
    app.dependency_overrides[require_authenticated] = lambda: owner
    app.include_router(build(**{argument: service}))
    with TestClient(app) as client:
        response = client.get(f"/api/v1/{path}/download-job?download=provenance")
        assert response.status_code == 200
        assert response.content == canonical_json(evidence)
        assert response.headers["content-disposition"].startswith("attachment;")
        assert response.headers["cache-control"] == "private, no-store"
        service.get_job.assert_awaited_once_with("download-job", current_user=owner)
        bundle = ProvenanceBundle.model_validate(response.json()["bundle"])
        assert bundle_hash(bundle) == evidence["bundle_hash"]
        assert canonical_json(restore_finance_inputs(bundle)) == canonical_json(inputs)

        record.result_payload = {}
        assert client.get(f"/api/v1/{path}/download-job?download=provenance").status_code == 404
        service.get_job.return_value = None
        assert client.get(f"/api/v1/{path}/download-job?download=provenance").status_code == 404
        app.dependency_overrides.clear()
        service.get_job.reset_mock()
        assert client.get(f"/api/v1/{path}/download-job?download=provenance").status_code == 401
        service.get_job.assert_not_awaited()
