"""HTTP contract of the credits router and credit-metered circuit jobs (#10)."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from quantum_backend_v2.api.deps import auth
from quantum_backend_v2.api.errors import register_exception_handlers
from quantum_backend_v2.api.routers.circuits import build_circuits_router
from quantum_backend_v2.api.routers.credits import build_credits_router
from quantum_backend_v2.payments.errors import (
    IdempotencyConflictError,
    InsufficientCreditError,
)
from quantum_backend_v2.payments.ledger import RecordResult
from quantum_backend_v2.payments.models import (
    CreditBalance,
    PaymentEvent,
    PaymentPurpose,
    PaymentRail,
)

SECRET = "s" * 32
SESSION = "cs_test_a1B2c3"


@pytest.fixture(autouse=True)
def dev_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_auth_required", True)
    monkeypatch.setattr(auth, "_allow_dev_bearer_tokens", True)


class FakeLedger:
    def __init__(self) -> None:
        self.purchases: dict[str, Decimal] = {}
        self.rails: dict[str, PaymentRail] = {}

    async def record_event(self, **fields: Any) -> RecordResult:
        key = fields["idempotency_key"]
        if key in self.purchases and self.purchases[key] != fields["amount"]:
            raise IdempotencyConflictError(key)
        created = key not in self.purchases
        self.purchases[key] = fields["amount"]
        self.rails[key] = fields["rail"]
        event = PaymentEvent(
            idempotency_key=key,
            rail=fields["rail"],
            purpose=PaymentPurpose.CREDIT_PURCHASE,
            asset="USDC",
            amount=fields["amount"],
        )
        return RecordResult(event=event, created=created)

    async def confirm(self, key: str) -> None:
        return None

    async def balance(self, account_id: str) -> CreditBalance:
        return CreditBalance(
            account_id=account_id, available=sum(self.purchases.values(), Decimal("0"))
        )


def _credits_client(secret: str | None) -> tuple[TestClient, FakeLedger]:
    ledger = FakeLedger()
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(
        build_credits_router(
            ledger_service=ledger,  # type: ignore[arg-type]
            circuit_job_cost=Decimal("2"),
            billing_internal_secret=secret,
        )
    )
    return TestClient(app), ledger


def _purchase(**overrides: Any) -> dict[str, Any]:
    return {"checkout_session_id": SESSION, "account_id": "user-1", "credits": "10", **overrides}


PURCHASES = "/api/v1/internal/billing/credit-purchases"


def test_balance_requires_a_user_and_returns_their_own() -> None:
    client, _ = _credits_client(SECRET)
    assert client.get("/api/v1/credits/balance").status_code == 401

    response = client.get("/api/v1/credits/balance", headers={"Authorization": "Bearer dev-user-7"})
    assert response.status_code == 200
    assert response.json()["balance"]["account_id"] == "user-7"
    assert response.json()["circuit_job_cost"] == "2"


def test_purchase_route_is_absent_without_a_secret() -> None:
    client, _ = _credits_client(None)
    assert client.post(PURCHASES, json=_purchase()).status_code == 404


def test_purchase_route_requires_the_shared_secret() -> None:
    client, ledger = _credits_client(SECRET)
    assert client.post(PURCHASES, json=_purchase()).status_code == 401
    wrong = {"X-Billing-Internal-Secret": "x" * 32}
    assert client.post(PURCHASES, json=_purchase(), headers=wrong).status_code == 401
    assert ledger.purchases == {}


def test_purchase_is_recorded_once_per_checkout_session() -> None:
    client, ledger = _credits_client(SECRET)
    headers = {"X-Billing-Internal-Secret": SECRET}

    first = client.post(PURCHASES, json=_purchase(), headers=headers)
    replay = client.post(PURCHASES, json=_purchase(), headers=headers)

    assert first.status_code == replay.status_code == 200
    assert first.json()["idempotency_key"] == f"stripe:checkout:{SESSION}"
    assert (first.json()["created"], replay.json()["created"]) == (True, False)
    assert replay.json()["balance"]["available"] == "10"
    conflict = client.post(PURCHASES, json=_purchase(credits="11"), headers=headers)
    assert conflict.status_code == 409


@pytest.mark.parametrize(
    ("payment_method", "rail"),
    [(None, PaymentRail.CARD), ("card", PaymentRail.CARD), ("crypto", PaymentRail.STABLECOIN)],
)
def test_purchase_is_recorded_on_the_rail_it_was_paid_with(
    payment_method: str | None, rail: PaymentRail
) -> None:
    client, ledger = _credits_client(SECRET)
    headers = {"X-Billing-Internal-Secret": SECRET}
    body = _purchase() if payment_method is None else _purchase(payment_method=payment_method)

    assert client.post(PURCHASES, json=body, headers=headers).status_code == 200
    assert ledger.rails == {f"stripe:checkout:{SESSION}": rail}


@pytest.mark.parametrize(
    "overrides",
    [
        {"checkout_session_id": "not-a-session"},
        {"credits": "0"},
        {"credits": "-5"},
        {"credits": "0.0000001"},
        {"unexpected": "field"},
        {"payment_method": "paypal"},
    ],
)
def test_purchase_rejects_invalid_payloads(overrides: dict[str, Any]) -> None:
    client, _ = _credits_client(SECRET)
    headers = {"X-Billing-Internal-Secret": SECRET}
    assert client.post(PURCHASES, json=_purchase(**overrides), headers=headers).status_code == 422


# ----------------------------------------------------------------------
# Credit-metered circuit jobs
# ----------------------------------------------------------------------


class FakeJobService:
    def __init__(self, *, final_status: str = "COMPLETED", fail_submit: bool = False) -> None:
        self.final_status = final_status
        self.fail_submit = fail_submit
        self.runs: dict[str, Any] = {}

    async def submit(self, *, circuit_text: str, owner_user_id: str, job_id: str) -> Any:
        if self.fail_submit:
            raise RuntimeError("database down")
        now = datetime.now(timezone.utc)
        self.runs[job_id] = SimpleNamespace(
            id=job_id, status="queued", owner_user_id=owner_user_id, created_at=now
        )
        return self.runs[job_id]

    async def process(self, job_id: str) -> None:
        self.runs[job_id].status = self.final_status

    async def get_job_for_owner(self, job_id: str, *, owner_user_id: str) -> Any:
        run = self.runs.get(job_id)
        return run if run is not None and run.owner_user_id == owner_user_id else None


class FakeMeter:
    cost = Decimal("2")

    def __init__(self, *, available: Decimal) -> None:
        self.available = available
        self.calls: list[tuple[str, ...]] = []

    async def reserve(self, account_id: str, job_id: str) -> None:
        if self.available < self.cost:
            raise InsufficientCreditError(account_id)
        self.available -= self.cost
        self.calls.append(("reserve", account_id, job_id))

    async def settle(
        self, job_id: str, *, succeeded: bool, payable: Decimal = Decimal("0")
    ) -> None:
        self.calls.append(("capture" if succeeded else "release", job_id))


def _jobs_client(jobs: FakeJobService, meter: FakeMeter) -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(
        build_circuits_router(job_service=jobs, credit_meter=meter)  # type: ignore[arg-type]
    )
    return TestClient(app)


SUBMIT = "/api/v1/circuits/submit"
USER = {"Authorization": "Bearer dev-user-1"}
CIRCUIT = {"circuit": "OPENQASM 2.0; qreg q[1];"}


def test_job_without_enough_credits_is_rejected_with_402() -> None:
    jobs, meter = FakeJobService(), FakeMeter(available=Decimal("1"))
    response = _jobs_client(jobs, meter).post(SUBMIT, json=CIRCUIT, headers=USER)

    assert response.status_code == 402
    assert response.json()["error"] == "insufficient_credits"
    assert jobs.runs == {}


def test_completed_job_captures_its_hold() -> None:
    jobs, meter = FakeJobService(), FakeMeter(available=Decimal("5"))
    response = _jobs_client(jobs, meter).post(SUBMIT, json=CIRCUIT, headers=USER)

    assert response.status_code == 201
    job_id = response.json()["job_id"]
    assert meter.calls == [("reserve", "user-1", job_id), ("capture", job_id)]


def test_failed_job_releases_its_hold() -> None:
    jobs, meter = FakeJobService(final_status="FAILED"), FakeMeter(available=Decimal("5"))
    response = _jobs_client(jobs, meter).post(SUBMIT, json=CIRCUIT, headers=USER)

    job_id = response.json()["job_id"]
    assert meter.calls[-1] == ("release", job_id)


def test_hold_is_released_when_the_job_cannot_be_created() -> None:
    jobs, meter = FakeJobService(fail_submit=True), FakeMeter(available=Decimal("5"))
    client = TestClient(_jobs_client(jobs, meter).app, raise_server_exceptions=False)

    assert client.post(SUBMIT, json=CIRCUIT, headers=USER).status_code == 500
    assert [call[0] for call in meter.calls] == ["reserve", "release"]
