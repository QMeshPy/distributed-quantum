"""
Integration test: End-to-end crowdfunding flow.

Tests the complete crowdfunding workflow:
1. Researcher creates research proposal
2. Users fund the proposal
3. Funding threshold reached
4. Proposal status changes to "funded"
5. Escrow operations (mock AAVE)
6. Notifications sent to stakeholders

Uses real MongoDB for data persistence, mocked AAVE and AgentKit operations.
"""
from __future__ import annotations

import pytest
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from bson import Decimal128

from db.agentkit_collections import (
    WalletDocument,
    ResearchProposalDocument,
    PaymentDocument,
    NotificationDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)


class TestCrowdfundingFlow:
    """Test complete crowdfunding flow from proposal creation to funding."""

    @pytest.mark.asyncio
    async def test_researcher_creates_proposal(self, test_db):
        """Test: Researcher creates a new research proposal."""
        # Act: Create proposal
        proposal = ResearchProposalDocument(
            proposal_id="prop_cf_1",
            title="Quantum Error Correction Research",
            description="Investigating surface codes for quantum computing",
            researcher_id="researcher_alice",
            researcher_wallet="0x" + "ra" * 20,
            methodology="Surface code + machine learning optimization",
            budget_required=Decimal128("10000.00"),
            budget_raised=Decimal128("0.00"),
            funding_threshold=Decimal128("6000.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=60),
            status="active",
            tags=["error-correction", "surface-codes", "ml"],
            fragments=[],
            funders=[],
            escrow_type="simple",
        )
        await proposal.insert()

        # Assert: Proposal created
        found = await ResearchProposalDocument.find_one({"proposal_id": "prop_cf_1"})
        assert found is not None
        assert found.status == "active"
        assert _decimal128_to_decimal(found.budget_required) == Decimal("10000.00")
        assert _decimal128_to_decimal(found.budget_raised) == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_user_funds_proposal(self, test_db, mock_agentkit_service):
        """Test: User funds a research proposal."""
        # Arrange: Create proposal and funder wallet
        proposal = ResearchProposalDocument(
            proposal_id="prop_cf_2",
            title="Quantum ML for Drug Discovery",
            description="Applying VQE to molecular simulations",
            researcher_id="researcher_bob",
            researcher_wallet="0x" + "rb" * 20,
            methodology="VQE + QAOA hybrid",
            budget_required=Decimal128("5000.00"),
            budget_raised=Decimal128("0.00"),
            funding_threshold=Decimal128("3000.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=45),
            status="active",
            tags=["quantum-ml", "drug-discovery"],
            funders=[],
            escrow_type="simple",
        )
        await proposal.insert()

        funder_wallet = WalletDocument(
            entity_id="funder_charlie",
            entity_type="user",
            wallet_id="wallet_funder_charlie",
            default_address="0x" + "fc" * 20,
            seed_encrypted="encrypted_funder",
            balance_usdc=Decimal128("2000.00"),
            balance_eth=Decimal128("1.0"),
        )
        await funder_wallet.insert()

        # Act: User funds proposal
        funding_amount = Decimal("500.00")

        # Transfer to escrow (simulate)
        escrow_address = "0x" + "es" * 20
        transfer_result = await mock_agentkit_service.transfer_usdc(
            "wallet_funder_charlie",
            escrow_address,
            funding_amount
        )

        # Update funder balance
        funder_wallet.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(funder_wallet.balance_usdc) - funding_amount
        )
        await funder_wallet.save()

        # Update proposal
        proposal.budget_raised = _decimal_to_decimal128(
            _decimal128_to_decimal(proposal.budget_raised) + funding_amount
        )
        proposal.funders.append({
            "funder_id": "funder_charlie",
            "wallet_address": "0x" + "fc" * 20,
            "amount_usdc": _decimal_to_decimal128(funding_amount),
            "funded_at": datetime.now(timezone.utc),
        })
        await proposal.save()

        # Record payment
        payment = PaymentDocument(
            payment_id=transfer_result["payment_id"],
            type="research_funding",
            from_wallet="0x" + "fc" * 20,
            to_wallet=escrow_address,
            amount=_decimal_to_decimal128(funding_amount),
            currency="USDC",
            status="confirmed",
            proposal_id="prop_cf_2",
            transaction_hash=transfer_result["transaction_hash"],
        )
        await payment.insert()

        # Assert: Funding recorded
        updated_proposal = await ResearchProposalDocument.find_one({"proposal_id": "prop_cf_2"})
        updated_funder = await WalletDocument.find_one({"entity_id": "funder_charlie"})

        assert _decimal128_to_decimal(updated_proposal.budget_raised) == funding_amount
        assert len(updated_proposal.funders) == 1
        assert updated_proposal.funders[0]["funder_id"] == "funder_charlie"
        assert _decimal128_to_decimal(updated_funder.balance_usdc) == Decimal("1500.00")

    @pytest.mark.asyncio
    async def test_threshold_reached_status_change(self, test_db, mock_agentkit_service):
        """Test: Proposal status changes when funding threshold reached."""
        # Arrange: Create proposal
        proposal = ResearchProposalDocument(
            proposal_id="prop_cf_threshold",
            title="Quantum Optimization Algorithms",
            description="Research into QAOA improvements",
            researcher_id="researcher_dave",
            researcher_wallet="0x" + "rd" * 20,
            methodology="Modified QAOA with adaptive parameters",
            budget_required=Decimal128("4000.00"),
            budget_raised=Decimal128("2500.00"),  # Already partially funded
            funding_threshold=Decimal128("3000.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=30),
            status="active",
            tags=["qaoa", "optimization"],
            funders=[],
            escrow_type="simple",
        )
        await proposal.insert()

        # Create funder
        funder = WalletDocument(
            entity_id="funder_eve",
            entity_type="user",
            wallet_id="wallet_funder_eve",
            default_address="0x" + "fe" * 20,
            seed_encrypted="encrypted_eve",
            balance_usdc=Decimal128("1000.00"),
            balance_eth=Decimal128("0.5"),
        )
        await funder.insert()

        # Act: Fund to reach threshold
        funding_amount = Decimal("600.00")  # Total will be 3100.00

        escrow_address = "0x" + "es" * 20
        await mock_agentkit_service.transfer_usdc(
            "wallet_funder_eve",
            escrow_address,
            funding_amount
        )

        # Update proposal
        proposal.budget_raised = _decimal_to_decimal128(
            _decimal128_to_decimal(proposal.budget_raised) + funding_amount
        )
        proposal.funders.append({
            "funder_id": "funder_eve",
            "wallet_address": "0x" + "fe" * 20,
            "amount_usdc": _decimal_to_decimal128(funding_amount),
            "funded_at": datetime.now(timezone.utc),
        })

        # Check if threshold reached
        if _decimal128_to_decimal(proposal.budget_raised) >= _decimal128_to_decimal(proposal.funding_threshold):
            proposal.status = "funded"

        await proposal.save()

        # Assert: Status changed to funded
        updated = await ResearchProposalDocument.find_one({"proposal_id": "prop_cf_threshold"})
        assert updated.status == "funded"
        assert _decimal128_to_decimal(updated.budget_raised) == Decimal("3100.00")

    @pytest.mark.asyncio
    async def test_aave_escrow_operations(self, test_db, mock_aave_service, mock_agentkit_service):
        """Test: Escrow operations with AAVE yield generation."""
        # Arrange: Create proposal with AAVE escrow
        proposal = ResearchProposalDocument(
            proposal_id="prop_aave_escrow",
            title="Quantum Cryptography Research",
            description="Post-quantum cryptographic algorithms",
            researcher_id="researcher_frank",
            researcher_wallet="0x" + "rf" * 20,
            methodology="Lattice-based cryptography",
            budget_required=Decimal128("8000.00"),
            budget_raised=Decimal128("0.00"),
            funding_threshold=Decimal128("5000.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=90),
            status="active",
            tags=["cryptography", "post-quantum"],
            funders=[],
            escrow_type="aave_yield",
            aave_pool_address=None,
        )
        await proposal.insert()

        # Create funder
        funder = WalletDocument(
            entity_id="funder_grace",
            entity_type="user",
            wallet_id="wallet_funder_grace",
            default_address="0x" + "fg" * 20,
            seed_encrypted="encrypted_grace",
            balance_usdc=Decimal128("6000.00"),
            balance_eth=Decimal128("2.0"),
        )
        await funder.insert()

        # Act: Fund proposal with AAVE escrow
        funding_amount = Decimal("5500.00")

        # Transfer to escrow
        escrow_address = "0x" + "es" * 20
        await mock_agentkit_service.transfer_usdc(
            "wallet_funder_grace",
            escrow_address,
            funding_amount
        )

        # Deposit to AAVE pool
        aave_result = await mock_aave_service.deposit(funding_amount)

        # Update proposal
        proposal.budget_raised = _decimal_to_decimal128(funding_amount)
        proposal.aave_pool_address = aave_result["pool_address"]
        proposal.status = "funded"
        proposal.funders.append({
            "funder_id": "funder_grace",
            "wallet_address": "0x" + "fg" * 20,
            "amount_usdc": _decimal_to_decimal128(funding_amount),
            "funded_at": datetime.now(timezone.utc),
        })
        await proposal.save()

        # Assert: AAVE escrow set up
        updated = await ResearchProposalDocument.find_one({"proposal_id": "prop_aave_escrow"})
        assert updated.escrow_type == "aave_yield"
        assert updated.aave_pool_address == aave_result["pool_address"]
        assert updated.status == "funded"
        assert mock_aave_service.deposit.called

    @pytest.mark.asyncio
    async def test_notifications_sent(self, test_db):
        """Test: Notifications sent to researcher and funders."""
        # Arrange: Create notifications
        researcher_notif = NotificationDocument(
            user_id="researcher_alice",
            type="proposal_funded",
            title="Proposal Fully Funded!",
            message="Your proposal 'Quantum Error Correction' reached funding threshold",
            data={"proposal_id": "prop_cf_1", "amount": "6000.00"},
            read=False,
        )
        await researcher_notif.insert()

        funder_notif = NotificationDocument(
            user_id="funder_charlie",
            type="proposal_milestone",
            title="Proposal Milestone Reached",
            message="Proposal you funded reached its funding goal",
            data={"proposal_id": "prop_cf_2", "your_contribution": "500.00"},
            read=False,
        )
        await funder_notif.insert()

        # Assert: Notifications created
        researcher_msg = await NotificationDocument.find_one({"user_id": "researcher_alice"})
        funder_msg = await NotificationDocument.find_one({"user_id": "funder_charlie"})

        assert researcher_msg.type == "proposal_funded"
        assert funder_msg.type == "proposal_milestone"
        assert researcher_msg.read is False

    @pytest.mark.asyncio
    async def test_complete_crowdfunding_flow(self, test_db, mock_agentkit_service, mock_aave_service):
        """Test: Complete end-to-end crowdfunding workflow."""
        # Step 1: Researcher creates proposal
        proposal = ResearchProposalDocument(
            proposal_id="prop_complete_cf",
            title="Quantum Sensing Applications",
            description="Developing quantum sensors for medical imaging",
            researcher_id="researcher_henry",
            researcher_wallet="0x" + "rh" * 20,
            methodology="NV-center diamond quantum sensors",
            budget_required=Decimal128("12000.00"),
            budget_raised=Decimal128("0.00"),
            funding_threshold=Decimal128("8000.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=120),
            status="active",
            tags=["quantum-sensing", "medical", "nv-centers"],
            fragments=[],
            funders=[],
            escrow_type="aave_yield",
        )
        await proposal.insert()

        # Step 2: Create researcher and funder wallets
        researcher_wallet = WalletDocument(
            entity_id="researcher_henry",
            entity_type="user",
            wallet_id="wallet_researcher_henry",
            default_address="0x" + "rh" * 20,
            seed_encrypted="encrypted_henry",
            balance_usdc=Decimal128("100.00"),
            balance_eth=Decimal128("0.1"),
        )
        await researcher_wallet.insert()

        funders_data = [
            ("funder_ian", "0x" + "fi" * 20, Decimal("3000.00")),
            ("funder_jane", "0x" + "fj" * 20, Decimal("2500.00")),
            ("funder_kate", "0x" + "fk" * 20, Decimal("3000.00")),
        ]

        for funder_id, address, balance in funders_data:
            wallet = WalletDocument(
                entity_id=funder_id,
                entity_type="user",
                wallet_id=f"wallet_{funder_id}",
                default_address=address,
                seed_encrypted=f"encrypted_{funder_id}",
                balance_usdc=_decimal_to_decimal128(balance),
                balance_eth=Decimal128("1.0"),
            )
            await wallet.insert()

        # Step 3: Multiple users fund proposal
        escrow_address = "0x" + "es" * 20
        total_funded = Decimal("0.00")

        for funder_id, address, amount in funders_data:
            # Transfer to escrow
            transfer_result = await mock_agentkit_service.transfer_usdc(
                f"wallet_{funder_id}",
                escrow_address,
                amount
            )

            # Update funder balance
            funder_wallet = await WalletDocument.find_one({"entity_id": funder_id})
            funder_wallet.balance_usdc = _decimal_to_decimal128(
                _decimal128_to_decimal(funder_wallet.balance_usdc) - amount
            )
            await funder_wallet.save()

            # Record payment
            payment = PaymentDocument(
                payment_id=transfer_result["payment_id"],
                type="research_funding",
                from_wallet=address,
                to_wallet=escrow_address,
                amount=_decimal_to_decimal128(amount),
                currency="USDC",
                status="confirmed",
                proposal_id="prop_complete_cf",
                transaction_hash=transfer_result["transaction_hash"],
            )
            await payment.insert()

            # Update proposal
            total_funded += amount
            proposal.budget_raised = _decimal_to_decimal128(total_funded)
            proposal.funders.append({
                "funder_id": funder_id,
                "wallet_address": address,
                "amount_usdc": _decimal_to_decimal128(amount),
                "funded_at": datetime.now(timezone.utc),
            })

        # Step 4: Threshold reached, deposit to AAVE
        if total_funded >= _decimal128_to_decimal(proposal.funding_threshold):
            proposal.status = "funded"
            aave_result = await mock_aave_service.deposit(total_funded)
            proposal.aave_pool_address = aave_result["pool_address"]

        await proposal.save()

        # Step 5: Send notifications
        researcher_notif = NotificationDocument(
            user_id="researcher_henry",
            type="proposal_funded",
            title="Proposal Fully Funded!",
            message=f"Your proposal reached {total_funded} USDC",
            data={"proposal_id": "prop_complete_cf", "amount": str(total_funded)},
            read=False,
        )
        await researcher_notif.insert()

        for funder_id, _, amount in funders_data:
            notif = NotificationDocument(
                user_id=funder_id,
                type="proposal_milestone",
                title="Proposal Funded",
                message="Proposal you supported reached funding goal",
                data={"proposal_id": "prop_complete_cf", "your_contribution": str(amount)},
                read=False,
            )
            await notif.insert()

        # Assertions: Verify complete crowdfunding flow
        final_proposal = await ResearchProposalDocument.find_one({"proposal_id": "prop_complete_cf"})
        payments = await PaymentDocument.find({"proposal_id": "prop_complete_cf"}).to_list()
        notifications = await NotificationDocument.find({
            "data.proposal_id": "prop_complete_cf"
        }).to_list()

        assert final_proposal.status == "funded"
        assert _decimal128_to_decimal(final_proposal.budget_raised) == Decimal("8500.00")
        assert len(final_proposal.funders) == 3
        assert final_proposal.aave_pool_address is not None
        assert len(payments) == 3
        assert len(notifications) == 4  # 1 researcher + 3 funders
        assert all(p.status == "confirmed" for p in payments)

        # Verify all funders' balances deducted
        for funder_id, _, amount in funders_data:
            funder = await WalletDocument.find_one({"entity_id": funder_id})
            assert _decimal128_to_decimal(funder.balance_usdc) == Decimal("0.00")
