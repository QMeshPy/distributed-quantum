from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.financial import build_financial_router
from quantum_backend_v2.chains.prices import PriceUnavailableError

SECRET = "correct-shared-secret"
HEADERS = {"X-X402-Gateway-Secret": SECRET}
SUBMIT = "/api/v1/finance/internal/x402/submit"
REQUEST = {"symbols": ["TSLA", "AMZN"], "start_date": "2026-01-01", "end_date": "2026-03-01"}


class _FinancialJobService:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.submitted = 0
        self.owner_user_id: str | None = None
        self.error: Exception | None = None
        self.run = SimpleNamespace(
            id="fin-paid",
            filename="tokenized-stocks",
            status="ingesting",
            row_count=None,
            col_count=None,
            error=None,
            created_at=now,
            updated_at=now,
        )

    async def submit_tokenized(self, *, owner_user_id: str, **_: Any) -> Any:
        if self.error is not None:
            raise self.error
        self.submitted += 1
        self.owner_user_id = owner_user_id
        return self.run

    async def process(self, *, job_id: str, csv_bytes: bytes) -> None:
        return None

    async def get_job_for_owner(self, job_id: str, *, owner_user_id: str) -> Any:
        if job_id == self.run.id and owner_user_id == self.owner_user_id:
            return self.run
        return None

    def get_problem_type(self, record: object) -> str:
        return "portfolio_optimization"

    def get_result_payload(self, record: object, *, detail: str = "full") -> dict[str, str]:
        return {"detail": detail}


def _client(secret: str | None) -> tuple[TestClient, _FinancialJobService]:
    service = _FinancialJobService()
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(
        build_financial_router(
            financial_job_service=service,  # type: ignore[arg-type]
            x402_gateway_secret=secret,
        )
    )
    return TestClient(app), service


def test_x402_finance_routes_are_disabled_without_secret() -> None:
    client, _ = _client(None)

    assert client.post(SUBMIT, json=REQUEST).status_code == 404


def test_x402_finance_submit_requires_secret_and_creates_no_job_when_rejected() -> None:
    client, service = _client(SECRET)

    rejected = client.post(SUBMIT, json=REQUEST)
    wrong = client.post(SUBMIT, headers={"X-X402-Gateway-Secret": "wrong"}, json=REQUEST)

    assert rejected.status_code == 401
    assert wrong.status_code == 401
    assert service.submitted == 0


def test_x402_finance_submit_and_status_use_the_paid_owner() -> None:
    client, service = _client(SECRET)

    accepted = client.post(SUBMIT, headers=HEADERS, json=REQUEST)
    status = client.get("/api/v1/finance/internal/x402/jobs/fin-paid", headers=HEADERS)

    assert accepted.status_code == 201
    assert accepted.json() == {
        "job_id": "fin-paid",
        "status": "ingesting",
        "problem_type": "portfolio_optimization",
    }
    assert service.owner_user_id == "x402-algorand"
    assert status.status_code == 200
    assert status.json()["job_id"] == "fin-paid"
    assert status.json()["result"] == {"detail": "full"}


def test_x402_finance_status_requires_secret_and_hides_other_jobs() -> None:
    client, _ = _client(SECRET)
    client.post(SUBMIT, headers=HEADERS, json=REQUEST)

    unauthenticated = client.get("/api/v1/finance/internal/x402/jobs/fin-paid")
    unknown = client.get("/api/v1/finance/internal/x402/jobs/fin-other", headers=HEADERS)

    assert unauthenticated.status_code == 401
    assert unknown.status_code == 404


def test_x402_finance_submit_reports_invalid_selection_and_missing_prices() -> None:
    client, service = _client(SECRET)

    service.error = ValueError("unsupported symbol")
    invalid = client.post(SUBMIT, headers=HEADERS, json=REQUEST)
    service.error = PriceUnavailableError("history source offline")
    unavailable = client.post(SUBMIT, headers=HEADERS, json=REQUEST)
    too_few = client.post(SUBMIT, headers=HEADERS, json={**REQUEST, "symbols": ["TSLA"]})

    assert invalid.status_code == 422
    assert unavailable.status_code == 503
    assert too_few.status_code == 422
    assert service.submitted == 0
