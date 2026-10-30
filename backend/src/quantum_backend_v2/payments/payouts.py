"""Pay-per-fragment worker payouts (#8).

Each recorded fragment result becomes one payout intent, keyed by
``(job, fragment)``, so re-processing a job never pays a fragment twice.
Intents are priced from the worker's registered per-operation price and
reserved against the job's credit hold, so a job never pays out more than
its user put aside. A settler batches a worker's intents into one USDC
transfer once they pass a threshold or an age, and marks them paid only
after the transfer is verified on-chain.

The peer that ran a fragment is mapped to its worker through peer
enrollment: the enrollment owner is the worker who is paid.
"""

from __future__ import annotations

import inspect
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Any

from bson.decimal128 import Decimal128
from pydantic import BaseModel, ConfigDict, Field
from pymongo import ASCENDING, IndexModel
from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.chains.adapter import TransactionVerification
from quantum_backend_v2.payments.ledger import LedgerService

logger = logging.getLogger(__name__)

PAYOUT_INTENTS = "payout_intents"
PAYOUT_BUDGETS = "payout_budgets"
PAYOUT_BATCHES = "payout_batches"
WORKER_PRICING = "worker_pricing"
PEER_ENROLLMENTS = "peer_enrollments"

_ZERO = Decimal("0")

# OpenQASM gate names mapped to the operation types workers price.
OPERATION_TYPES: dict[str, str] = {
    "h": "hadamard",
    "x": "pauli_x",
    "y": "pauli_y",
    "z": "pauli_z",
    "cx": "cnot",
    "cnot": "cnot",
    "cz": "cz",
    "swap": "swap",
    "rx": "rotation_x",
    "ry": "rotation_y",
    "rz": "rotation_z",
    "t": "t_gate",
    "tdg": "t_dagger",
    "s": "s_gate",
    "sdg": "s_dagger",
    "qft": "qft",
    "teleport": "teleport",
    "custom": "custom",
}

# Reputation change per fragment outcome, matching MarketplaceService.
_REPUTATION_SUCCESS = 2.0
_REPUTATION_FAILURE = -5.0
_DEACTIVATE_BELOW = 20.0


def operation_type(raw_text: str) -> str:
    """Operation type of one OpenQASM statement, e.g. ``rx(0.5) q[0]`` -> ``rotation_x``."""
    tokens = raw_text.strip().lower().split()
    if not tokens:
        return "custom"
    return OPERATION_TYPES.get(tokens[0].split("(", 1)[0], "custom")


def intent_key(job_id: str, fragment_id: str) -> str:
    return f"fragment:{job_id}:{fragment_id}"


def _hold_id(job_id: str) -> str:
    # The circuit job's credit hold (see JobCreditMeter).
    return f"job:{job_id}"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _d128(value: Decimal) -> Decimal128:
    return Decimal128(str(value))


def _dec(value: Any) -> Decimal:
    if value is None:
        return _ZERO
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return Decimal(str(value))


class IntentStatus(str, Enum):
    """Lifecycle of a payout intent.

    accrued -> settling -> submitted -> paid. A failed send or a reverted
    transfer returns intents to accrued. withheld intents are never paid.
    """

    ACCRUED = "accrued"
    SETTLING = "settling"
    SUBMITTED = "submitted"
    PAID = "paid"
    WITHHELD = "withheld"


class WithheldReason(str, Enum):
    FRAGMENT_FAILED = "fragment_failed"
    FIDELITY_REJECTED = "fidelity_rejected"
    JOB_FAILED = "job_failed"
    UNKNOWN_WORKER = "unknown_worker"
    UNPRICED = "unpriced"
    NO_BUDGET = "no_budget"
    OVER_BUDGET = "over_budget"


# Reasons that are the worker's fault and cost reputation.
_PENALIZED = {WithheldReason.FRAGMENT_FAILED, WithheldReason.FIDELITY_REJECTED}


class FragmentOutcome(BaseModel):
    """What a circuit job recorded for one fragment."""

    model_config = ConfigDict(frozen=True)

    job_id: str = Field(min_length=1)
    fragment_id: str = Field(min_length=1)
    peer_id: str | None
    operation_text: str = ""
    # "completed", a failure status, or "not_run" for fragments a failed job never reached.
    status: str
    observed_fidelity: float | None = None


