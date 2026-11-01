from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.risk import build_risk_router

SECRET = "correct-shared-secret"
HEADERS = {"X-X402-Gateway-Secret": SECRET}
SUBMIT = "/api/v1/risk/internal/x402/submit"
EQUITY = {
    "risk_model": "equity",
    "holdings": [{"ticker": "AAPL", "weight": 1.0}],
}


class _RiskJobService:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.submitted = 0
        self.owner_user_id: str | None = None
        self.run = SimpleNamespace(
            id="risk-paid",
            status="queued",
            risk_model="equity",
            portfolio_size=1,
            result_payload=None,
            error=None,
            created_at=now,
            updated_at=now,
        )

    async def submit(
        self, *, risk_model: str, portfolio_size: int, owner_user_id: str, request_payload: dict
    ) -> Any:
        self.submitted += 1
        self.owner_user_id = owner_user_id
        return self.run

    async def process(self, *, job_id: str, request_payload: dict) -> None:
        return None

    async def get_job_for_owner(self, job_id: str, *, owner_user_id: str) -> Any:
        if job_id == self.run.id and owner_user_id == self.owner_user_id:
            return self.run
        return None


def _client(secret: str | None) -> tuple[TestClient, _RiskJobService]:
    service = _RiskJobService()
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(
        build_risk_router(
            risk_job_service=service,  # type: ignore[arg-type]
            x402_gateway_secret=secret,
        )
    )
    return TestClient(app), service


def test_x402_risk_routes_are_disabled_without_secret() -> None:
    client, _ = _client(None)

    assert client.post(SUBMIT, json=EQUITY).status_code == 404


def test_x402_risk_submit_requires_secret_and_creates_no_job_when_rejected() -> None:
    client, service = _client(SECRET)

    rejected = client.post(SUBMIT, json=EQUITY)
    wrong = client.post(SUBMIT, headers={"X-X402-Gateway-Secret": "wrong"}, json=EQUITY)

    assert rejected.status_code == 401
    assert wrong.status_code == 401
    assert service.submitted == 0


def test_x402_risk_submit_and_status_use_the_paid_owner() -> None:
    client, service = _client(SECRET)

    accepted = client.post(SUBMIT, headers=HEADERS, json=EQUITY)
    status = client.get("/api/v1/risk/internal/x402/jobs/risk-paid", headers=HEADERS)

    assert accepted.status_code == 201
    assert accepted.json() == {
        "job_id": "risk-paid",
        "status": "queued",
        "risk_model": "equity",
        "portfolio_size": 1,
    }
    assert service.owner_user_id == "x402-algorand"
    assert status.status_code == 200
    assert status.json()["job_id"] == "risk-paid"


def test_x402_risk_status_requires_secret_and_hides_other_jobs() -> None:
    client, _ = _client(SECRET)
    client.post(SUBMIT, headers=HEADERS, json=EQUITY)

    unauthenticated = client.get("/api/v1/risk/internal/x402/jobs/risk-paid")
    unknown = client.get("/api/v1/risk/internal/x402/jobs/risk-other", headers=HEADERS)

    assert unauthenticated.status_code == 401
    assert unknown.status_code == 404


def test_x402_risk_submit_rejects_oracle_pricing() -> None:
    client, service = _client(SECRET)
    body = {
        "risk_model": "equity",
        "holdings": [
            {
                "ticker": "ETH",
                "weight": 1.0,
                "quantity": 1,
                "current_value": 1000,
                "chainlink_price": {"network": "ethereum-sepolia", "feed": "eth-usd"},
            }
        ],
        "historical_returns": [[0.01], [0.02], [-0.01], [0.0]],
    }

    response = client.post(SUBMIT, headers=HEADERS, json=body)

    assert response.status_code == 422
    assert service.submitted == 0


def test_x402_risk_submit_rejects_oversized_portfolios() -> None:
    client, service = _client(SECRET)
    holdings = [{"ticker": f"T{index}", "weight": 1.0} for index in range(21)]
    assets = [
        {"principal": 1000, "default_probability": 0.02, "recovery_rate": 0.4}
        for _ in range(16)
    ]

    equity = client.post(
        SUBMIT, headers=HEADERS, json={"risk_model": "equity", "holdings": holdings}
    )
    credit = client.post(
        SUBMIT, headers=HEADERS, json={"risk_model": "credit", "assets": assets}
    )

    assert equity.status_code == 422
    assert credit.status_code == 422
    assert service.submitted == 0
