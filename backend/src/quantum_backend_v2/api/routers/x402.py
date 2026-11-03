"""Internal pricing and payment receipts for the x402 gateway."""

import os
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.api.deps.marketplace import MarketplaceServiceDep
from quantum_backend_v2.api.deps.x402_gateway import build_x402_gateway_guard
from quantum_backend_v2.application.parity import CircuitJobService
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.payments.models import PaymentPurpose, PaymentRail
from quantum_backend_v2.payments.x402_pricing import quote_circuit


class QuoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    circuit: str = Field(min_length=10, max_length=100_000)


class PaymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    payment_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    network: str = Field(min_length=1, max_length=128)
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=6)
    asset: str = Field(min_length=1, max_length=128)
    payer: str = Field(min_length=1, max_length=256)
    receiver: str = Field(min_length=1, max_length=256)
    job_id: str = Field(min_length=1, max_length=128)
    status: Literal["pending", "confirmed", "uncertain", "failed"]
    transaction: str | None = Field(default=None, min_length=1, max_length=256)


def build_x402_router(
    *,
    gateway_secret: str | None,
    ledger: LedgerService | None,
    job_service: CircuitJobService | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/internal/x402", include_in_schema=False)
    if gateway_secret is None:
        return router

    authenticate = build_x402_gateway_guard(gateway_secret)

    @router.post("/circuits/estimate", dependencies=[Depends(authenticate)])
    async def estimate(body: QuoteRequest, marketplace: MarketplaceServiceDep) -> dict[str, str]:
        try:
            return await quote_circuit(
                body.circuit,
                marketplace,
                floor=Decimal(os.getenv("QB2_X402_PRICE_FLOOR", "0.01")),
                cap=Decimal(os.getenv("QB2_X402_PRICE_CAP", "1.00")),
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except (RuntimeError, ArithmeticError) as exc:
            raise HTTPException(503, "Circuit pricing is temporarily unavailable.") from exc

    @router.post("/payments", dependencies=[Depends(authenticate)])
    async def payment(body: PaymentRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
        if ledger is None:
            raise HTTPException(503, "Payment storage is unavailable.")
        if body.status == "confirmed" and body.transaction is None:
            raise HTTPException(422, "A settled transaction reference is required.")
        key = f"x402:{body.payment_id}"
        if body.status == "pending":
            recorded = await ledger.record_event(
                idempotency_key=key,
                rail=PaymentRail.X402,
                purpose=PaymentPurpose.JOB,
                amount=body.amount,
                chain_id=body.network,
                payer_ref=body.payer,
                payee_ref=body.receiver,
                job_id=body.job_id,
                metadata={"token_asset": body.asset},
            )
            event = recorded.event
        elif body.status == "confirmed":
            event = await ledger.confirm(key, external_ref=body.transaction, actor="x402-gateway")
            if job_service is not None and event.job_id is not None:
                if await job_service.activate_paid_job(event.job_id):
                    background_tasks.add_task(job_service.process, event.job_id)
        elif body.status == "uncertain":
            event = await ledger.mark_uncertain(
                key, reason="Settlement outcome requires reconciliation.", actor="x402-gateway"
            )
        else:
            event = await ledger.fail(key, reason="Payment was not settled.", actor="x402-gateway")
        return {"payment_id": body.payment_id, "status": event.status.value}

    return router