class PayoutIntent(BaseModel):
    model_config = ConfigDict(frozen=True)

    intent_key: str
    job_id: str
    fragment_id: str
    peer_id: str | None
    worker_id: str | None
    payee_address: str | None
    operation: str
    amount: Decimal
    status: IntentStatus
    reason: WithheldReason | None = None
    observed_fidelity: float | None = None
    batch_id: str | None = None
    tx_hash: str | None = None
    created_at: datetime
    updated_at: datetime


class JobPayoutSummary(BaseModel):
    """Everything a job owes, has paid and has withheld, fragment by fragment."""

    model_config = ConfigDict(frozen=True)

    job_id: str
    budget: Decimal | None
    committed: Decimal
    paid: Decimal
    pending: Decimal
    withheld_fragments: int
    intents: tuple[PayoutIntent, ...]


class WorkerPayoutTotals(BaseModel):
    model_config = ConfigDict(frozen=True)

    worker_id: str
    paid: Decimal = _ZERO
    pending: Decimal = _ZERO
    paid_fragments: int = 0
    withheld_fragments: int = 0


class FragmentPayoutService:
    """Records one payout intent per fragment and reserves it against the job's budget."""

    def __init__(self, database: Any, ledger: LedgerService, *, min_fidelity: float = 0.0) -> None:
        self._intents = database[PAYOUT_INTENTS]
        self._budgets = database[PAYOUT_BUDGETS]
        self._workers = database[WORKER_PRICING]
        self._enrollments = database[PEER_ENROLLMENTS]
        self._ledger = ledger
        self.min_fidelity = min_fidelity

    async def ensure_indexes(self) -> None:
        await self._intents.create_indexes(
            [
                IndexModel("intent_key", unique=True),
                IndexModel("job_id"),
                IndexModel([("worker_id", ASCENDING), ("status", ASCENDING)]),
                IndexModel("batch_id"),
            ]
        )
        await self._budgets.create_indexes([IndexModel("job_id", unique=True)])

    async def record_fragment(self, outcome: FragmentOutcome) -> PayoutIntent:
        """Record the fragment's payout intent once; replays return the stored intent."""
        key = intent_key(outcome.job_id, outcome.fragment_id)
        existing = await self._intents.find_one({"intent_key": key})
        if existing is not None:
            return _doc_to_intent(existing)

        worker = await self._worker_for_peer(outcome.peer_id)
        operation = operation_type(outcome.operation_text)
        amount, reason = self._price(outcome, worker, operation)
        reserved = False
        if reason is None:
            budget_ok = await self._reserve(outcome.job_id, amount)
            if budget_ok is None:
                reason = WithheldReason.NO_BUDGET
            elif not budget_ok:
                reason = WithheldReason.OVER_BUDGET
            reserved = bool(budget_ok)
        if reason is not None:
            amount = _ZERO

        now = _utc_now()
        intent = PayoutIntent(
            intent_key=key,
            job_id=outcome.job_id,
            fragment_id=outcome.fragment_id,
            peer_id=outcome.peer_id,
            worker_id=worker["worker_id"] if worker else None,
            payee_address=worker.get("wallet_address") if worker else None,
            operation=operation,
            amount=amount,
            status=IntentStatus.WITHHELD if reason else IntentStatus.ACCRUED,
            reason=reason,
            observed_fidelity=outcome.observed_fidelity,
            created_at=now,
            updated_at=now,
        )
        try:
            await self._intents.insert_one(_intent_to_doc(intent))
        except DuplicateKeyError:
            # A concurrent replay recorded this fragment first; give the reservation back.
            if reserved:
                await self._unreserve(outcome.job_id, amount)
            stored = await self._intents.find_one({"intent_key": key})
            assert stored is not None
            return _doc_to_intent(stored)

        if worker is not None and outcome.status != "not_run":
            penalized = reason in _PENALIZED
            await self._adjust_reputation(
                worker["worker_id"], _REPUTATION_FAILURE if penalized else _REPUTATION_SUCCESS
            )
        return intent

    async def committed(self, job_id: str) -> Decimal:
        """Value reserved for this job's workers so far."""
        doc = await self._budgets.find_one({"job_id": job_id})
        return _dec(doc["committed"]) if doc else _ZERO

    async def job_summary(self, job_id: str) -> JobPayoutSummary:
        budget_doc = await self._budgets.find_one({"job_id": job_id})
        budget = (
            _dec(budget_doc["budget"])
            if budget_doc
            else await self._ledger.hold_amount(_hold_id(job_id))
        )
        cursor = self._intents.find({"job_id": job_id}).sort("fragment_id", ASCENDING)
        intents = tuple(_doc_to_intent(doc) for doc in await cursor.to_list(length=None))
        paid = sum((i.amount for i in intents if i.status is IntentStatus.PAID), _ZERO)
        pending = sum(
            (
                i.amount
                for i in intents
                if i.status in {IntentStatus.ACCRUED, IntentStatus.SETTLING, IntentStatus.SUBMITTED}
            ),
            _ZERO,
        )
        return JobPayoutSummary(
            job_id=job_id,
            budget=budget,
            committed=_dec(budget_doc["committed"]) if budget_doc else _ZERO,
            paid=paid,
            pending=pending,
            withheld_fragments=sum(1 for i in intents if i.status is IntentStatus.WITHHELD),
            intents=intents,
        )

    async def worker_totals(self, worker_id: str) -> WorkerPayoutTotals:
        totals: dict[str, Any] = {"worker_id": worker_id}
        pipeline: list[dict[str, Any]] = [
            {"$match": {"worker_id": worker_id}},
            {"$group": {"_id": "$status", "amount": {"$sum": "$amount"}, "count": {"$sum": 1}}},
        ]
        pending = _ZERO
        async for row in await _aggregate(self._intents, pipeline):
            status, amount = row["_id"], _dec(row["amount"])
            if status == IntentStatus.PAID.value:
                totals["paid"] = amount
                totals["paid_fragments"] = row["count"]
            elif status == IntentStatus.WITHHELD.value:
                totals["withheld_fragments"] = row["count"]
            else:
                pending += amount
        totals["pending"] = pending
        return WorkerPayoutTotals(**totals)

    async def _worker_for_peer(self, peer_id: str | None) -> dict[str, Any] | None:
        if not peer_id:
            return None
        enrollment = await self._enrollments.find_one({"peer_id": peer_id})
        owner = enrollment.get("owner_user_id") if enrollment else None
        if not owner:
            return None
        worker: dict[str, Any] | None = await self._workers.find_one({"worker_id": owner})
        return worker

    def _price(
        self, outcome: FragmentOutcome, worker: dict[str, Any] | None, operation: str
    ) -> tuple[Decimal, WithheldReason | None]:
        if outcome.status == "not_run":
            return _ZERO, WithheldReason.JOB_FAILED
        if outcome.status != "completed":
            return _ZERO, WithheldReason.FRAGMENT_FAILED
        if outcome.observed_fidelity is not None and outcome.observed_fidelity < self.min_fidelity:
            return _ZERO, WithheldReason.FIDELITY_REJECTED
        if worker is None or not worker.get("wallet_address"):
            return _ZERO, WithheldReason.UNKNOWN_WORKER
        pricing = worker.get("pricing") or {}
        price = pricing.get(operation, pricing.get("custom"))
        amount = _dec(price) if price is not None else _ZERO
        if amount <= 0:
            return _ZERO, WithheldReason.UNPRICED
        return amount, None

    async def _reserve(self, job_id: str, amount: Decimal) -> bool | None:
        """Reserve ``amount`` of the job's budget. None when the job has no budget."""
        if await self._budgets.find_one({"job_id": job_id}) is None:
            hold = await self._ledger.hold_amount(_hold_id(job_id))
            if hold is None:
                return None
            await self._budgets.update_one(
                {"job_id": job_id},
                {
                    "$setOnInsert": {
                        "job_id": job_id,
                        "budget": _d128(hold),
                        "remaining": _d128(hold),
                        "committed": _d128(_ZERO),
                        "created_at": _utc_now(),
                    }
                },
                upsert=True,
            )
        # The atomic conditional update is what keeps payouts within the budget.
        reserved = await self._budgets.find_one_and_update(
            {"job_id": job_id, "remaining": {"$gte": _d128(amount)}},
            {"$inc": {"remaining": _d128(-amount), "committed": _d128(amount)}},
        )
        return reserved is not None

    async def _unreserve(self, job_id: str, amount: Decimal) -> None:
        await self._budgets.update_one(
            {"job_id": job_id},
            {"$inc": {"remaining": _d128(amount), "committed": _d128(-amount)}},
        )

    async def _adjust_reputation(self, worker_id: str, change: float) -> None:
        score = {"$min": [100.0, {"$max": [0.0, {"$add": ["$reputation_score", change]}]}]}
        await self._workers.update_one(
            {"worker_id": worker_id},
            [
                {"$set": {"reputation_score": score, "updated_at": _utc_now()}},
                {
                    "$set": {
                        "is_active": {
                            "$and": [
                                "$is_active",
                                {"$gte": ["$reputation_score", _DEACTIVATE_BELOW]},
                            ]
                        }
                    }
                },
            ],
        )


