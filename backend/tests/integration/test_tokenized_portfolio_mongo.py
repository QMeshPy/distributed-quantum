"""Opt-in tokenized-stock portfolio jobs on a local MongoDB with recorded chain rounds."""

import asyncio
import os
from datetime import date
from uuid import uuid4

import pytest
from beanie import init_beanie
from pymongo import AsyncMongoClient
from robinhood_chain import SOURCE, RecordedChain
from web3 import Web3

from quantum_backend_v2.application.financial_portfolio import PortfolioOptimizationConfig
from quantum_backend_v2.application.parity import FinancialJobService
from quantum_backend_v2.application.tokenized_portfolio import DISCLAIMER
from quantum_backend_v2.chains.market_data import UnsupportedAssetError
from quantum_backend_v2.chains.price_history import TokenPriceHistoryReader
from quantum_backend_v2.persistence.mongodb import FinancialJobDocument, PlatformUserDocument
from quantum_backend_v2.provenance.hashing import bundle_hash, hash_json
from quantum_backend_v2.provenance.models import ProvenanceBundle

MONGODB_URI = os.environ.get("QMESH_TEST_MONGODB_URI")
pytestmark = pytest.mark.skipif(
    not MONGODB_URI, reason="set QMESH_TEST_MONGODB_URI for a local test server"
)
CONFIG = PortfolioOptimizationConfig(
    value_mode="prices", date_column="date", parameter_search_steps=3
)


class RecordedHistorySource:
    market_data = SOURCE

    def __init__(self):
        self.provider = RecordedChain()

    async def read(self, symbols, start, end):
        return TokenPriceHistoryReader(SOURCE, Web3(self.provider)).read(symbols, start, end)


def run_with_database(test):
    async def run():
        database = "qmesh_tokenized_test_" + uuid4().hex
        client = AsyncMongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        try:
            await init_beanie(
                database=client[database],
                document_models=[FinancialJobDocument, PlatformUserDocument],
            )
            await test()
        finally:
            await client.drop_database(database)
            await client.close()

    asyncio.run(run())


def service(source=None):
    return FinancialJobService(
        discovery_service=None,
        libp2p_runtime=None,
        history_source=source or RecordedHistorySource(),
    )


def test_job_reads_history_optimizes_and_records_provenance():
    async def test():
        jobs = service()
        submitted = await jobs.submit_tokenized(
            owner_user_id="alice",
            symbols=["SPY", "QQQ"],
            start=date(2026, 6, 1),
            end=date(2026, 10, 28),
            config=CONFIG,
        )
        assert submitted.status == "ingesting"
        await jobs.process(job_id=submitted.id, csv_bytes=b"")

        job = await FinancialJobDocument.get(submitted.id)
        assert job.status == "completed", job.error
        assert (job.owner_user_id, job.row_count) == ("alice", 89)
        result = job.result_payload
        assert result["disclaimer"] == DISCLAIMER
        assert result["market_data"]["aligned_days"] == 89
        assert (
            result["market_data"]["block_hash"] == job.request_payload["market_data"]["block_hash"]
        )
        for method in ("classical", "quantum"):
            selected = result["benchmark"][method]["selected_assets"]
            assert set(selected) <= {"SPY", "QQQ"}
            assert [w["symbol"] for w in result["allocation_weights"][method]] == selected
        assert "valuation" not in result

        # The persisted inputs reproduce the bundle: the exact CSV and every close's round.
        bundle = ProvenanceBundle.model_validate(result["provenance"]["bundle"])
        assert bundle_hash(bundle) == result["provenance"]["bundle_hash"]
        assert bundle.input_hash == hash_json(job.request_payload)
        assert len(bundle.oracle_refs) == 178
        assert job.request_payload["csv_text"].startswith("date,SPY,QQQ\n2026-06-23,")

    run_with_database(test)


def test_unusable_history_fails_the_job_without_a_result():
    async def test():
        source = RecordedHistorySource()
        spy = next(f for f in source.provider.feeds.values() if f["symbol"] == "SPY")
        spy["rounds"][100][1] = "7429406277700000000"  # One mis-scaled round mid-window.
        jobs = service(source)
        submitted = await jobs.submit_tokenized(
            owner_user_id="alice",
            symbols=["SPY", "QQQ"],
            start=date(2026, 6, 1),
            end=date(2026, 10, 28),
            config=CONFIG,
        )
        await jobs.process(job_id=submitted.id, csv_bytes=b"")
        job = await FinancialJobDocument.get(submitted.id)
        assert job.status == "failed"
        assert job.error == "price round moved implausibly; the allowlist needs review"
        assert "benchmark" not in job.result_payload

        short = await jobs.submit_tokenized(
            owner_user_id="alice",
            symbols=["SPY", "QQQ"],
            start=date(2026, 4, 1),
            end=date(2026, 7, 10),
            config=CONFIG,
        )
        await jobs.process(job_id=short.id, csv_bytes=b"")
        job = await FinancialJobDocument.get(short.id)
        assert (job.status, job.error) == (
            "failed",
            "need at least 60 aligned daily prices for the selected assets",
        )

    run_with_database(test)


def test_invalid_selection_creates_no_job():
    async def test():
        with pytest.raises(UnsupportedAssetError):
            await service().submit_tokenized(
                owner_user_id="alice",
                symbols=["SPY", "DOGE"],
                start=date(2026, 6, 1),
                end=date(2026, 10, 28),
                config=CONFIG,
            )
        assert await FinancialJobDocument.count() == 0

    run_with_database(test)


def test_http_submission_runs_the_real_job_for_its_owner():
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient

    from quantum_backend_v2.api.deps.auth import configure_auth
    from quantum_backend_v2.api.errors.models import register_exception_handlers
    from quantum_backend_v2.api.routers.financial import build_financial_router

    async def test():
        app = FastAPI()
        register_exception_handlers(app)
        app.include_router(build_financial_router(financial_job_service=service()))
        alice = {"Authorization": "Bearer dev-alice"}
        configure_auth(enabled=True, allow_dev_bearer_tokens=True)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
                rejected = await client.post(
                    "/api/v1/finance/tokenized-portfolio",
                    headers=alice,
                    json={
                        "symbols": ["SPY", "QQQ"],
                        "start_date": "2026-06-01",
                        "end_date": "2026-10-27",
                        "budget": 2,
                    },
                )
                assert rejected.status_code == 422
                assert await FinancialJobDocument.count() == 0

                # The background task runs before the ASGI call returns.
                submitted = await client.post(
                    "/api/v1/finance/tokenized-portfolio",
                    headers=alice,
                    json={
                        "symbols": ["SPY", "QQQ"],
                        "start_date": "2026-06-01",
                        "end_date": "2026-10-27",
                        "parameter_search_steps": 3,
                    },
                )
                assert submitted.status_code == 201
                job_id = submitted.json()["job_id"]
                job = (await client.get(f"/api/v1/finance/{job_id}", headers=alice)).json()
                hidden = await client.get(
                    f"/api/v1/finance/{job_id}", headers={"Authorization": "Bearer dev-bob"}
                )
        finally:
            configure_auth(enabled=True, allow_dev_bearer_tokens=False)
        assert job["status"] == "completed", job["error"]
        assert job["result"]["market_data"]["aligned_days"] == 89
        assert job["result"]["disclaimer"] == DISCLAIMER
        assert hidden.status_code == 404

    run_with_database(test)
