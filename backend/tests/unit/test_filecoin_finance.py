"""Immutable CSV datasets pass verified bytes into the existing finance pipeline."""
from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors.models import register_exception_handlers
from quantum_backend_v2.api.routers.financial import build_financial_router
from quantum_backend_v2.application import parity
from quantum_backend_v2.application.financial_portfolio import PortfolioOptimizationConfig
from quantum_backend_v2.artifacts.filecoin import FilecoinReceipt, FilecoinStore
from quantum_backend_v2.provenance.hashing import hash_json

CSV = b"date,A,B\n2026-01-01,10,20\n2026-01-02,11,19\n"


def receipt():
    return FilecoinReceipt(piece_cid="bafkzcibfixture", sha256=hashlib.sha256(CSV).hexdigest(),
                           size_bytes=len(CSV))


class MemoryJob:
    jobs = {}

    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)
        self.error = None
        self.created_at = self.updated_at = datetime.now(timezone.utc)

    async def insert(self):
        self.jobs[self.id] = self

    async def save(self):
        self.jobs[self.id] = self

    @classmethod
    async def get(cls, key):
        return cls.jobs.get(key)


class ReadBoundary(FilecoinStore):
    data = CSV

    async def command(self, command, **kwargs):
        assert command == "download"
        return {"data_base64": base64.b64encode(self.data).decode()}


@pytest.fixture
def setup(monkeypatch):
    MemoryJob.jobs = {}
    monkeypatch.setattr(parity, "FinancialJobDocument", MemoryJob)

    async def ensure_user(_):
        pass

    monkeypatch.setattr(parity, "_ensure_platform_user", ensure_user)
    builder_calls = []

    def build(**kwargs):
        builder_calls.append(kwargs)
        return SimpleNamespace(payload={"row_count": 2, "col_count": 2, "result": "computed"})

    monkeypatch.setattr(parity, "build_portfolio_optimization_artifacts", build)
    return builder_calls


@pytest.mark.anyio
async def test_filecoin_csv_is_verified_persisted_and_committed(setup):
    store = ReadBoundary()
    service = parity.FinancialJobService(discovery_service=None, libp2p_runtime=None,
                                        filecoin_store=store)
    doc = await service.submit_filecoin(owner_user_id="alice", filename="dataset.csv",
                                       receipt=receipt(), config=PortfolioOptimizationConfig())
    assert doc.owner_user_id == "alice"
    assert doc.request_payload["filecoin_dataset"] == receipt().model_dump(mode="json")
    assert "csv_text" not in doc.request_payload
    await service.process(job_id=doc.id, csv_bytes=b"must never be used")
    assert doc.status == "completed", doc.error
    assert setup[0]["csv_bytes"] == CSV
    assert doc.request_payload["csv_text"] == CSV.decode()
    bundle = doc.result_payload["provenance"]["bundle"]
    assert bundle["input_hash"] == hash_json(doc.request_payload)
    assert bundle["oracle_refs"] == []
    assert "valuation" not in doc.result_payload
    stranger = SimpleNamespace(user_id="bob", is_admin=lambda: False)
    assert await service.get_job(doc.id, current_user=stranger) is None


@pytest.mark.anyio
@pytest.mark.parametrize("failure", ["tampered", "unavailable", "disabled"])
async def test_unverified_or_disabled_dataset_never_reaches_builder(setup, failure):
    store = ReadBoundary()
    service = parity.FinancialJobService(discovery_service=None, libp2p_runtime=None,
                                        filecoin_store=store)
    doc = await service.submit_filecoin(owner_user_id="alice", filename="dataset.csv",
                                       receipt=receipt(), config=PortfolioOptimizationConfig())
    if failure == "tampered":
        store.data = b"tampered"
    elif failure == "unavailable":
        async def unavailable(*args, **kwargs):
            raise OSError("sensitive-provider-url")
        store.command = unavailable
    else:
        service._filecoin_store = None
    await service.process(job_id=doc.id, csv_bytes=CSV)
    assert doc.status == "failed"
    assert "sensitive-provider-url" not in doc.error
    assert not setup


@pytest.mark.anyio
async def test_disabled_filecoin_rejects_submission(setup):
    service = parity.FinancialJobService(discovery_service=None, libp2p_runtime=None)
    with pytest.raises(ValueError, match="not configured"):
        await service.submit_filecoin(owner_user_id="alice", filename="dataset.csv",
                                     receipt=receipt(), config=PortfolioOptimizationConfig())
    assert not MemoryJob.jobs


@pytest.mark.anyio
async def test_filecoin_endpoint_auth_validation_and_owner(setup):
    service = parity.FinancialJobService(discovery_service=None, libp2p_runtime=None,
                                        filecoin_store=ReadBoundary())
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(build_financial_router(financial_job_service=service))
    configure_auth(enabled=True, allow_dev_bearer_tokens=True)
    body = {"receipt": receipt().model_dump(mode="json"), "qaoa_reps": 2, "budget": 1}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            no_auth = await client.post("/api/v1/finance/filecoin-submit", json=body)
            assert no_auth.status_code == 401
            headers = {"Authorization": "Bearer dev-alice"}
            invalid = await client.post("/api/v1/finance/filecoin-submit", headers=headers,
                                        json={**body, "qaoa_reps": 99})
            assert invalid.status_code == 422
            response = await client.post(
                "/api/v1/finance/filecoin-submit", headers=headers, json=body
            )
        assert response.status_code == 201, response.text
        doc = MemoryJob.jobs[response.json()["job_id"]]
        assert doc.owner_user_id == "alice"
        assert setup[0]["config"].qaoa_reps == 2
    finally:
        configure_auth(enabled=True, allow_dev_bearer_tokens=False)
