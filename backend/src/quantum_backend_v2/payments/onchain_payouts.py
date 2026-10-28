"""Sends and verifies worker payout batches through the wallet service (#8)."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from decimal import Decimal
from typing import Any

from quantum_backend_v2.chains.adapter import (
    EvmRpcAdapter,
    StablecoinTransfer,
    TransactionVerification,
)
from quantum_backend_v2.payments.models import PaymentPurpose
from quantum_backend_v2.payments.payouts import SendPayout, VerifyPayout


def wallet_payout_rail(
    wallet_service: Callable[[], Any], *, from_address: str
) -> tuple[SendPayout, VerifyPayout]:
    """USDC transfers from the platform payout wallet, confirmed by receipt.

    ``wallet_service`` returns the app's AgentKitService; it is only built when
    the first batch is due, so the app starts without wallet credentials.
    """

    async def send(to: str, amount: Decimal, idempotency_key: str, metadata: dict[str, Any]) -> str:
        result = await wallet_service().transfer_usdc(
            from_address=from_address,
            to_address=to,
            amount=amount,
            metadata={**metadata, "type": "worker_payout", "idempotency_key": idempotency_key},
            purpose=PaymentPurpose.WORKER_PAYOUT,
        )
        return str(result["transaction_hash"])

    async def verify(tx_hash: str, to: str, amount: Decimal) -> TransactionVerification:
        service = wallet_service()
        adapter = EvmRpcAdapter(service.chain, service.rpc_client())
        expected = StablecoinTransfer(sender=from_address, recipient=to, amount=amount)
        # Web3 calls block, so keep them off the event loop.
        return await asyncio.to_thread(
            adapter.verify_transaction, tx_hash, expected_transfer=expected
        )

    return send, verify
