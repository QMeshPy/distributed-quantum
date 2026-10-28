"""LedgerService: idempotent payment events and the append-only credit ledger.

Storage
-------
``payment_events``   one document per payment, unique on ``idempotency_key``.
``credit_ledger``    append-only entries, unique on ``idempotency_key``. Never updated.
``credit_holds``     per-hold guard holding the amount still capturable or releasable.
``credit_balances``  per-account guard caching ``available`` and ``held``.

The ledger is the source of truth; a balance is the sum of an account's entries.
The two guard collections exist only to make concurrent holds, captures and
releases safe without multi-document transactions (our MongoDB is a standalone
server): each guard change is one atomic conditional update.

Write ordering is chosen so a crash between steps always fails closed. Value can
end up reserved and unusable, but never spendable twice. The reconciliation
sweep reports any guard that drifted from the ledger.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from bson import Decimal128
from pymongo import ASCENDING, DESCENDING, IndexModel, ReturnDocument
from pymongo.errors import DuplicateKeyError

from quantum_backend_v2.payments.errors import (
    HoldExceededError,
    HoldNotFoundError,
    IdempotencyConflictError,
    InsufficientCreditError,
    InvalidStatusTransitionError,
    PaymentEventNotFoundError,
    PaymentUncertainError,
)
from quantum_backend_v2.payments.models import (
    ALLOWED_TRANSITIONS,
    LEDGER_ASSET,
    BalanceDrift,
    CreditBalance,
    LedgerEntry,
    LedgerEntryType,
    PaymentEvent,
    PaymentEventStatus,
    PaymentPurpose,
    PaymentRail,
    ReconciliationReport,
    StatusChange,
    derive_balance,
    utc_now,
)

logger = logging.getLogger(__name__)

PAYMENT_EVENTS = "payment_events"
CREDIT_LEDGER = "credit_ledger"
CREDIT_HOLDS = "credit_holds"
CREDIT_BALANCES = "credit_balances"

_ZERO = Decimal("0")
_INDEXED_DATABASES: set[str] = set()

# Fields that identify what a payment is. Replaying a key with different values is a bug.
_EVENT_IDENTITY_FIELDS = ("rail", "purpose", "asset", "amount", "ledger_account_id")


def _d128(value: Decimal) -> Decimal128:
    return Decimal128(value)


def _dec(value: Any) -> Decimal:
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return Decimal(str(value))


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


@dataclass(frozen=True)
class RecordResult:
    """Outcome of ``record_event``: the stored event and whether this call created it."""

    event: PaymentEvent
    created: bool


class LedgerService:
    """Payment-event and credit-ledger operations over an async MongoDB database.

    ``database`` may be a Motor or an Async PyMongo database; only the API the
    two share is used.
    """

    def __init__(
        self,
        database: Any,
        *,
        stale_pending_after: timedelta = timedelta(minutes=30),
    ) -> None:
        self._db = database
        self._events = database[PAYMENT_EVENTS]
        self._ledger = database[CREDIT_LEDGER]
        self._holds = database[CREDIT_HOLDS]
        self._balances = database[CREDIT_BALANCES]
        self._stale_pending_after = stale_pending_after

    # ------------------------------------------------------------------
    # Indexes
    # ------------------------------------------------------------------

    async def ensure_indexes(self) -> None:
        """Create the indexes the ledger's guarantees depend on. Safe to repeat."""
        await self._events.create_indexes(
            [
                IndexModel("idempotency_key", unique=True),
                IndexModel("job_id"),
                IndexModel("proposal_id"),
                IndexModel("status"),
                IndexModel([("status", ASCENDING), ("created_at", ASCENDING)]),
            ]
        )
        await self._ledger.create_indexes(
            [
                IndexModel("idempotency_key", unique=True),
                IndexModel([("account_id", ASCENDING), ("created_at", ASCENDING)]),
                IndexModel("hold_id"),
                IndexModel("job_id"),
            ]
        )
        await self._holds.create_indexes([IndexModel("hold_id", unique=True)])
        await self._balances.create_indexes([IndexModel("account_id", unique=True)])
        _INDEXED_DATABASES.add(self._db.name)

    async def _ready(self) -> None:
        # Unique indexes are what make replays safe, so never write without them.
        if self._db.name not in _INDEXED_DATABASES:
            await self.ensure_indexes()

    # ------------------------------------------------------------------
    # Payment events
    # ------------------------------------------------------------------

    async def record_event(
        self,
        *,
        idempotency_key: str,
        rail: PaymentRail,
        purpose: PaymentPurpose,
        amount: Decimal,
        asset: str = LEDGER_ASSET,
        status: PaymentEventStatus = PaymentEventStatus.PENDING,
        chain_id: str | None = None,
        payer_ref: str | None = None,
        payee_ref: str | None = None,
        job_id: str | None = None,
        proposal_id: str | None = None,
        external_ref: str | None = None,
        ledger_account_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> RecordResult:
        """Record a payment once per idempotency key.

        Replaying a key returns the stored event with ``created=False``. Replaying
        a key whose outcome is uncertain raises ``PaymentUncertainError``: the
        caller must not attempt the payment again until an admin reconciles it.

        Pass ``status=CONFIRMED`` only for payments already known to have
        settled; use ``confirm`` for those that settle later so the ledger is
        credited.
        """
        if status not in (PaymentEventStatus.PENDING, PaymentEventStatus.CONFIRMED):
            raise ValueError("new events start as pending or confirmed")
        await self._ready()
        now = utc_now()
        event = PaymentEvent(
            idempotency_key=idempotency_key,
            rail=rail,
            purpose=purpose,
            asset=asset,
            amount=amount,
            status=status,
            chain_id=chain_id,
            payer_ref=payer_ref,
            payee_ref=payee_ref,
            job_id=job_id,
            proposal_id=proposal_id,
            external_ref=external_ref,
            ledger_account_id=ledger_account_id,
            metadata=metadata or {},
            status_history=(StatusChange(status=status, at=now),),
            created_at=now,
            updated_at=now,
            confirmed_at=now if status is PaymentEventStatus.CONFIRMED else None,
        )
        try:
            await self._events.insert_one(_event_to_doc(event))
        except DuplicateKeyError:
            existing = await self._require_event(idempotency_key)
            _check_same_event(existing, event)
            if existing.status is PaymentEventStatus.UNCERTAIN:
                raise PaymentUncertainError(
                    f"payment {idempotency_key} has an uncertain outcome; reconcile it first"
                ) from None
            return RecordResult(event=existing, created=False)

        if status is PaymentEventStatus.CONFIRMED:
            await self._credit_for_event(event)
        return RecordResult(event=event, created=True)

    async def get_event(self, idempotency_key: str) -> PaymentEvent | None:
        doc = await self._events.find_one({"idempotency_key": idempotency_key})
        return _doc_to_event(doc) if doc is not None else None

    async def list_events(
        self,
        *,
        status: PaymentEventStatus | None = None,
        job_id: str | None = None,
        proposal_id: str | None = None,
        limit: int = 50,
    ) -> list[PaymentEvent]:
        query: dict[str, Any] = {}
        if status is not None:
            query["status"] = status.value
        if job_id is not None:
            query["job_id"] = job_id
        if proposal_id is not None:
            query["proposal_id"] = proposal_id
        cursor = self._events.find(query).sort("created_at", DESCENDING).limit(limit)
        return [_doc_to_event(doc) for doc in await cursor.to_list(length=limit)]

    async def confirm(
        self,
        idempotency_key: str,
        *,
        external_ref: str | None = None,
        actor: str | None = None,
    ) -> PaymentEvent:
        """Mark a pending event confirmed and credit its ledger account, if any.

        Calling it again is harmless and finishes a credit a crash interrupted.
        Uncertain events cannot be confirmed here; they go through ``reconcile``.
        """
        event = await self._transition(
            idempotency_key,
            PaymentEventStatus.CONFIRMED,
            allowed_from={PaymentEventStatus.PENDING},
            external_ref=external_ref,
            actor=actor,
        )
        await self._credit_for_event(event)
        return event

    async def mark_uncertain(
        self, idempotency_key: str, *, reason: str, actor: str | None = None
    ) -> PaymentEvent:
        """Flag a pending payment whose outcome is unknown. Blocks automatic retries."""
        event = await self._transition(
            idempotency_key,
            PaymentEventStatus.UNCERTAIN,
            allowed_from={PaymentEventStatus.PENDING},
            reason=reason,
            actor=actor,
        )
        logger.warning("payment %s marked uncertain: %s", idempotency_key, reason)
        return event

    async def fail(
        self, idempotency_key: str, *, reason: str, actor: str | None = None
    ) -> PaymentEvent:
        """Mark a pending payment as definitely not having moved value."""
        return await self._transition(
            idempotency_key,
            PaymentEventStatus.FAILED,
            allowed_from={PaymentEventStatus.PENDING},
            reason=reason,
            actor=actor,
        )

    async def reconcile(
        self,
        idempotency_key: str,
        *,
        outcome: PaymentEventStatus,
        actor: str,
        reason: str,
        external_ref: str | None = None,
    ) -> PaymentEvent:
        """Resolve a pending or uncertain event after a human checked the rail."""
        if outcome not in (PaymentEventStatus.CONFIRMED, PaymentEventStatus.FAILED):
            raise ValueError("reconciliation outcome must be confirmed or failed")
        event = await self._transition(
            idempotency_key,
            outcome,
            allowed_from={PaymentEventStatus.PENDING, PaymentEventStatus.UNCERTAIN},
            external_ref=external_ref,
            reason=reason,
            actor=actor,
        )
        if outcome is PaymentEventStatus.CONFIRMED:
            await self._credit_for_event(event)
        return event

    async def _transition(
        self,
        idempotency_key: str,
        to_status: PaymentEventStatus,
        *,
        allowed_from: set[PaymentEventStatus],
        external_ref: str | None = None,
        reason: str | None = None,
        actor: str | None = None,
    ) -> PaymentEvent:
        from_statuses = [s for s in allowed_from if to_status in ALLOWED_TRANSITIONS[s]]
        now = utc_now()
        change = StatusChange(status=to_status, at=now, reason=reason, actor=actor)
        updates: dict[str, Any] = {"status": to_status.value, "updated_at": now}
        if to_status is PaymentEventStatus.CONFIRMED:
            updates["confirmed_at"] = now
        if external_ref is not None:
            updates["external_ref"] = external_ref

        doc = await self._events.find_one_and_update(
            {
                "idempotency_key": idempotency_key,
                "status": {"$in": [s.value for s in from_statuses]},
            },
            {
                "$set": updates,
                "$push": {
                    "status_history": {**change.model_dump(), "status": to_status.value}
                },
            },
            return_document=ReturnDocument.AFTER,
        )
        if doc is not None:
            return _doc_to_event(doc)

        existing = await self._require_event(idempotency_key)
        if existing.status is to_status:
            return existing
        raise InvalidStatusTransitionError(
            f"payment {idempotency_key} is {existing.status.value}; "
            f"cannot become {to_status.value}"
        )

    async def _require_event(self, idempotency_key: str) -> PaymentEvent:
        event = await self.get_event(idempotency_key)
        if event is None:
            raise PaymentEventNotFoundError(idempotency_key)
        return event

    async def _credit_for_event(self, event: PaymentEvent) -> None:
        if event.ledger_account_id is None or event.status is not PaymentEventStatus.CONFIRMED:
            return
        await self.credit(
            event.ledger_account_id,
            event.amount,
            idempotency_key=f"credit:event:{event.idempotency_key}",
            payment_event_key=event.idempotency_key,
            job_id=event.job_id,
        )

    # ------------------------------------------------------------------
    # Credit ledger
    # ------------------------------------------------------------------

    async def credit(
        self,
        account_id: str,
        amount: Decimal,
        *,
        idempotency_key: str,
        payment_event_key: str | None = None,
        job_id: str | None = None,
        memo: str | None = None,
    ) -> LedgerEntry:
        """Add value to an account once per idempotency key."""
        await self._ready()
        entry = _new_entry(
            idempotency_key=idempotency_key,
            account_id=account_id,
            entry_type=LedgerEntryType.CREDIT,
            amount=amount,
            payment_event_key=payment_event_key,
            job_id=job_id,
            memo=memo,
        )
        existing = await self._existing_entry(entry)
        if existing is not None:
            return existing
        # Ledger first, guard second: a crash in between under-reports the
        # available balance, which is safe.
        stored = await self._insert_entry(entry)
        if stored is not entry:
            return stored
        await self._inc_balance(account_id, available=amount)
        return entry

    async def hold(
        self,
        account_id: str,
        amount: Decimal,
        *,
        hold_id: str,
        job_id: str | None = None,
        memo: str | None = None,
    ) -> LedgerEntry:
        """Reserve credit for later capture. One hold per ``hold_id``."""
        await self._ready()
        entry = _new_entry(
            idempotency_key=f"hold:{hold_id}",
            account_id=account_id,
            entry_type=LedgerEntryType.HOLD,
            amount=amount,
            hold_id=hold_id,
            job_id=job_id,
            memo=memo,
        )
        existing = await self._existing_entry(entry)
        if existing is not None:
            return existing

        # Guard first: the atomic conditional update is what stops overspending.
        reserved = await self._balances.find_one_and_update(
            {"account_id": account_id, "available": {"$gte": _d128(amount)}},
            {"$inc": {"available": _d128(-amount), "held": _d128(amount)}},
        )
        if reserved is None:
            raise InsufficientCreditError(f"account {account_id} cannot cover {amount}")

        stored = await self._insert_entry(entry)
        if stored is not entry:
            # A concurrent call with the same hold id won; give the reservation back.
            await self._inc_balance(account_id, available=amount, held=-amount)
            return stored
        await self._insert_hold(entry)
        return entry

    async def capture(
        self,
        hold_id: str,
        amount: Decimal | None = None,
        *,
        idempotency_key: str,
        memo: str | None = None,
    ) -> LedgerEntry | None:
        """Spend part of a hold, or everything left when ``amount`` is None.

        Returns None when a full capture finds nothing left to spend.
        """
        await self._ready()
        hold = await self._get_hold(hold_id)
        replay = await self._replayed(
            idempotency_key, LedgerEntryType.CAPTURE, hold_id, amount
        )
        if replay is not None:
            return replay

        try:
            if amount is None:
                amount = await self._take_rest_of_hold(hold_id)
                if amount == _ZERO:
                    # Nothing left, possibly because a concurrent replay took it.
                    return await self._replayed(
                        idempotency_key, LedgerEntryType.CAPTURE, hold_id, None
                    )
            else:
                await self._take_from_hold(hold_id, amount)
        except HoldExceededError:
            # A concurrent replay of this same capture may have used the hold up.
            replay = await self._replayed(
                idempotency_key, LedgerEntryType.CAPTURE, hold_id, amount
            )
            if replay is not None:
                return replay
            raise

        entry = _new_entry(
            idempotency_key=idempotency_key,
            account_id=hold["account_id"],
            entry_type=LedgerEntryType.CAPTURE,
            amount=amount,
            hold_id=hold_id,
            job_id=hold.get("job_id"),
            memo=memo,
        )
        stored = await self._insert_entry(entry)
        if stored is not entry:
            await self._return_to_hold(hold_id, amount)
            return stored
        await self._inc_balance(entry.account_id, held=-amount)
        return entry

    async def release(
        self,
        hold_id: str,
        amount: Decimal | None = None,
        *,
        idempotency_key: str,
        memo: str | None = None,
    ) -> LedgerEntry | None:
        """Return part of a hold, or everything left when ``amount`` is None.

        Returns None when a full release finds nothing left to return.
        """
        await self._ready()
        hold = await self._get_hold(hold_id)
        replay = await self._replayed(idempotency_key, LedgerEntryType.RELEASE, hold_id, amount)
        if replay is not None:
            return replay

        try:
            if amount is None:
                amount = await self._take_rest_of_hold(hold_id)
                if amount == _ZERO:
                    # Nothing left, possibly because a concurrent replay took it.
                    return await self._replayed(
                        idempotency_key, LedgerEntryType.RELEASE, hold_id, None
                    )
            else:
                await self._take_from_hold(hold_id, amount)
        except HoldExceededError:
            replay = await self._replayed(idempotency_key, LedgerEntryType.RELEASE, hold_id, amount)
            if replay is not None:
                return replay
            raise

        entry = _new_entry(
            idempotency_key=idempotency_key,
            account_id=hold["account_id"],
            entry_type=LedgerEntryType.RELEASE,
            amount=amount,
            hold_id=hold_id,
            job_id=hold.get("job_id"),
            memo=memo,
        )
        stored = await self._insert_entry(entry)
        if stored is not entry:
            await self._return_to_hold(hold_id, amount)
            return stored
        await self._inc_balance(entry.account_id, available=amount, held=-amount)
        return entry

    async def hold_amount(self, hold_id: str) -> Decimal | None:
        """The amount originally held under ``hold_id``, or None when there is no such hold."""
        doc = await self._ledger.find_one(
            {"hold_id": hold_id, "entry_type": LedgerEntryType.HOLD.value}
        )
        return _dec(doc["amount"]) if doc is not None else None

    async def balance(self, account_id: str) -> CreditBalance:
        """Derive the balance by summing every ledger entry for the account."""
        cursor = self._ledger.find({"account_id": account_id}).sort("created_at", ASCENDING)
        entries = [_doc_to_entry(doc) for doc in await cursor.to_list(length=None)]
        return derive_balance(account_id, entries)

    async def entries(self, account_id: str) -> list[LedgerEntry]:
        cursor = self._ledger.find({"account_id": account_id}).sort("created_at", ASCENDING)
        return [_doc_to_entry(doc) for doc in await cursor.to_list(length=None)]

    async def _existing_entry(self, entry: LedgerEntry) -> LedgerEntry | None:
        doc = await self._ledger.find_one({"idempotency_key": entry.idempotency_key})
        if doc is None:
            return None
        existing = _doc_to_entry(doc)
        _check_same_entry(existing, entry)
        return existing

    async def _insert_entry(self, entry: LedgerEntry) -> LedgerEntry:
        """Insert, or return the entry a concurrent writer stored under the same key."""
        try:
            await self._ledger.insert_one(_entry_to_doc(entry))
        except DuplicateKeyError:
            existing = await self._existing_entry(entry)
            if existing is None:  # pragma: no cover - unique index guarantees a winner
                raise
            return existing
        return entry

    async def _inc_balance(
        self, account_id: str, *, available: Decimal = _ZERO, held: Decimal = _ZERO
    ) -> None:
        update = {"$inc": {"available": _d128(available), "held": _d128(held)}}
        try:
            await self._balances.update_one({"account_id": account_id}, update, upsert=True)
        except DuplicateKeyError:
            # Two first-time upserts raced; the document exists now.
            await self._balances.update_one({"account_id": account_id}, update)

    async def _insert_hold(self, entry: LedgerEntry) -> None:
        try:
            await self._holds.insert_one(
                {
                    "hold_id": entry.hold_id,
                    "account_id": entry.account_id,
                    "amount": _d128(entry.amount),
                    "remaining": _d128(entry.amount),
                    "job_id": entry.job_id,
                    "created_at": entry.created_at,
                }
            )
        except DuplicateKeyError:
            pass  # Rebuilt by _get_hold after an interrupted hold; already correct.

    async def _get_hold(self, hold_id: str) -> dict[str, Any]:
        doc = await self._holds.find_one({"hold_id": hold_id})
        if doc is not None:
            return doc
        # The hold entry may exist without its guard if a crash hit between the
        # two inserts. Rebuild the guard from the ledger, the source of truth.
        hold_doc = await self._ledger.find_one(
            {"hold_id": hold_id, "entry_type": LedgerEntryType.HOLD.value}
        )
        if hold_doc is None:
            raise HoldNotFoundError(hold_id)
        hold_entry = _doc_to_entry(hold_doc)
        used = _ZERO
        cursor = self._ledger.find(
            {
                "hold_id": hold_id,
                "entry_type": {
                    "$in": [LedgerEntryType.CAPTURE.value, LedgerEntryType.RELEASE.value]
                },
            }
        )
        for doc in await cursor.to_list(length=None):
            used += _dec(doc["amount"])
        await self._holds.update_one(
            {"hold_id": hold_id},
            {
                "$setOnInsert": {
                    "account_id": hold_entry.account_id,
                    "amount": _d128(hold_entry.amount),
                    "remaining": _d128(hold_entry.amount - used),
                    "job_id": hold_entry.job_id,
                    "created_at": hold_entry.created_at,
                }
            },
            upsert=True,
        )
        rebuilt = await self._holds.find_one({"hold_id": hold_id})
        if rebuilt is None:  # pragma: no cover - the upsert above created it
            raise HoldNotFoundError(hold_id)
        return rebuilt

    async def _replayed(
        self,
        idempotency_key: str,
        entry_type: LedgerEntryType,
        hold_id: str,
        amount: Decimal | None,
    ) -> LedgerEntry | None:
        """The entry already stored under this key, checked to be the same operation."""
        doc = await self._ledger.find_one({"idempotency_key": idempotency_key})
        if doc is None:
            return None
        stored = _doc_to_entry(doc)
        if (
            stored.entry_type is not entry_type
            or stored.hold_id != hold_id
            or (amount is not None and stored.amount != amount)
        ):
            raise IdempotencyConflictError(
                f"ledger key {idempotency_key} was used for a different entry"
            )
        return stored

    async def _return_to_hold(self, hold_id: str, amount: Decimal) -> None:
        await self._holds.update_one({"hold_id": hold_id}, {"$inc": {"remaining": _d128(amount)}})

    async def _take_from_hold(self, hold_id: str, amount: Decimal) -> None:
        taken = await self._holds.find_one_and_update(
            {"hold_id": hold_id, "remaining": {"$gte": _d128(amount)}},
            {"$inc": {"remaining": _d128(-amount)}},
        )
        if taken is None:
            raise HoldExceededError(f"hold {hold_id} has less than {amount} left")

    async def _take_rest_of_hold(self, hold_id: str) -> Decimal:
        # Compare-and-set on the observed remainder so a concurrent capture or
        # release can never make this return more than is actually left.
        for _ in range(5):
            doc = await self._holds.find_one({"hold_id": hold_id})
            if doc is None:
                raise HoldNotFoundError(hold_id)
            remaining = _dec(doc["remaining"])
            if remaining <= _ZERO:
                return _ZERO
            taken = await self._holds.find_one_and_update(
                {"hold_id": hold_id, "remaining": _d128(remaining)},
                {"$inc": {"remaining": _d128(-remaining)}},
            )
            if taken is not None:
                return remaining
        raise HoldExceededError(f"hold {hold_id} kept changing; retry the release")

    # ------------------------------------------------------------------
    # Reconciliation
    # ------------------------------------------------------------------

    async def run_reconciliation(self, *, now: datetime | None = None) -> ReconciliationReport:
        """One sweep: flag stale pending payments and report balance-guard drift.

        A pending event with no external reference (no tx hash, no Stripe id)
        that is older than ``stale_pending_after`` has an unknown outcome, so it
        becomes uncertain. Pending events that carry a reference are awaiting
        confirmation on their rail and are left alone. Drift is reported, not
        repaired, so an operator can see why it happened.
        """
        await self._ready()
        now = now or utc_now()
        cutoff = now - self._stale_pending_after
        stale_cursor = self._events.find(
            {
                "status": PaymentEventStatus.PENDING.value,
                "external_ref": None,
                "created_at": {"$lt": cutoff},
            }
        )
        marked: list[str] = []
        for doc in await stale_cursor.to_list(length=None):
            key = doc["idempotency_key"]
            try:
                await self.mark_uncertain(
                    key,
                    reason=f"no outcome recorded within {self._stale_pending_after}",
                    actor="reconciler",
                )
            except InvalidStatusTransitionError:
                continue  # Settled while the sweep was running.
            marked.append(key)

        drifted: list[BalanceDrift] = []
        account_ids = set(await self._ledger.distinct("account_id"))
        account_ids |= set(await self._balances.distinct("account_id"))
        for account_id in sorted(account_ids):
            ledger_balance = await self.balance(account_id)
            guard = await self._balances.find_one({"account_id": account_id}) or {}
            guard_available = _dec(guard.get("available", _ZERO))
            guard_held = _dec(guard.get("held", _ZERO))
            if guard_available != ledger_balance.available or guard_held != ledger_balance.held:
                drifted.append(
                    BalanceDrift(
                        account_id=account_id,
                        ledger=ledger_balance,
                        guard_available=guard_available,
                        guard_held=guard_held,
                    )
                )
        if drifted:
            logger.error("credit balance drift on %d account(s)", len(drifted))
        return ReconciliationReport(
            marked_uncertain=tuple(marked), drifted_accounts=tuple(drifted), ran_at=now
        )


# ----------------------------------------------------------------------
# Document mapping
# ----------------------------------------------------------------------


def _new_entry(**fields: Any) -> LedgerEntry:
    return LedgerEntry(entry_id=uuid.uuid4().hex, **fields)


def _event_to_doc(event: PaymentEvent) -> dict[str, Any]:
    doc = event.model_dump(mode="python")
    doc["rail"] = event.rail.value
    doc["purpose"] = event.purpose.value
    doc["status"] = event.status.value
    doc["amount"] = _d128(event.amount)
    doc["status_history"] = [
        {**change.model_dump(mode="python"), "status": change.status.value}
        for change in event.status_history
    ]
    return doc


def _doc_to_event(doc: dict[str, Any]) -> PaymentEvent:
    data = {key: value for key, value in doc.items() if key != "_id"}
    data["amount"] = _dec(data["amount"])
    for field in ("created_at", "updated_at", "confirmed_at"):
        data[field] = _aware(data.get(field))
    data["status_history"] = tuple(
        StatusChange(**{**change, "at": _aware(change["at"])})
        for change in data.get("status_history", [])
    )
    return PaymentEvent.model_validate(data)


def _entry_to_doc(entry: LedgerEntry) -> dict[str, Any]:
    doc = entry.model_dump(mode="python")
    doc["entry_type"] = entry.entry_type.value
    doc["amount"] = _d128(entry.amount)
    return doc


def _doc_to_entry(doc: dict[str, Any]) -> LedgerEntry:
    data = {key: value for key, value in doc.items() if key != "_id"}
    data["amount"] = _dec(data["amount"])
    data["created_at"] = _aware(data.get("created_at"))
    return LedgerEntry.model_validate(data)


def _check_same_event(existing: PaymentEvent, new: PaymentEvent) -> None:
    for field in _EVENT_IDENTITY_FIELDS:
        if getattr(existing, field) != getattr(new, field):
            raise IdempotencyConflictError(
                f"payment {new.idempotency_key} was recorded with a different {field}"
            )


def _check_same_entry(existing: LedgerEntry, new: LedgerEntry) -> None:
    if (
        existing.account_id != new.account_id
        or existing.entry_type is not new.entry_type
        or existing.amount != new.amount
        or existing.hold_id != new.hold_id
    ):
        raise IdempotencyConflictError(
            f"ledger key {new.idempotency_key} was used for a different entry"
        )