# Sends ``amount`` USDC to ``to`` and returns the transaction hash. Raises
# ValueError when nothing was sent; any other error leaves the outcome unknown.
SendPayout = Callable[[str, Decimal, str, dict[str, Any]], Awaitable[str]]
VerifyPayout = Callable[[str, str, Decimal], Awaitable[TransactionVerification]]


class SettlementReport(BaseModel):
    model_config = ConfigDict(frozen=True)

    sent: int = 0
    paid: int = 0
    returned: int = 0
    uncertain: int = 0


class PayoutSettler:
    """Batches accrued intents into on-chain transfers and confirms them by receipt."""

    def __init__(
        self,
        database: Any,
        *,
        send: SendPayout,
        verify: VerifyPayout,
        threshold: Decimal,
        max_age: timedelta,
    ) -> None:
        self._intents = database[PAYOUT_INTENTS]
        self._batches = database[PAYOUT_BATCHES]
        self._workers = database[WORKER_PRICING]
        self._send = send
        self._verify = verify
        self.threshold = threshold
        self.max_age = max_age

    async def ensure_indexes(self) -> None:
        await self._batches.create_indexes(
            [IndexModel("batch_id", unique=True), IndexModel("status")]
        )

    async def run_once(self, *, now: datetime | None = None) -> SettlementReport:
        """Confirm submitted batches, then send every batch that is due."""
        paid, returned, uncertain = await self.confirm_submitted()
        sent, send_uncertain = await self.send_due(now=now or _utc_now())
        return SettlementReport(
            sent=sent, paid=paid, returned=returned, uncertain=uncertain + send_uncertain
        )

    async def send_due(self, *, now: datetime) -> tuple[int, int]:
        pipeline: list[dict[str, Any]] = [
            {"$match": {"status": IntentStatus.ACCRUED.value}},
            {
                "$group": {
                    "_id": {"worker_id": "$worker_id", "payee_address": "$payee_address"},
                    "amount": {"$sum": "$amount"},
                    "oldest": {"$min": "$created_at"},
                    "keys": {"$push": "$intent_key"},
                }
            },
        ]
        sent = uncertain = 0
        async for group in await _aggregate(self._intents, pipeline):
            oldest = group["oldest"]
            if oldest.tzinfo is None:
                oldest = oldest.replace(tzinfo=timezone.utc)
            if _dec(group["amount"]) < self.threshold and now - oldest < self.max_age:
                continue
            outcome = await self._send_batch(
                group["_id"]["worker_id"], group["_id"]["payee_address"], group["keys"]
            )
            sent += outcome == "submitted"
            uncertain += outcome == "uncertain"
        return sent, uncertain

    async def confirm_submitted(self) -> tuple[int, int, int]:
        paid = returned = uncertain = 0
        cursor = self._batches.find({"status": "submitted"})
        for batch in await cursor.to_list(length=None):
            amount = _dec(batch["amount"])
            try:
                check = await self._verify(batch["tx_hash"], batch["payee_address"], amount)
            except Exception:
                logger.exception("could not verify payout batch %s", batch["batch_id"])
                continue
            if check.verified:
                await self._finish(batch, "paid", IntentStatus.PAID)
                await self._workers.update_one(
                    {"worker_id": batch["worker_id"]},
                    {"$inc": {"total_earned": _d128(amount)}, "$set": {"updated_at": _utc_now()}},
                )
                paid += 1
            elif check.status == "failed":
                # A reverted transfer moved nothing, so the intents can be paid again.
                await self._finish(batch, "failed", IntentStatus.ACCRUED)
                returned += 1
            elif check.status == "confirmed":
                # Confirmed, but not the transfer we sent: never pay it again automatically.
                await self._finish(batch, "uncertain", None)
                uncertain += 1
        return paid, returned, uncertain

    async def _send_batch(self, worker_id: str, payee_address: str, keys: list[str]) -> str:
        batch_id = f"wpb-{uuid.uuid4().hex}"
        now = _utc_now()
        # Claim the intents; a concurrent settler may already have taken some.
        await self._intents.update_many(
            {"intent_key": {"$in": keys}, "status": IntentStatus.ACCRUED.value},
            {
                "$set": {
                    "status": IntentStatus.SETTLING.value,
                    "batch_id": batch_id,
                    "updated_at": now,
                }
            },
        )
        claimed = await self._intents.find({"batch_id": batch_id}).to_list(length=None)
        if not claimed:
            return "empty"
        amount = sum((_dec(doc["amount"]) for doc in claimed), _ZERO)
        batch = {
            "batch_id": batch_id,
            "worker_id": worker_id,
            "payee_address": payee_address,
            "amount": _d128(amount),
            "intent_keys": [doc["intent_key"] for doc in claimed],
            "status": "sending",
            "tx_hash": None,
            "created_at": now,
            "updated_at": now,
        }
        await self._batches.insert_one(batch)
        try:
            tx_hash = await self._send(
                payee_address,
                amount,
                f"worker_payout:{batch_id}",
                {"worker_id": worker_id, "batch_id": batch_id, "fragments": len(claimed)},
            )
        except ValueError as exc:
            logger.warning("payout batch %s not sent: %s", batch_id, exc)
            await self._finish(batch, "failed", IntentStatus.ACCRUED, error=str(exc))
            return "failed"
        except Exception as exc:
            # The transfer may have been broadcast: never send these intents again automatically.
            logger.exception("payout batch %s has an unknown outcome", batch_id)
            await self._finish(batch, "uncertain", None, error=str(exc))
            return "uncertain"
        await self._batches.update_one(
            {"batch_id": batch_id},
            {"$set": {"status": "submitted", "tx_hash": tx_hash, "updated_at": _utc_now()}},
        )
        await self._intents.update_many(
            {"batch_id": batch_id},
            {
                "$set": {
                    "status": IntentStatus.SUBMITTED.value,
                    "tx_hash": tx_hash,
                    "updated_at": _utc_now(),
                }
            },
        )
        return "submitted"

    async def _finish(
        self,
        batch: dict[str, Any],
        batch_status: str,
        intent_status: IntentStatus | None,
        *,
        error: str | None = None,
    ) -> None:
        now = _utc_now()
        await self._batches.update_one(
            {"batch_id": batch["batch_id"]},
            {"$set": {"status": batch_status, "error": error, "updated_at": now}},
        )
        if intent_status is None:
            return  # Left in place for an admin to reconcile.
        update: dict[str, Any] = {"$set": {"status": intent_status.value, "updated_at": now}}
        if intent_status is IntentStatus.ACCRUED:
            update["$set"].update({"batch_id": None, "tx_hash": None})
        await self._intents.update_many({"batch_id": batch["batch_id"]}, update)


