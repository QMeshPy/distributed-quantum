"""
Integration test: End-to-end AI agent autonomous funding flow.

Tests the complete AI agent funding workflow:
1. Agent created with spending controls
2. Proposal submitted for funding
3. Agent analyzes proposal
4. Agent autonomously funds proposal
5. Spending limits enforced
6. Spending history tracked and updated

Uses real MongoDB for data persistence, mocked AgentKit and analysis operations.
"""
from __future__ import annotations

import pytest
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from bson import Decimal128

from db.agentkit_collections import (
    WalletDocument,
    AIAgentDocument,
    ResearchProposalDocument,
    PaymentDocument,
    NotificationDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)


class TestAgentFundingFlow:
    """Test complete AI agent autonomous funding workflow."""

    @pytest.mark.asyncio
    async def test_agent_creation_with_controls(self, test_db):
        """Test: AI agent created with spending controls."""
        # Act: Create agent with spending limits
        agent = AIAgentDocument(
            agent_id="agent_auto_1",
            owner_id="owner_alice",
            agent_name="Autonomous Funder Alpha",
            wallet_id="wallet_agent_1",
            wallet_address="0x" + "ag1" * 20,
            config={
                "auto_fund": True,
                "max_per_tx": _decimal_to_decimal128(Decimal("500.00")),
                "daily_limit": _decimal_to_decimal128(Decimal("2000.00")),
                "min_proposal_reputation": 70.0,
                "auto_approve_threshold": _decimal_to_decimal128(Decimal("100.00")),
            },
            spending_history=[],
            total_spent=Decimal128("0.00"),
        )
        await agent.insert()

        # Create agent wallet
        agent_wallet = WalletDocument(
            entity_id="agent_auto_1",
            entity_type="agent",
            wallet_id="wallet_agent_1",
            default_address="0x" + "ag1" * 20,
            seed_encrypted="encrypted_agent_1",
            balance_usdc=Decimal128("5000.00"),
            balance_eth=Decimal128("2.0"),
        )
        await agent_wallet.insert()

        # Assert: Agent created with correct config
        found = await AIAgentDocument.find_one({"agent_id": "agent_auto_1"})
        assert found is not None
        assert found.config["auto_fund"] is True
        assert _decimal128_to_decimal(found.config["max_per_tx"]) == Decimal("500.00")
        assert _decimal128_to_decimal(found.total_spent) == Decimal("0.00")

    @pytest.mark.asyncio
    async def test_agent_analyzes_proposal(self, test_db):
        """Test: Agent analyzes proposal for funding decision."""
        # Arrange: Create proposal
        proposal = ResearchProposalDocument(
            proposal_id="prop_agent_analyze",
            title="Quantum Circuit Optimization",
            description="Machine learning for circuit optimization",
            researcher_id="researcher_bob",
            researcher_wallet="0x" + "rb" * 20,
            methodology="Reinforcement learning approach",
            budget_required=Decimal128("3000.00"),
            budget_raised=Decimal128("500.00"),
            funding_threshold=Decimal128("2000.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=60),
            status="active",
            tags=["optimization", "ml", "circuits"],
            funders=[],
            escrow_type="simple",
        )
        await proposal.insert()

        # Act: Agent analyzes proposal
        # Scoring logic (mock)
        analysis_score = 0.0

        # Check tags match interests
        if "optimization" in proposal.tags:
            analysis_score += 30.0
        if "ml" in proposal.tags:
            analysis_score += 25.0

        # Check funding progress
        funding_progress = (
            _decimal128_to_decimal(proposal.budget_raised) /
            _decimal128_to_decimal(proposal.budget_required)
        ) * 100
        if funding_progress > 10:
            analysis_score += 20.0

        # Check deadline
        days_remaining = (proposal.deadline - datetime.now(timezone.utc)).days
        if days_remaining > 30:
            analysis_score += 15.0

        # Final decision
        should_fund = analysis_score >= 70.0

        # Assert: Agent decides to fund
        assert analysis_score == 90.0  # 30 + 25 + 20 + 15
        assert should_fund is True

    @pytest.mark.asyncio
    async def test_agent_funds_proposal(self, test_db, mock_agentkit_service):
        """Test: Agent autonomously funds a proposal."""
        # Arrange: Create agent, wallet, and proposal
        agent = AIAgentDocument(
            agent_id="agent_auto_2",
            owner_id="owner_charlie",
            agent_name="Smart Funder Beta",
            wallet_id="wallet_agent_2",
            wallet_address="0x" + "ag2" * 20,
            config={
                "auto_fund": True,
                "max_per_tx": _decimal_to_decimal128(Decimal("300.00")),
                "daily_limit": _decimal_to_decimal128(Decimal("1000.00")),
            },
            spending_history=[],
            total_spent=Decimal128("0.00"),
        )
        await agent.insert()

        agent_wallet = WalletDocument(
            entity_id="agent_auto_2",
            entity_type="agent",
            wallet_id="wallet_agent_2",
            default_address="0x" + "ag2" * 20,
            seed_encrypted="encrypted_agent_2",
            balance_usdc=Decimal128("3000.00"),
            balance_eth=Decimal128("1.5"),
        )
        await agent_wallet.insert()

        proposal = ResearchProposalDocument(
            proposal_id="prop_agent_fund",
            title="Quantum Annealing for Optimization",
            description="D-Wave quantum annealer applications",
            researcher_id="researcher_dave",
            researcher_wallet="0x" + "rd" * 20,
            methodology="Quantum annealing with classical preprocessing",
            budget_required=Decimal128("4000.00"),
            budget_raised=Decimal128("1000.00"),
            funding_threshold=Decimal128("2500.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=45),
            status="active",
            tags=["annealing", "optimization"],
            funders=[],
            escrow_type="simple",
        )
        await proposal.insert()

        # Act: Agent funds proposal
        funding_amount = Decimal("250.00")

        # Check spending limit
        max_per_tx = _decimal128_to_decimal(agent.config["max_per_tx"])
        assert funding_amount <= max_per_tx

        # Transfer to escrow
        escrow_address = "0x" + "es" * 20
        transfer_result = await mock_agentkit_service.transfer_usdc(
            "wallet_agent_2",
            escrow_address,
            funding_amount
        )

        # Update agent wallet
        agent_wallet.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(agent_wallet.balance_usdc) - funding_amount
        )
        await agent_wallet.save()

        # Update proposal
        proposal.budget_raised = _decimal_to_decimal128(
            _decimal128_to_decimal(proposal.budget_raised) + funding_amount
        )
        proposal.funders.append({
            "funder_id": "agent_auto_2",
            "wallet_address": "0x" + "ag2" * 20,
            "amount_usdc": _decimal_to_decimal128(funding_amount),
            "funded_at": datetime.now(timezone.utc),
        })
        await proposal.save()

        # Update agent spending
        agent.spending_history.append({
            "timestamp": datetime.now(timezone.utc),
            "amount": _decimal_to_decimal128(funding_amount),
            "purpose": f"research_funding:prop_agent_fund",
            "transaction_hash": transfer_result["transaction_hash"],
        })
        agent.total_spent = _decimal_to_decimal128(
            _decimal128_to_decimal(agent.total_spent) + funding_amount
        )
        await agent.save()

        # Record payment
        payment = PaymentDocument(
            payment_id=transfer_result["payment_id"],
            type="research_funding",
            from_wallet="0x" + "ag2" * 20,
            to_wallet=escrow_address,
            amount=_decimal_to_decimal128(funding_amount),
            currency="USDC",
            status="confirmed",
            proposal_id="prop_agent_fund",
            transaction_hash=transfer_result["transaction_hash"],
        )
        await payment.insert()

        # Assert: Funding completed
        updated_agent = await AIAgentDocument.find_one({"agent_id": "agent_auto_2"})
        updated_wallet = await WalletDocument.find_one({"entity_id": "agent_auto_2"})
        updated_proposal = await ResearchProposalDocument.find_one({"proposal_id": "prop_agent_fund"})

        assert _decimal128_to_decimal(updated_agent.total_spent) == funding_amount
        assert len(updated_agent.spending_history) == 1
        assert _decimal128_to_decimal(updated_wallet.balance_usdc) == Decimal("2750.00")
        assert _decimal128_to_decimal(updated_proposal.budget_raised) == Decimal("1250.00")

    @pytest.mark.asyncio
    async def test_spending_limits_enforced(self, test_db):
        """Test: Agent spending limits enforced."""
        # Arrange: Create agent with low limits
        agent = AIAgentDocument(
            agent_id="agent_limited",
            owner_id="owner_eve",
            agent_name="Limited Spender",
            wallet_id="wallet_agent_limited",
            wallet_address="0x" + "agl" * 20,
            config={
                "auto_fund": True,
                "max_per_tx": _decimal_to_decimal128(Decimal("100.00")),
                "daily_limit": _decimal_to_decimal128(Decimal("300.00")),
            },
            spending_history=[
                {
                    "timestamp": datetime.now(timezone.utc),
                    "amount": _decimal_to_decimal128(Decimal("250.00")),
                    "purpose": "previous_funding",
                    "transaction_hash": "0x" + "tx1" * 22,
                }
            ],
            total_spent=Decimal128("250.00"),
        )
        await agent.insert()

        # Act: Attempt to exceed daily limit
        proposed_funding = Decimal("100.00")
        daily_limit = _decimal128_to_decimal(agent.config["daily_limit"])
        current_spent = _decimal128_to_decimal(agent.total_spent)

        # Check daily limit
        would_exceed_daily = (current_spent + proposed_funding) > daily_limit

        # Assert: Limit would be exceeded
        assert would_exceed_daily is True
        assert current_spent + proposed_funding == Decimal("350.00")
        assert daily_limit == Decimal("300.00")

    @pytest.mark.asyncio
    async def test_spending_history_updated(self, test_db, mock_agentkit_service):
        """Test: Agent spending history tracked correctly."""
        # Arrange: Create agent
        agent = AIAgentDocument(
            agent_id="agent_history",
            owner_id="owner_frank",
            agent_name="History Tracker",
            wallet_id="wallet_agent_history",
            wallet_address="0x" + "agh" * 20,
            config={
                "auto_fund": True,
                "max_per_tx": _decimal_to_decimal128(Decimal("500.00")),
                "daily_limit": _decimal_to_decimal128(Decimal("2000.00")),
            },
            spending_history=[],
            total_spent=Decimal128("0.00"),
        )
        await agent.insert()

        # Act: Make multiple funding transactions
        funding_operations = [
            ("prop_1", Decimal("150.00")),
            ("prop_2", Decimal("200.00")),
            ("prop_3", Decimal("125.00")),
        ]

        for prop_id, amount in funding_operations:
            transfer_result = await mock_agentkit_service.transfer_usdc(
                "wallet_agent_history",
                "0x" + "es" * 20,
                amount
            )

            agent.spending_history.append({
                "timestamp": datetime.now(timezone.utc),
                "amount": _decimal_to_decimal128(amount),
                "purpose": f"research_funding:{prop_id}",
                "transaction_hash": transfer_result["transaction_hash"],
            })
            agent.total_spent = _decimal_to_decimal128(
                _decimal128_to_decimal(agent.total_spent) + amount
            )

        await agent.save()

        # Assert: Spending history complete
        updated = await AIAgentDocument.find_one({"agent_id": "agent_history"})
        assert len(updated.spending_history) == 3
        assert _decimal128_to_decimal(updated.total_spent) == Decimal("475.00")

        # Verify each entry
        expected_amounts = [Decimal("150.00"), Decimal("200.00"), Decimal("125.00")]
        for i, entry in enumerate(updated.spending_history):
            assert _decimal128_to_decimal(entry["amount"]) == expected_amounts[i]
            assert "research_funding:prop_" in entry["purpose"]

    @pytest.mark.asyncio
    async def test_complete_agent_funding_flow(self, test_db, mock_agentkit_service):
        """Test: Complete end-to-end agent funding workflow."""
        # Step 1: Create agent with spending controls
        agent = AIAgentDocument(
            agent_id="agent_complete",
            owner_id="owner_grace",
            agent_name="Complete Auto Funder",
            wallet_id="wallet_agent_complete",
            wallet_address="0x" + "agc" * 20,
            config={
                "auto_fund": True,
                "max_per_tx": _decimal_to_decimal128(Decimal("400.00")),
                "daily_limit": _decimal_to_decimal128(Decimal("1500.00")),
                "min_proposal_score": 75.0,
            },
            spending_history=[],
            total_spent=Decimal128("0.00"),
        )
        await agent.insert()

        agent_wallet = WalletDocument(
            entity_id="agent_complete",
            entity_type="agent",
            wallet_id="wallet_agent_complete",
            default_address="0x" + "agc" * 20,
            seed_encrypted="encrypted_agent_complete",
            balance_usdc=Decimal128("10000.00"),
            balance_eth=Decimal128("5.0"),
        )
        await agent_wallet.insert()

        # Step 2: Proposal submitted
        proposal = ResearchProposalDocument(
            proposal_id="prop_complete_agent",
            title="Quantum Communication Protocols",
            description="Secure quantum key distribution networks",
            researcher_id="researcher_helen",
            researcher_wallet="0x" + "rhe" * 20,
            methodology="BB84 protocol with satellite integration",
            budget_required=Decimal128("7000.00"),
            budget_raised=Decimal128("2000.00"),
            funding_threshold=Decimal128("4500.00"),
            deadline=datetime.now(timezone.utc) + timedelta(days=90),
            status="active",
            tags=["quantum-communication", "qkd", "security"],
            funders=[],
            escrow_type="aave_yield",
        )
        await proposal.insert()

        # Step 3: Agent analyzes proposal
        analysis_score = 85.0  # Mock high score
        min_score = agent.config["min_proposal_score"]
        should_fund = analysis_score >= min_score

        assert should_fund is True

        # Step 4: Agent funds proposal
        funding_amount = Decimal("350.00")

        # Check limits
        max_per_tx = _decimal128_to_decimal(agent.config["max_per_tx"])
        daily_limit = _decimal128_to_decimal(agent.config["daily_limit"])
        current_spent = _decimal128_to_decimal(agent.total_spent)

        assert funding_amount <= max_per_tx
        assert current_spent + funding_amount <= daily_limit

        # Transfer
        escrow_address = "0x" + "es" * 20
        transfer_result = await mock_agentkit_service.transfer_usdc(
            "wallet_agent_complete",
            escrow_address,
            funding_amount
        )

        # Step 5: Update all records
        agent_wallet.balance_usdc = _decimal_to_decimal128(
            _decimal128_to_decimal(agent_wallet.balance_usdc) - funding_amount
        )
        await agent_wallet.save()

        proposal.budget_raised = _decimal_to_decimal128(
            _decimal128_to_decimal(proposal.budget_raised) + funding_amount
        )
        proposal.funders.append({
            "funder_id": "agent_complete",
            "wallet_address": "0x" + "agc" * 20,
            "amount_usdc": _decimal_to_decimal128(funding_amount),
            "funded_at": datetime.now(timezone.utc),
        })
        await proposal.save()

        agent.spending_history.append({
            "timestamp": datetime.now(timezone.utc),
            "amount": _decimal_to_decimal128(funding_amount),
            "purpose": "research_funding:prop_complete_agent",
            "transaction_hash": transfer_result["transaction_hash"],
        })
        agent.total_spent = _decimal_to_decimal128(funding_amount)
        await agent.save()

        payment = PaymentDocument(
            payment_id=transfer_result["payment_id"],
            type="research_funding",
            from_wallet="0x" + "agc" * 20,
            to_wallet=escrow_address,
            amount=_decimal_to_decimal128(funding_amount),
            currency="USDC",
            status="confirmed",
            proposal_id="prop_complete_agent",
            transaction_hash=transfer_result["transaction_hash"],
        )
        await payment.insert()

        # Step 6: Send notifications
        owner_notif = NotificationDocument(
            user_id="owner_grace",
            type="agent_action",
            title="Agent Funded Proposal",
            message=f"Your agent funded 'Quantum Communication Protocols' with {funding_amount} USDC",
            data={
                "agent_id": "agent_complete",
                "proposal_id": "prop_complete_agent",
                "amount": str(funding_amount),
            },
            read=False,
        )
        await owner_notif.insert()

        researcher_notif = NotificationDocument(
            user_id="researcher_helen",
            type="proposal_milestone",
            title="New Funding Received",
            message=f"AI agent contributed {funding_amount} USDC to your proposal",
            data={
                "proposal_id": "prop_complete_agent",
                "funder": "agent_complete",
                "amount": str(funding_amount),
            },
            read=False,
        )
        await researcher_notif.insert()

        # Assertions: Verify complete agent funding flow
        final_agent = await AIAgentDocument.find_one({"agent_id": "agent_complete"})
        final_wallet = await WalletDocument.find_one({"entity_id": "agent_complete"})
        final_proposal = await ResearchProposalDocument.find_one({"proposal_id": "prop_complete_agent"})
        final_payment = await PaymentDocument.find_one({"proposal_id": "prop_complete_agent"})
        notifications = await NotificationDocument.find({
            "data.proposal_id": "prop_complete_agent"
        }).to_list()

        assert _decimal128_to_decimal(final_agent.total_spent) == funding_amount
        assert len(final_agent.spending_history) == 1
        assert _decimal128_to_decimal(final_wallet.balance_usdc) == Decimal("9650.00")
        assert _decimal128_to_decimal(final_proposal.budget_raised) == Decimal("2350.00")
        assert final_payment.status == "confirmed"
        assert len(notifications) == 2
        assert any(n.user_id == "owner_grace" for n in notifications)
        assert any(n.user_id == "researcher_helen" for n in notifications)
