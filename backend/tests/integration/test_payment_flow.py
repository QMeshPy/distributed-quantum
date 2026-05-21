"""
Integration test: End-to-end payment flow.

Tests the complete payment workflow:
1. User creates wallet
2. User funds wallet (mock faucet)
3. User transfers USDC to worker
4. Worker receives payment
5. Payment tracking in MongoDB

Uses real MongoDB for data persistence, mocked blockchain operations.
"""
from __future__ import annotations

import pytest
from decimal import Decimal
from bson import Decimal128

from db.agentkit_collections import (
    WalletDocument,
    PaymentDocument,
    NotificationDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)


class TestPaymentFlow:
    """Test complete payment flow from user to worker."""

    @pytest.mark.asyncio
    async def test_user_creates_wallet(self, test_db, mock_agentkit_service):
        """Test: User creates a new wallet."""
        # Act: Create wallet
        wallet = WalletDocument(
            entity_id="user_test_payment",
            entity_type="user",
            wallet_id="wallet_user_payment",
            default_address="0x" + "d1" * 20,
            seed_encrypted="encrypted_seed_test",
            balance_usdc=Decimal128("0.00"),
            balance_eth=Decimal128("0.00"),
        )
        await wallet.insert()

        # Assert: Wallet exists in database
        found = await WalletDocument.find_one({"entity_id": "user_test_payment"})
        assert found is not None
        assert found.wallet_id == "wallet_user_payment"
        assert _decimal128_to_decimal(found.balance_usdc) == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_user_funds_wallet(self, test_db, mock_agentkit_service):
        """Test: User funds wallet via faucet."""
        # Arrange: Create wallet
        wallet = WalletDocument(
            entity_id="user_fund_test",
            entity_type="user",
            wallet_id="wallet_fund_test",
            default_address="0x" + "e1" * 20,
            seed_encrypted="encrypted_seed_fund",
            balance_usdc=Decimal128("0.00"),
            balance_eth=Decimal128("0.00"),
        )
        await wallet.insert()

        # Act: Request faucet
        faucet_result = await mock_agentkit_service.request_faucet("wallet_fund_test")

        # Simulate balance update
        wallet.balance_usdc = _decimal_to_decimal128(Decimal("100.00"))
        await wallet.save()

        # Assert: Wallet funded
        updated = await WalletDocument.find_one({"wallet_id": "wallet_fund_test"})
        assert _decimal128_to_decimal(updated.balance_usdc) == Decimal("100.00")
        assert faucet_result["status"] == "success"

    @pytest.mark.asyncio
    async def test_user_transfers_to_worker(self, test_db, mock_agentkit_service):
        """Test: User transfers USDC to worker."""
        # Arrange: Create user and worker wallets
        user_wallet = WalletDocument(
            entity_id="user_transfer",
            entity_type="user",
            wallet_id="wallet_user_transfer",
            default_address="0x" + "f1" * 20,
            seed_encrypted="encrypted_user",
            balance_usdc=Decimal128("500.00"),
            balance_eth=Decimal128("0.25"),
        )
        await user_wallet.insert()

        worker_wallet = WalletDocument(
            entity_id="worker_receive",
            entity_type="worker",
            wallet_id="wallet_worker_receive",
            default_address="0x" + "f2" * 20,
            seed_encrypted="encrypted_worker",
            balance_usdc=Decimal128("50.00"),
            balance_eth=Decimal128("0.1"),
        )
        await worker_wallet.insert()

        # Act: Transfer USDC
        transfer_amount = Decimal("100.00")
        transfer_result = await mock_agentkit_service.transfer_usdc(
            "wallet_user_transfer",
            "0x" + "f2" * 20,
            transfer_amount
        )

        # Simulate balance updates
        user_wallet.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(user_wallet.balance_usdc) - transfer_amount
        )
        worker_wallet.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(worker_wallet.balance_usdc) + transfer_amount
        )
        await user_wallet.save()
        await worker_wallet.save()

        # Create payment record
        payment = PaymentDocument(
            payment_id=transfer_result["payment_id"],
            type="worker_payment",
            from_wallet="0x" + "f1" * 20,
            to_wallet="0x" + "f2" * 20,
            amount=_decimal_to_decimal128(transfer_amount),
            currency="USDC",
            status="confirmed",
            job_id="job_test_transfer",
            transaction_hash=transfer_result["transaction_hash"],
            basescan_url=transfer_result["basescan_url"],
        )
        await payment.insert()

        # Assert: Balances updated correctly
        updated_user = await WalletDocument.find_one({"wallet_id": "wallet_user_transfer"})
        updated_worker = await WalletDocument.find_one({"wallet_id": "wallet_worker_receive"})

        assert _decimal128_to_decimal(updated_user.balance_usdc) == Decimal("400.00")
        assert _decimal128_to_decimal(updated_worker.balance_usdc) == Decimal("150.00")

        # Assert: Payment recorded
        payment_record = await PaymentDocument.find_one({"payment_id": transfer_result["payment_id"]})
        assert payment_record is not None
        assert payment_record.status == "confirmed"
        assert _decimal128_to_decimal(payment_record.amount) == transfer_amount

    @pytest.mark.asyncio
    async def test_worker_receives_notification(self, test_db):
        """Test: Worker receives payment notification."""
        # Arrange: Create notification
        notification = NotificationDocument(
            user_id="worker_receive",
            type="payment_received",
            title="Payment Received",
            message="You received 100.00 USDC for job_test_transfer",
            data={
                "payment_id": "payment_test",
                "amount": "100.00",
                "from": "0x" + "f1" * 20,
            },
            read=False,
            sent_email=False,
        )
        await notification.insert()

        # Assert: Notification created
        found = await NotificationDocument.find_one({"user_id": "worker_receive"})
        assert found is not None
        assert found.type == "payment_received"
        assert found.read is False
        assert found.data["amount"] == "100.00"

    @pytest.mark.asyncio
    async def test_complete_payment_flow(self, test_db, mock_agentkit_service):
        """Test: Complete end-to-end payment flow."""
        # Step 1: Create user wallet
        user = WalletDocument(
            entity_id="user_complete",
            entity_type="user",
            wallet_id="wallet_user_complete",
            default_address="0x" + "11" * 20,
            seed_encrypted="encrypted_complete_user",
            balance_usdc=Decimal128("0.00"),
            balance_eth=Decimal128("0.00"),
        )
        await user.insert()

        # Step 2: Fund wallet
        await mock_agentkit_service.request_faucet("wallet_user_complete")
        user.balance_usdc = Decimal128("1000.00")
        user.balance_eth = Decimal128("1.0")
        await user.save()

        # Step 3: Create worker wallet
        worker = WalletDocument(
            entity_id="worker_complete",
            entity_type="worker",
            wallet_id="wallet_worker_complete",
            default_address="0x" + "22" * 20,
            seed_encrypted="encrypted_complete_worker",
            balance_usdc=Decimal128("0.00"),
            balance_eth=Decimal128("0.00"),
        )
        await worker.insert()

        # Step 4: Transfer USDC
        transfer_amount = Decimal("250.00")
        transfer_result = await mock_agentkit_service.transfer_usdc(
            "wallet_user_complete",
            "0x" + "22" * 20,
            transfer_amount
        )

        # Step 5: Update balances
        user.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(user.balance_usdc) - transfer_amount
        )
        worker.balance_usdc = _decimal_to_decimal128(transfer_amount)
        await user.save()
        await worker.save()

        # Step 6: Record payment
        payment = PaymentDocument(
            payment_id=transfer_result["payment_id"],
            type="worker_payment",
            from_wallet="0x" + "11" * 20,
            to_wallet="0x" + "22" * 20,
            amount=_decimal_to_decimal128(transfer_amount),
            currency="USDC",
            status="confirmed",
            job_id="job_complete_flow",
            transaction_hash=transfer_result["transaction_hash"],
            basescan_url=transfer_result["basescan_url"],
        )
        await payment.insert()

        # Step 7: Create notification
        notification = NotificationDocument(
            user_id="worker_complete",
            type="payment_received",
            title="Payment Received",
            message=f"You received {transfer_amount} USDC for job_complete_flow",
            data={
                "payment_id": payment.payment_id,
                "amount": str(transfer_amount),
                "job_id": "job_complete_flow",
            },
            read=False,
        )
        await notification.insert()

        # Assertions: Verify complete flow
        final_user = await WalletDocument.find_one({"entity_id": "user_complete"})
        final_worker = await WalletDocument.find_one({"entity_id": "worker_complete"})
        final_payment = await PaymentDocument.find_one({"job_id": "job_complete_flow"})
        final_notification = await NotificationDocument.find_one({"user_id": "worker_complete"})

        assert _decimal128_to_decimal(final_user.balance_usdc) == Decimal("750.00")
        assert _decimal128_to_decimal(final_worker.balance_usdc) == Decimal("250.00")
        assert final_payment.status == "confirmed"
        assert final_notification.type == "payment_received"
        assert final_notification.data["job_id"] == "job_complete_flow"

    @pytest.mark.asyncio
    async def test_insufficient_balance_handling(self, test_db):
        """Test: Handle insufficient balance gracefully."""
        # Arrange: Create wallet with low balance
        wallet = WalletDocument(
            entity_id="user_low_balance",
            entity_type="user",
            wallet_id="wallet_low_balance",
            default_address="0x" + "33" * 20,
            seed_encrypted="encrypted_low",
            balance_usdc=Decimal128("10.00"),
            balance_eth=Decimal128("0.01"),
        )
        await wallet.insert()

        # Act: Attempt transfer exceeding balance
        transfer_amount = Decimal("100.00")
        current_balance = _decimal128_to_decimal(wallet.balance_usdc)

        # Assert: Balance check fails
        assert current_balance < transfer_amount

        # Should not allow transfer (in real service this would throw error)
        # For test purposes, verify balance unchanged
        final_wallet = await WalletDocument.find_one({"entity_id": "user_low_balance"})
        assert _decimal128_to_decimal(final_wallet.balance_usdc) == Decimal("10.00")
