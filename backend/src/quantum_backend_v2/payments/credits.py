"""Prepaid credits: Stripe-purchased packs and per-job spending (#10, #76).

One credit is one USDC in the ledger, so card-bought, stablecoin-bought and
on-chain credits are interchangeable.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.payments.ledger import LedgerService, RecordResult
from quantum_backend_v2.payments.models import (
    PaymentEventStatus,
    PaymentPurpose,
    PaymentRail,
)


def card_purchase_key(checkout_session_id: str) -> str:
    # Keyed on the Checkout Session, not the Stripe event: an asynchronously paid
    # session produces two different events for the same payment.
    return f"stripe:checkout:{checkout_session_id}"


# Stripe's payment method type for a paid session, mapped to the ledger rail.
StripePaymentMethod = Literal["card", "crypto"]

_RAILS: dict[str, PaymentRail] = {
    "card": PaymentRail.CARD,
    "crypto": PaymentRail.STABLECOIN,
}


class CreditPurchase(BaseModel):
    """A paid Stripe Checkout Session for a credit pack."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    checkout_session_id: str = Field(pattern=r"^cs_[A-Za-z0-9_]+$", max_length=255)
    account_id: str = Field(min_length=1, max_length=255)
    credits: Decimal = Field(gt=0, le=Decimal("100000"), decimal_places=6)
    stripe_event_id: str | None = Field(default=None, max_length=255)
    price_id: str | None = Field(default=None, max_length=255)
    payment_method: StripePaymentMethod = "card"


async def record_credit_purchase(ledger: LedgerService, purchase: CreditPurchase) -> RecordResult:
    """Record a paid credit pack and credit the buyer, once per Checkout Session."""
    result = await ledger.record_event(
        idempotency_key=card_purchase_key(purchase.checkout_session_id),
        rail=_RAILS[purchase.payment_method],
        purpose=PaymentPurpose.CREDIT_PURCHASE,
        amount=purchase.credits,
        status=PaymentEventStatus.CONFIRMED,
        payer_ref=purchase.account_id,
        external_ref=purchase.checkout_session_id,
        ledger_account_id=purchase.account_id,
        metadata={
            "stripe_event_id": purchase.stripe_event_id,
            "price_id": purchase.price_id,
        },
    )
    # A redelivered webhook finishes a credit that a crash interrupted; confirming
    # an already-credited event changes nothing.
    await ledger.confirm(result.event.idempotency_key)
    return result


class JobCreditMeter:
    """Charges a flat number of credits per job: held on submit, settled on finish."""

    def __init__(self, ledger: LedgerService, *, cost: Decimal) -> None:
        if cost <= 0:
            raise ValueError("job cost must be positive; leave metering off instead")
        self.ledger = ledger
        self.cost = cost

    async def reserve(self, account_id: str, job_id: str) -> None:
        """Hold the job's cost. Raises InsufficientCreditError when it cannot be covered."""
        await self.ledger.hold(account_id, self.cost, hold_id=_hold_id(job_id), job_id=job_id)

    async def settle(
        self, job_id: str, *, succeeded: bool, payable: Decimal = Decimal("0")
    ) -> None:
        """Spend the hold for a completed job, or return it for a failed one.

        A failed job still spends ``payable``: what its workers earned for the
        fragments they finished (#8). Only the rest is returned.
        """
        if succeeded:
            await self.ledger.capture(_hold_id(job_id), idempotency_key=f"capture:job:{job_id}")
            return
        if payable > 0:
            await self.ledger.capture(
                _hold_id(job_id), payable, idempotency_key=f"capture:job:{job_id}"
            )
        await self.ledger.release(_hold_id(job_id), idempotency_key=f"release:job:{job_id}")


def _hold_id(job_id: str) -> str:
    return f"job:{job_id}"
