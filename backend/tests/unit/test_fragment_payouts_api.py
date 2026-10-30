"""Circuit-job wiring for pay-per-fragment payouts (#8)."""

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
from quantum_backend_v2.application.parity import CircuitJobService
from quantum_backend_v2.payments.payouts import (
    FragmentOutcome,
    IntentStatus,
    JobPayoutSummary,
    PayoutIntent,
    WithheldReason,
)

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def dev_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_auth_required", True)
    monkeypatch.setattr(auth, "_allow_dev_bearer_tokens", True)


SUBMIT = "/api/v1/circuits/submit"
USER = {"Authorization": "Bearer dev-user-1"}
CIRCUIT = {"circuit": "OPENQASM 2.0; qreg q[1];"}


class OwnedJobs:
    def __init__(self, *, final_status: str = "COMPLETED") -> None:
        self.final_status = final_status
        self.runs: dict[str, Any] = {}

    async def submit(
        self, *, circuit_text: str, owner_user_id: str, job_id: str | None = None
    ) -> Any:
        job_id = job_id or f"job-{len(self.runs) + 1}"
        self.runs[job_id] = SimpleNamespace(id=job_id, status="queued", owner_user_id=owner_user_id)
        return self.runs[job_id]

    async def process(self, job_id: str) -> None:
        self.runs[job_id].status = self.final_status

    async def get_job_for_owner(self, job_id: str, *, owner_user_id: str) -> Any:
        run = self.runs.get(job_id)
        return run if run is not None and run.owner_user_id == owner_user_id else None

    async def get_job(self, job_id: str, *, current_user: Any) -> Any:
        return await self.get_job_for_owner(job_id, owner_user_id=current_user.user_id)


class RecordingMeter:
    cost = Decimal("5")

    def __init__(self) -> None:
        self.settled: list[tuple[str, bool, Decimal]] = []

    async def reserve(self, account_id: str, job_id: str) -> None:
        return None

    async def settle(self, job_id: str, *, succeeded: bool, payable: Decimal) -> None:
        self.settled.append((job_id, succeeded, payable))


def _intent(fragment_id: str, status: IntentStatus, amount: str, **fields: Any) -> PayoutIntent:
    now = datetime.now(timezone.utc)
    return PayoutIntent(
        intent_key=f"fragment:job:{fragment_id}",
        job_id="job",
        fragment_id=fragment_id,
        peer_id="peer-1",
        worker_id="worker-1",
        payee_address="0x" + "b" * 40,
        operation="hadamard",
        amount=Decimal(amount),
        status=status,
        created_at=now,
        updated_at=now,
        **fields,
    )


class FakePayouts:
    def __init__(self, committed: Decimal = Decimal("0")) -> None:
        self._committed = committed
        self.recorded: list[FragmentOutcome] = []

    async def committed(self, job_id: str) -> Decimal:
        return self._committed

    async def job_summary(self, job_id: str) -> JobPayoutSummary:
        return JobPayoutSummary(
            job_id=job_id,
            budget=Decimal("5"),
            committed=Decimal("1.5"),
            paid=Decimal("1"),
            pending=Decimal("0.5"),
            withheld_fragments=1,
            intents=(
                _intent("frag-1", IntentStatus.PAID, "1"),
                _intent("frag-2", IntentStatus.ACCRUED, "0.5"),
                _intent(
                    "frag-3",
                    IntentStatus.WITHHELD,
                    "0",
                    reason=WithheldReason.FRAGMENT_FAILED,
                ),
            ),
        )

    async def record_fragment(self, outcome: FragmentOutcome) -> None:
        self.recorded.append(outcome)


def _client(jobs: OwnedJobs, payouts: FakePayouts, meter: Any = None) -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(
        build_circuits_router(job_service=jobs, credit_meter=meter, payout_service=payouts)  # type: ignore[arg-type]
    )
    return TestClient(app)


def test_a_failed_job_is_charged_what_its_workers_earned() -> None:
    meter = RecordingMeter()
    jobs = OwnedJobs(final_status="FAILED")
    response = _client(jobs, FakePayouts(committed=Decimal("1.5")), meter).post(
        SUBMIT, json=CIRCUIT, headers=USER
    )
    assert meter.settled == [(response.json()["job_id"], False, Decimal("1.5"))]


def test_job_payout_summary_lists_every_fragment() -> None:
    jobs = OwnedJobs()
    client = _client(jobs, FakePayouts())
    job_id = client.post(SUBMIT, json=CIRCUIT, headers=USER).json()["job_id"]

    body = client.get(f"/api/v1/jobs/{job_id}/payouts", headers=USER).json()

    assert (body["paid"], body["pending"], body["withheld_fragments"]) == ("1", "0.5", 1)
    assert [(i["fragment_id"], i["status"], i["reason"]) for i in body["intents"]] == [
        ("frag-1", "paid", None),
        ("frag-2", "accrued", None),
        ("frag-3", "withheld", "fragment_failed"),
    ]


def test_job_payouts_are_private_to_the_job_owner() -> None:
    jobs = OwnedJobs()
    client = _client(jobs, FakePayouts())
    job_id = client.post(SUBMIT, json=CIRCUIT, headers=USER).json()["job_id"]

    other = {"Authorization": "Bearer dev-user-2"}
    assert client.get(f"/api/v1/jobs/{job_id}/payouts", headers=other).status_code == 404


def _plan() -> Any:
    return SimpleNamespace(
        fragments={
            "frag-1": SimpleNamespace(raw_text="h q[0]"),
            "frag-2": SimpleNamespace(raw_text="cx q[0],q[1]"),
        },
        assignments={"frag-2": SimpleNamespace(primary_node_id="peer-planned")},
    )


def _service(payouts: Any) -> CircuitJobService:
    service = object.__new__(CircuitJobService)  # the bridge is not needed here
    service.payouts = payouts
    return service


async def test_each_recorded_fragment_becomes_a_payout_outcome() -> None:
    payouts = FakePayouts()
    result = {
        "fragment_id": "frag-1",
        "node_id": "peer-1",
        "status": "SUCCESS",
        "observed_fidelity": 0.97,
    }
    await _service(payouts)._record_payout("job-1", _plan(), result)
    assert payouts.recorded == [
        FragmentOutcome(
            job_id="job-1",
            fragment_id="frag-1",
            peer_id="peer-1",
            operation_text="h q[0]",
            status="completed",
            observed_fidelity=0.97,
        )
    ]


async def test_fragments_a_failed_job_never_ran_go_to_their_planned_node() -> None:
    payouts = FakePayouts()
    await _service(payouts)._record_payout("job-1", _plan(), None, fragment_id="frag-2")
    assert payouts.recorded[0].peer_id == "peer-planned"
    assert payouts.recorded[0].status == "not_run"


async def test_a_payout_error_never_fails_the_job() -> None:
    class Broken(FakePayouts):
        async def record_fragment(self, outcome: FragmentOutcome) -> None:
            raise RuntimeError("database down")

    result = {"fragment_id": "frag-1", "node_id": "peer-1", "status": "SUCCESS"}
    await _service(Broken())._record_payout("job-1", _plan(), result)