async def _aggregate(collection: Any, pipeline: list[dict[str, Any]]) -> Any:
    # Motor returns a cursor directly; Async PyMongo returns an awaitable.
    cursor = collection.aggregate(pipeline)
    return await cursor if inspect.isawaitable(cursor) else cursor


def _intent_to_doc(intent: PayoutIntent) -> dict[str, Any]:
    doc = intent.model_dump(mode="python")
    doc["amount"] = _d128(intent.amount)
    doc["status"] = intent.status.value
    doc["reason"] = intent.reason.value if intent.reason else None
    return doc


def _doc_to_intent(doc: dict[str, Any]) -> PayoutIntent:
    fields = {k: v for k, v in doc.items() if k != "_id"}
    fields["amount"] = _dec(fields.get("amount"))
    for name in ("created_at", "updated_at"):
        value = fields.get(name)
        if isinstance(value, datetime) and value.tzinfo is None:
            fields[name] = value.replace(tzinfo=timezone.utc)
    return PayoutIntent(**fields)


__all__ = [
    "FragmentOutcome",
    "FragmentPayoutService",
    "IntentStatus",
    "JobPayoutSummary",
    "OPERATION_TYPES",
    "PayoutIntent",
    "PayoutSettler",
    "SettlementReport",
    "WithheldReason",
    "WorkerPayoutTotals",
    "intent_key",
    "operation_type",
]
