"""Opt-in real MongoDB checks for pay-per-fragment worker payouts (#8).

QB2_MONGODB_TEST_URI=mongodb://127.0.0.1:27017 uv run pytest tests/live -q
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import pytest
from bson.decimal128 import Decimal128
from pymongo import AsyncMongoClient

from quantum_backend_v2.chains.adapter import TransactionVerification
from quantum_backend_v2.payments.credits import JobCreditMeter
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.payments.payouts import (
    FragmentOutcome,
    FragmentPayoutService,
    IntentStatus,
    PayoutSettler,
    WithheldReason,
)

pytestmark = pytest.mark.anyio

D = Decimal
PAYEE = "0x" + "b" * 40


@dataclass
class Env:
    db: Any
    ledger: LedgerService
    payouts: FragmentPayoutService


@pytest.fixture
async def env() -> AsyncIterator[Env]:
    uri = os.getenv("QB2_MONGODB_TEST_URI")
    if not uri:
        pytest.skip("Set QB2_MONGODB_TEST_URI to opt into disposable local MongoDB tests")
    parsed = urlsplit(uri)
    if parsed.scheme != "mongodb" or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        pytest.fail("Live payout tests accept only local MongoDB")
    client: AsyncMongoClient = AsyncMongoClient(uri, serverSelectionTimeoutMS=2000)
    name = f"qmesh_payouts_test_{uuid4().hex}"
    try:
        db = client[name]
        ledger = LedgerService(db)
        await ledger.ensure_indexes()
        payouts = FragmentPayoutService(db, ledger, min_fidelity=0.9)
        await payouts.ensure_indexes()
        await db.peer_enrollments.insert_one({"peer_id": "peer-1", "owner_user_id": "worker-1"})
        await db.worker_pricing.insert_one(
            {
                "worker_id": "worker-1",
                "wallet_address": PAYEE,
                "pricing": {"hadamard": 1.0, "cnot": 2.0},
                "reputation_score": 50.0,
                "is_active": True,
                "total_earned": Decimal128("0"),
            }
        )
        yield Env(db=db, ledger=ledger, payouts=payouts)
    finally:
        await client.drop_database(name)
        await client.close()


async def _fund_job(ledger: LedgerService, job_id: str, budget: str) -> None:
    await ledger.credit("user-1", D(budget), idempotency_key=f"seed:{job_id}")
    await ledger.hold("user-1", D(budget), hold_id=f"job:{job_id}", job_id=job_id)


def _fragment(job_id: str = "job-1", fragment_id: str = "frag-1", **fields: Any) -> FragmentOutcome:
    values: dict[str, Any] = {
        "job_id": job_id,
        "fragment_id": fragment_id,
        "peer_id": "peer-1",
        "operation_text": "h q[0]",
        "status": "completed",
        "observed_fidelity": 0.99,
    }
    values.update(fields)
    return FragmentOutcome(**values)


async def _reputation(env: Env) -> float:
    doc = await env.db.worker_pricing.find_one({"worker_id": "worker-1"})
    return float(doc["reputation_score"])


async def test_reprocessing_a_job_never_double_pays_a_fragment(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    first = await env.payouts.record_fragment(_fragment())
    again = await env.payouts.record_fragment(_fragment())
    assert first.status is IntentStatus.ACCRUED and first.amount == D("1")
    # The replay returns the stored intent (MongoDB keeps milliseconds, so compare fields).
    assert (again.intent_key, again.status, again.amount) == (
        first.intent_key,
        first.status,
        first.amount,
    )
    assert await env.db.payout_intents.count_documents({}) == 1
    assert await env.payouts.committed("job-1") == D("1")
    assert await _reputation(env) == 52.0  # rewarded once, not per replay


async def test_concurrent_replays_record_one_intent_and_reserve_once(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    results = await asyncio.gather(*(env.payouts.record_fragment(_fragment()) for _ in range(10)))
    assert {r.intent_key for r in results} == {"fragment:job-1:frag-1"}
    assert await env.db.payout_intents.count_documents({}) == 1
    assert await env.payouts.committed("job-1") == D("1")


async def test_total_paid_never_exceeds_the_job_budget(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "3")
    outcomes = await asyncio.gather(
        *(env.payouts.record_fragment(_fragment(fragment_id=f"frag-{i}")) for i in range(8))
    )
    accrued = [o for o in outcomes if o.status is IntentStatus.ACCRUED]
    over = [o for o in outcomes if o.reason is WithheldReason.OVER_BUDGET]
    assert len(accrued) == 3 and len(over) == 5
    assert sum(o.amount for o in accrued) == D("3")
    assert await env.payouts.committed("job-1") == D("3")


async def test_jobs_without_a_credit_hold_pay_nothing(env: Env) -> None:
    intent = await env.payouts.record_fragment(_fragment(job_id="free-job"))
    assert intent.status is IntentStatus.WITHHELD
    assert intent.reason is WithheldReason.NO_BUDGET
    assert intent.amount == D("0")


async def test_failed_and_low_fidelity_fragments_are_withheld_and_cost_reputation(
    env: Env,
) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    failed = await env.payouts.record_fragment(_fragment(fragment_id="f-1", status="failed"))
    noisy = await env.payouts.record_fragment(_fragment(fragment_id="f-2", observed_fidelity=0.5))
    assert failed.reason is WithheldReason.FRAGMENT_FAILED
    assert noisy.reason is WithheldReason.FIDELITY_REJECTED
    assert await env.payouts.committed("job-1") == D("0")
    assert await _reputation(env) == 40.0


async def test_fragments_a_failed_job_never_ran_are_withheld_without_a_penalty(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    intent = await env.payouts.record_fragment(_fragment(status="not_run", observed_fidelity=None))
    assert intent.reason is WithheldReason.JOB_FAILED
    assert await _reputation(env) == 50.0


async def test_unenrolled_peers_are_not_paid(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    intent = await env.payouts.record_fragment(_fragment(peer_id="someone-else"))
    assert intent.reason is WithheldReason.UNKNOWN_WORKER
    assert intent.worker_id is None


async def test_job_summary_shows_paid_pending_and_withheld_fragments(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    await env.payouts.record_fragment(_fragment(fragment_id="f-1"))
    await env.payouts.record_fragment(_fragment(fragment_id="f-2", operation_text="cx q[0],q[1]"))
    await env.payouts.record_fragment(_fragment(fragment_id="f-3", status="failed"))
    summary = await env.payouts.job_summary("job-1")
    assert summary.budget == D("10")
    assert summary.committed == D("3")
    assert summary.pending == D("3")
    assert summary.paid == D("0")
    assert summary.withheld_fragments == 1
    assert [i.fragment_id for i in summary.intents] == ["f-1", "f-2", "f-3"]


async def test_a_failed_job_charges_only_what_its_workers_earned(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    await env.payouts.record_fragment(_fragment())
    meter = JobCreditMeter(env.ledger, cost=D("10"))
    payable = await env.payouts.committed("job-1")
    await meter.settle("job-1", succeeded=False, payable=payable)
    await meter.settle("job-1", succeeded=False, payable=payable)  # replay changes nothing
    balance = await env.ledger.balance("user-1")
    assert balance.spent == D("1")
    assert balance.available == D("9")
    assert balance.held == D("0")


@dataclass
class FakeRail:
    sent: list[tuple[str, Decimal, str]] = field(default_factory=list)
    fail_with: Exception | None = None
    verification: TransactionVerification = field(
        default_factory=lambda: TransactionVerification(status="confirmed", transfer_matched=True)
    )

    async def send(self, to: str, amount: Decimal, key: str, metadata: dict[str, Any]) -> str:
        if self.fail_with is not None:
            raise self.fail_with
        self.sent.append((to, amount, key))
        return "0x" + "c" * 64

    async def verify(self, tx_hash: str, to: str, amount: Decimal) -> TransactionVerification:
        return self.verification


def _settler(env: Env, rail: FakeRail, threshold: str = "2") -> PayoutSettler:
    return PayoutSettler(
        env.db,
        send=rail.send,
        verify=rail.verify,
        threshold=D(threshold),
        max_age=timedelta(hours=1),
    )


async def _statuses(env: Env) -> list[str]:
    docs = await env.db.payout_intents.find({}).sort("fragment_id", 1).to_list(length=None)
    return [doc["status"] for doc in docs]


async def test_small_payouts_wait_for_the_threshold_then_go_in_one_batch(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    rail = FakeRail()
    settler = _settler(env, rail)
    await env.payouts.record_fragment(_fragment(fragment_id="f-1"))
    assert (await settler.run_once()).sent == 0  # 1 USDC is below the 2 USDC threshold
    await env.payouts.record_fragment(_fragment(fragment_id="f-2"))
    assert (await settler.run_once()).sent == 1
    assert rail.sent == [(PAYEE, D("2"), rail.sent[0][2])]
    assert rail.sent[0][2].startswith("worker_payout:wpb-")
    assert await _statuses(env) == ["submitted", "submitted"]


async def test_old_payouts_are_sent_below_the_threshold(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    rail = FakeRail()
    await env.payouts.record_fragment(_fragment())
    later = datetime.now(timezone.utc) + timedelta(hours=2)
    assert (await _settler(env, rail).run_once(now=later)).sent == 1


async def test_verified_batches_are_paid_and_counted_as_earnings(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    rail = FakeRail()
    settler = _settler(env, rail)
    for i in range(2):
        await env.payouts.record_fragment(_fragment(fragment_id=f"f-{i}"))
    await settler.run_once()
    report = await settler.run_once()
    assert report.paid == 1
    assert await _statuses(env) == ["paid", "paid"]
    worker = await env.db.worker_pricing.find_one({"worker_id": "worker-1"})
    assert worker["total_earned"].to_decimal() == D("2")
    totals = await env.payouts.worker_totals("worker-1")
    assert (totals.paid, totals.pending, totals.paid_fragments) == (D("2"), D("0"), 2)
    assert (await settler.run_once()).sent == 0  # nothing is paid twice


async def test_a_send_that_definitely_failed_returns_intents_for_the_next_run(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    rail = FakeRail(fail_with=ValueError("insufficient USDC"))
    for i in range(2):
        await env.payouts.record_fragment(_fragment(fragment_id=f"f-{i}"))
    await _settler(env, rail).run_once()
    assert await _statuses(env) == ["accrued", "accrued"]
    rail.fail_with = None
    assert (await _settler(env, rail).run_once()).sent == 1


async def test_a_send_with_an_unknown_outcome_is_never_retried(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    rail = FakeRail(fail_with=TimeoutError("RPC timed out after broadcast"))
    for i in range(2):
        await env.payouts.record_fragment(_fragment(fragment_id=f"f-{i}"))
    report = await _settler(env, rail).run_once()
    assert report.uncertain == 1
    rail.fail_with = None
    assert (await _settler(env, rail).run_once()).sent == 0
    assert await _statuses(env) == ["settling", "settling"]
    assert await env.db.payout_batches.count_documents({"status": "uncertain"}) == 1


async def test_a_reverted_transfer_is_paid_again_later(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    rail = FakeRail(verification=TransactionVerification(status="failed"))
    settler = _settler(env, rail)
    for i in range(2):
        await env.payouts.record_fragment(_fragment(fragment_id=f"f-{i}"))
    await settler.run_once()
    report = await settler.run_once()
    assert report.returned == 1
    assert report.sent == 1  # returned intents go out again in the same run
    assert len(rail.sent) == 2


async def test_a_transfer_that_does_not_match_is_left_for_an_admin(env: Env) -> None:
    await _fund_job(env.ledger, "job-1", "10")
    rail = FakeRail(
        verification=TransactionVerification(status="confirmed", transfer_matched=False)
    )
    settler = _settler(env, rail)
    for i in range(2):
        await env.payouts.record_fragment(_fragment(fragment_id=f"f-{i}"))
    await settler.run_once()
    assert (await settler.run_once()).uncertain == 1
    assert await _statuses(env) == ["submitted", "submitted"]
    assert len(rail.sent) == 1
