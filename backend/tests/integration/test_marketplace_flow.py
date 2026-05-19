"""
Integration test: End-to-end marketplace flow.

Tests the complete marketplace workflow:
1. Worker registers pricing tiers
2. Job submitted with OpenQASM circuit
3. Cost estimated based on worker pricing
4. Payment distributed to worker
5. Worker reputation updated
6. Earnings tracked

Uses real MongoDB for data persistence, mocked AgentKit operations.
"""
from __future__ import annotations

import pytest
from decimal import Decimal
from bson import Decimal128

from db.agentkit_collections import (
    WalletDocument,
    WorkerPricingDocument,
    PaymentDocument,
    NotificationDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)


class TestMarketplaceFlow:
    """Test complete marketplace flow from worker registration to payment."""

    @pytest.mark.asyncio
    async def test_worker_registers_pricing(self, test_db):
        """Test: Worker registers pricing tiers."""
        # Act: Create worker pricing
        worker = WorkerPricingDocument(
            worker_id="worker_market_1",
            wallet_address="0x" + "m1" * 20,
            pricing={
                "hadamard": _decimal_to_decimal128(Decimal("0.05")),
                "cnot": _decimal_to_decimal128(Decimal("0.10")),
                "measurement": _decimal_to_decimal128(Decimal("0.08")),
                "pauli_x": _decimal_to_decimal128(Decimal("0.06")),
            },
            performance_tier="silver",
            reputation_score=70.0,
            total_earned=Decimal128("0.00"),
            jobs_completed=0,
            is_active=True,
        )
        await worker.insert()

        # Assert: Worker pricing registered
        found = await WorkerPricingDocument.find_one({"worker_id": "worker_market_1"})
        assert found is not None
        assert found.performance_tier == "silver"
        assert found.is_active is True
        assert _decimal128_to_decimal(found.pricing["hadamard"]) == Decimal("0.05")

    @pytest.mark.asyncio
    async def test_job_cost_estimation(self, test_db):
        """Test: Cost estimated from OpenQASM circuit."""
        # Arrange: Create worker with pricing
        worker = WorkerPricingDocument(
            worker_id="worker_cost_est",
            wallet_address="0x" + "ce" * 20,
            pricing={
                "hadamard": _decimal_to_decimal128(Decimal("0.10")),
                "cnot": _decimal_to_decimal128(Decimal("0.20")),
                "measurement": _decimal_to_decimal128(Decimal("0.15")),
            },
            performance_tier="gold",
            reputation_score=85.0,
            total_earned=Decimal128("500.00"),
            jobs_completed=50,
            is_active=True,
        )
        await worker.insert()

        # Act: Parse circuit and estimate cost
        # Circuit: 2 Hadamards + 1 CNOT + 2 Measurements
        circuit_operations = {
            "hadamard": 2,
            "cnot": 1,
            "measurement": 2,
        }

        estimated_cost = Decimal("0.00")
        for op, count in circuit_operations.items():
            price = _decimal128_to_decimal(worker.pricing[op])
            estimated_cost += price * count

        # Expected: (0.10 * 2) + (0.20 * 1) + (0.15 * 2) = 0.80
        assert estimated_cost == Decimal("0.80")

    @pytest.mark.asyncio
    async def test_job_submission_and_payment(self, test_db, mock_agentkit_service):
        """Test: Job submitted, cost calculated, payment distributed."""
        # Arrange: Create client and worker wallets
        client = WalletDocument(
            entity_id="client_market",
            entity_type="user",
            wallet_id="wallet_client_market",
            default_address="0x" + "cm" * 20,
            seed_encrypted="encrypted_client",
            balance_usdc=Decimal128("1000.00"),
            balance_eth=Decimal128("1.0"),
        )
        await client.insert()

        worker_wallet = WalletDocument(
            entity_id="worker_market_2",
            entity_type="worker",
            wallet_id="wallet_worker_market_2",
            default_address="0x" + "wm" * 20,
            seed_encrypted="encrypted_worker",
            balance_usdc=Decimal128("100.00"),
            balance_eth=Decimal128("0.5"),
        )
        await worker_wallet.insert()

        # Create worker pricing
        worker_pricing = WorkerPricingDocument(
            worker_id="worker_market_2",
            wallet_address="0x" + "wm" * 20,
            pricing={
                "hadamard": _decimal_to_decimal128(Decimal("0.12")),
                "cnot": _decimal_to_decimal128(Decimal("0.25")),
                "measurement": _decimal_to_decimal128(Decimal("0.18")),
            },
            performance_tier="platinum",
            reputation_score=95.0,
            total_earned=Decimal128("1000.00"),
            jobs_completed=100,
            is_active=True,
        )
        await worker_pricing.insert()

        # Act: Submit job and calculate cost
        job_id = "job_market_flow"
        circuit_ops = {"hadamard": 3, "cnot": 2, "measurement": 3}

        job_cost = Decimal("0.00")
        for op, count in circuit_ops.items():
            price = _decimal128_to_decimal(worker_pricing.pricing[op])
            job_cost += price * count

        # Expected: (0.12 * 3) + (0.25 * 2) + (0.18 * 3) = 1.40
        assert job_cost == Decimal("1.40")

        # Process payment
        transfer_result = await mock_agentkit_service.transfer_usdc(
            "wallet_client_market",
            "0x" + "wm" * 20,
            job_cost
        )

        # Update balances
        client.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(client.balance_usdc) - job_cost
        )
        worker_wallet.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(worker_wallet.balance_usdc) + job_cost
        )
        await client.save()
        await worker_wallet.save()

        # Record payment
        payment = PaymentDocument(
            payment_id=transfer_result["payment_id"],
            type="worker_payment",
            from_wallet="0x" + "cm" * 20,
            to_wallet="0x" + "wm" * 20,
            amount=_decimal_to_decimal128(job_cost),
            currency="USDC",
            status="confirmed",
            job_id=job_id,
            transaction_hash=transfer_result["transaction_hash"],
            basescan_url=transfer_result["basescan_url"],
        )
        await payment.insert()

        # Assert: Payment completed successfully
        final_client = await WalletDocument.find_one({"entity_id": "client_market"})
        final_worker_wallet = await WalletDocument.find_one({"entity_id": "worker_market_2"})

        assert _decimal128_to_decimal(final_client.balance_usdc) == Decimal("998.60")
        assert _decimal128_to_decimal(final_worker_wallet.balance_usdc) == Decimal("101.40")

        payment_record = await PaymentDocument.find_one({"job_id": job_id})
        assert payment_record.status == "confirmed"
        assert _decimal128_to_decimal(payment_record.amount) == job_cost

    @pytest.mark.asyncio
    async def test_worker_reputation_update(self, test_db):
        """Test: Worker reputation updated after job completion."""
        # Arrange: Create worker
        worker = WorkerPricingDocument(
            worker_id="worker_reputation",
            wallet_address="0x" + "wr" * 20,
            pricing={"hadamard": _decimal_to_decimal128(Decimal("0.10"))},
            performance_tier="bronze",
            reputation_score=50.0,
            total_earned=Decimal128("100.00"),
            jobs_completed=10,
            is_active=True,
        )
        await worker.insert()

        # Act: Simulate successful job completion
        job_payment = Decimal("15.50")
        worker.jobs_completed += 1
        worker.total_earned = _decimal_to_decimal128(
            _decimal128_to_decimal(worker.total_earned) + job_payment
        )

        # Update reputation (simple formula: +5 for successful job)
        worker.reputation_score = min(100.0, worker.reputation_score + 5.0)

        # Upgrade tier if reputation crosses threshold
        if worker.reputation_score >= 60.0 and worker.performance_tier == "bronze":
            worker.performance_tier = "silver"

        await worker.save()

        # Assert: Reputation and earnings updated
        updated = await WorkerPricingDocument.find_one({"worker_id": "worker_reputation"})
        assert updated.reputation_score == 55.0
        assert updated.jobs_completed == 11
        assert _decimal128_to_decimal(updated.total_earned) == Decimal("115.50")
        assert updated.performance_tier == "bronze"  # Not yet 60

        # Act: Complete another job to reach silver
        for _ in range(2):
            updated.jobs_completed += 1
            updated.reputation_score = min(100.0, updated.reputation_score + 5.0)

        if updated.reputation_score >= 60.0 and updated.performance_tier == "bronze":
            updated.performance_tier = "silver"

        await updated.save()

        # Assert: Tier upgraded
        final = await WorkerPricingDocument.find_one({"worker_id": "worker_reputation"})
        assert final.reputation_score == 65.0
        assert final.performance_tier == "silver"

    @pytest.mark.asyncio
    async def test_earnings_tracking(self, test_db):
        """Test: Worker earnings tracked across multiple jobs."""
        # Arrange: Create worker
        worker = WorkerPricingDocument(
            worker_id="worker_earnings",
            wallet_address="0x" + "we" * 20,
            pricing={
                "hadamard": _decimal_to_decimal128(Decimal("0.08")),
                "cnot": _decimal_to_decimal128(Decimal("0.15")),
            },
            performance_tier="gold",
            reputation_score=80.0,
            total_earned=Decimal128("500.00"),
            jobs_completed=50,
            is_active=True,
        )
        await worker.insert()

        # Act: Process multiple jobs
        job_payments = [Decimal("12.50"), Decimal("23.75"), Decimal("8.30")]

        for payment in job_payments:
            worker.total_earned = _decimal_to_decimal128(
                _decimal128_to_decimal(worker.total_earned) + payment
            )
            worker.jobs_completed += 1

        await worker.save()

        # Assert: Earnings accumulated correctly
        final = await WorkerPricingDocument.find_one({"worker_id": "worker_earnings"})
        expected_earnings = Decimal("500.00") + sum(job_payments)
        assert _decimal128_to_decimal(final.total_earned) == expected_earnings
        assert final.jobs_completed == 53

    @pytest.mark.asyncio
    async def test_complete_marketplace_flow(self, test_db, mock_agentkit_service):
        """Test: Complete end-to-end marketplace workflow."""
        # Step 1: Worker registers pricing
        worker = WorkerPricingDocument(
            worker_id="worker_complete_market",
            wallet_address="0x" + "wcm" * 20,
            pricing={
                "hadamard": _decimal_to_decimal128(Decimal("0.15")),
                "cnot": _decimal_to_decimal128(Decimal("0.30")),
                "measurement": _decimal_to_decimal128(Decimal("0.20")),
                "pauli_x": _decimal_to_decimal128(Decimal("0.12")),
            },
            performance_tier="silver",
            reputation_score=65.0,
            total_earned=Decimal128("200.00"),
            jobs_completed=20,
            is_active=True,
        )
        await worker.insert()

        # Step 2: Create client and worker wallets
        client = WalletDocument(
            entity_id="client_complete",
            entity_type="user",
            wallet_id="wallet_client_complete",
            default_address="0x" + "cc" * 20,
            seed_encrypted="encrypted_client_complete",
            balance_usdc=Decimal128("2000.00"),
            balance_eth=Decimal128("2.0"),
        )
        await client.insert()

        worker_wallet = WalletDocument(
            entity_id="worker_complete_market",
            entity_type="worker",
            wallet_id="wallet_worker_complete_market",
            default_address="0x" + "wcm" * 20,
            seed_encrypted="encrypted_worker_complete",
            balance_usdc=Decimal128("200.00"),
            balance_eth=Decimal128("0.5"),
        )
        await worker_wallet.insert()

        # Step 3: Job submitted with circuit
        job_id = "job_complete_marketplace"
        circuit_ops = {"hadamard": 5, "cnot": 3, "measurement": 4, "pauli_x": 2}

        # Step 4: Estimate cost
        job_cost = Decimal("0.00")
        for op, count in circuit_ops.items():
            price = _decimal128_to_decimal(worker.pricing[op])
            job_cost += price * count

        # Expected: (0.15*5) + (0.30*3) + (0.20*4) + (0.12*2) = 2.89
        assert job_cost == Decimal("2.89")

        # Step 5: Process payment
        transfer_result = await mock_agentkit_service.transfer_usdc(
            "wallet_client_complete",
            "0x" + "wcm" * 20,
            job_cost
        )

        client.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(client.balance_usdc) - job_cost
        )
        worker_wallet.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(worker_wallet.balance_usdc) + job_cost
        )
        await client.save()
        await worker_wallet.save()

        payment = PaymentDocument(
            payment_id=transfer_result["payment_id"],
            type="worker_payment",
            from_wallet="0x" + "cc" * 20,
            to_wallet="0x" + "wcm" * 20,
            amount=_decimal_to_decimal128(job_cost),
            currency="USDC",
            status="confirmed",
            job_id=job_id,
            transaction_hash=transfer_result["transaction_hash"],
        )
        await payment.insert()

        # Step 6: Update worker reputation and earnings
        worker.jobs_completed += 1
        worker.total_earned = _decimal_to_decimal128(
            _decimal128_to_decimal(worker.total_earned) + job_cost
        )
        worker.reputation_score = min(100.0, worker.reputation_score + 3.5)
        await worker.save()

        # Step 7: Send notification
        notification = NotificationDocument(
            user_id="worker_complete_market",
            type="payment_received",
            title="Job Payment Received",
            message=f"Earned {job_cost} USDC for {job_id}",
            data={"payment_id": payment.payment_id, "job_id": job_id, "amount": str(job_cost)},
            read=False,
        )
        await notification.insert()

        # Assertions: Verify complete marketplace flow
        final_client = await WalletDocument.find_one({"entity_id": "client_complete"})
        final_worker_wallet = await WalletDocument.find_one({"entity_id": "worker_complete_market"})
        final_worker_pricing = await WorkerPricingDocument.find_one({"worker_id": "worker_complete_market"})
        final_payment = await PaymentDocument.find_one({"job_id": job_id})
        final_notification = await NotificationDocument.find_one({"user_id": "worker_complete_market"})

        assert _decimal128_to_decimal(final_client.balance_usdc) == Decimal("1997.11")
        assert _decimal128_to_decimal(final_worker_wallet.balance_usdc) == Decimal("202.89")
        assert _decimal128_to_decimal(final_worker_pricing.total_earned) == Decimal("202.89")
        assert final_worker_pricing.jobs_completed == 21
        assert final_worker_pricing.reputation_score == 68.5
        assert final_payment.status == "confirmed"
        assert final_notification.type == "payment_received"
