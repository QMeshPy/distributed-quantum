"""Tokenized-stock portfolio endpoints (#18)."""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from quantum_backend_v2.api.deps.auth import configure_auth
from quantum_backend_v2.api.errors.models import register_exception_handlers
from quantum_backend_v2.api.routers.financial import build_financial_router
from quantum_backend_v2.application.tokenized_portfolio import DISCLAIMER, tokenized_request
from quantum_backend_v2.chains.market_data import load_market_data
from quantum_backend_v2.chains.prices import PriceUnavailableError

pytestmark = pytest.mark.anyio
AUTH = {"Authorization": "Bearer dev-alice"}
VALID = {"symbols": ["SPY", "QQQ"], "start_date": "2026-06-01", "end_date": "2026-10-28"}


class _StubService:
    def __init__(self, market_data=None, error=None):
        self.tokenized_market_data = market_data
        self.error = error
        self.submissions = []
        self.processed = []

    async def submit_tokenized(self, *, owner_user_id, symbols, start, end, config):
        if self.error is not None:
            raise self.error
        # The real service validates with the same function before creating a job.
        tokenized_request(self.tokenized_market_data, symbols, start, end, config)
        self.submissions.append(
            {
                "owner": owner_user_id,
                "symbols": symbols,
                "start": start,
                "end": end,
                "config": config,
            }
        )
        return SimpleNamespace(id="fin-rh", status="ingesting")

    async def process(self, *, job_id, csv_bytes):
        self.processed.append((job_id, csv_bytes))

    async def get_job(self, job_id, *, current_user):
        return None


@pytest.fixture(autouse=True)
def _reset_auth():
    configure_auth(enabled=True, allow_dev_bearer_tokens=True)
    yield
    configure_auth(enabled=True, allow_dev_bearer_tokens=False)


def client_for(service):
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(build_financial_router(financial_job_service=service))
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_asset_list_requires_auth_and_describes_the_rules():
    service = _StubService(load_market_data())
    async with client_for(service) as client:
        assert (await client.get("/api/v1/finance/tokenized-assets")).status_code == 401
        response = await client.get("/api/v1/finance/tokenized-assets", headers=AUTH)

    assert response.status_code == 200
    body = response.json()
    assert body["chain_id"] == "eip155:4663"
    assert body["disclaimer"] == DISCLAIMER
    assert "not investment advice" in body["disclaimer"]
    assert body["price_unit"] == "token_usd"
    assert (body["min_aligned_days"], body["max_history_days"]) == (60, 366)
    assert [asset["symbol"] for asset in body["assets"]][:3] == ["AAPL", "MSFT", "NVDA"]
    assert set(body["assets"][0]) == {"symbol", "name", "isin", "token_address", "feed_address"}
    # No RPC configuration is exposed.
    assert "rpc" not in response.text.lower()


async def test_asset_list_is_unavailable_without_a_history_source():
    async with client_for(_StubService()) as client:
        response = await client.get("/api/v1/finance/tokenized-assets", headers=AUTH)
    assert response.status_code == 503


async def test_submission_queues_a_price_based_job_for_the_owner():
    service = _StubService(load_market_data())
    async with client_for(service) as client:
        assert (
            await client.post("/api/v1/finance/tokenized-portfolio", json=VALID)
        ).status_code == 401
        response = await client.post(
            "/api/v1/finance/tokenized-portfolio",
            headers=AUTH,
            json={**VALID, "risk_aversion": 0.7, "qaoa_reps": 2},
        )

    assert response.status_code == 201
    assert response.json() == {
        "job_id": "fin-rh",
        "status": "ingesting",
        "problem_type": "portfolio_optimization",
    }
    (submission,) = service.submissions
    assert submission["owner"] == "alice"
    assert submission["symbols"] == ["SPY", "QQQ"]
    assert (submission["start"], submission["end"]) == (date(2026, 6, 1), date(2026, 10, 28))
    config = submission["config"]
    assert (config.value_mode, config.date_column, config.ticker_column) == ("prices", "date", None)
    assert (config.risk_aversion, config.qaoa_reps) == (0.7, 2)
    assert service.processed == [("fin-rh", b"")]


@pytest.mark.parametrize(
    "body",
    [
        {**VALID, "symbols": ["SPY"]},
        {**VALID, "symbols": ["SPY", "TOP_SECRET"]},
        {**VALID, "symbols": ["SPY", "SPY"]},
        {**VALID, "start_date": "2026-10-28", "end_date": "2026-06-01"},
        {**VALID, "start_date": "2025-01-01"},
        {**VALID, "end_date": "2999-01-01"},
        {**VALID, "max_assets_considered": 9},
        {**VALID, "symbols": ["SPY", "qqq"]},
        {**VALID, "budget": 2},
        {**VALID, "start_date": "2026-09-01", "end_date": "2026-10-01"},
        {**VALID, "wallet_address": "0x" + "11" * 20},
    ],
)
async def test_invalid_submissions_are_rejected_without_a_job(body):
    service = _StubService(load_market_data())
    async with client_for(service) as client:
        response = await client.post("/api/v1/finance/tokenized-portfolio", headers=AUTH, json=body)
    assert response.status_code == 422
    assert "TOP_SECRET" not in response.text
    assert service.submissions == [] and service.processed == []


async def test_unavailable_history_source_is_a_503():
    service = _StubService(load_market_data(), error=PriceUnavailableError("not configured"))
    async with client_for(service) as client:
        response = await client.post(
            "/api/v1/finance/tokenized-portfolio", headers=AUTH, json=VALID
        )
    assert response.status_code == 503
    assert service.processed == []


async def test_static_routes_are_not_shadowed_by_job_ids():
    service = _StubService(load_market_data())
    async with client_for(service) as client:
        response = await client.get("/api/v1/finance/tokenized-assets", headers=AUTH)
    assert response.status_code == 200
