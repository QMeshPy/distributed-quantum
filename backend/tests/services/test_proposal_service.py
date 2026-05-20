"""
Unit tests for ProposalService - Research Crowdfunding with AI Auto-Fragmentation.

Tests cover:
1. Proposal creation (basic and with auto-fragmentation)
2. Proposal funding with Aave escrow
3. Fragment claiming and management
4. Results submission with IPFS storage
5. Payment distribution and escrow release
6. AI agent broadcasting
"""

from __future__ import annotations

import sys
import pytest
import uuid
import json
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, Mock, patch, ANY, create_autospec

# Mock problematic dependencies before importing
from pydantic import BaseModel

mock_beanie = MagicMock()
# Make Document behave like BaseModel for Pydantic compatibility
mock_beanie.Document = BaseModel
sys.modules['beanie'] = mock_beanie

# Mock motor
sys.modules['motor'] = MagicMock()
sys.modules['motor.motor_asyncio'] = MagicMock()

# Mock boto3
sys.modules['boto3'] = MagicMock()
sys.modules['botocore'] = MagicMock()
sys.modules['botocore.exceptions'] = MagicMock()

# Now safe to import
from services.proposal_service import ProposalService


@pytest.fixture
def mock_mongo_db():
    """Mock MongoDB database with collections."""
    db = MagicMock()

    # Mock collections
    db.wallets = MagicMock()
    db.wallets.find_one = AsyncMock()

    db.research_proposals = MagicMock()
    db.research_proposals.find_one = AsyncMock()
    db.research_proposals.insert_one = AsyncMock()
    db.research_proposals.update_one = AsyncMock()

    db.payments = MagicMock()
    db.payments.insert_one = AsyncMock()

    db.ai_agents = MagicMock()
    db.ai_agents.find = MagicMock()

    return db


@pytest.fixture
def mock_bedrock_client():
    """Mock AWS Bedrock client for Claude 3.5 Sonnet."""
    client = MagicMock()

    # Mock invoke_model response
    mock_response = MagicMock()
    mock_body = MagicMock()
    mock_body.read.return_value = json.dumps({
        "content": [{
            "text": json.dumps({
                "fragments": [
                    {
                        "title": "QAOA on 20-Asset Portfolios",
                        "budget": 10.0,
                        "methodology": "Test QAOA depths p=1,2,3 on 100 random portfolios",
                        "deliverables": ["CSV results", "Analysis report"],
                        "expected_duration_days": 5,
                        "success_criteria": "Achieve >90% solution quality"
                    },
                    {
                        "title": "QAOA on 40-Asset Portfolios",
                        "budget": 15.0,
                        "methodology": "Test QAOA depths p=1,2,3 on 100 random portfolios",
                        "deliverables": ["CSV results", "Analysis report"],
                        "expected_duration_days": 7,
                        "success_criteria": "Achieve >85% solution quality"
                    },
                    {
                        "title": "Classical Baseline Comparison",
                        "budget": 5.0,
                        "methodology": "Run simulated annealing baseline",
                        "deliverables": ["Comparison report"],
                        "expected_duration_days": 3,
                        "success_criteria": "Complete baseline for all test cases"
                    }
                ],
                "integration_plan": "Combine all results into meta-analysis",
                "total_budget_check": 30.0
            })
        }]
    }).encode()

    mock_response.__getitem__ = lambda self, key: mock_body if key == "body" else None
    client.invoke_model.return_value = mock_response

    return client


@pytest.fixture
def mock_ipfs_service():
    """Mock IPFS service for result uploads."""
    service = MagicMock()
    service.upload_research_results = AsyncMock(return_value={
        "cid": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
        "url": "https://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi.ipfs.w3s.link"
    })
    return service


@pytest.fixture
def mock_agentkit_service():
    """Mock AgentKitService for Aave operations."""
    service = MagicMock()

    service.aave_supply = AsyncMock(return_value={
        "transaction_hash": "0xabc123",
        "aave_pool_address": "0xdef456",
        "basescan_url": "https://sepolia.basescan.org/tx/0xabc123"
    })

    service.aave_withdraw = AsyncMock(return_value={
        "transaction_hash": "0xghi789",
        "basescan_url": "https://sepolia.basescan.org/tx/0xghi789"
    })

    return service


@pytest.fixture
def mock_notification_service():
    """Mock NotificationService."""
    service = MagicMock()
    service.notify_new_proposal = AsyncMock()
    service.notify_proposal_funded = AsyncMock()
    service.notify_fragment_claimed = AsyncMock()
    service.notify_results_published = AsyncMock()
    return service


@pytest.fixture
def mock_ai_agent_service():
    """Mock AIAgentService."""
    service = MagicMock()
    service.analyze_proposal = AsyncMock()
    return service


@pytest.fixture
def proposal_service(mock_mongo_db, mock_bedrock_client, mock_notification_service, mock_agentkit_service, mock_ai_agent_service):
    """Create ProposalService instance with mocked dependencies."""
    # boto3 and motor are already mocked at module level via sys.modules
    # Just create service and inject mocks
    service = ProposalService(
        notification_service=mock_notification_service,
        agentkit_service=mock_agentkit_service,
        ai_agent_service=mock_ai_agent_service
    )
    service.db = mock_mongo_db
    service.bedrock = mock_bedrock_client

    return service


# ============================================================================
# Test 1: Basic Proposal Creation
# ============================================================================

@pytest.mark.anyio
async def test_create_proposal(proposal_service, mock_mongo_db, mock_notification_service):
    """Test creating a basic research proposal without auto-fragmentation."""
    # Setup
    researcher_id = "researcher_001"
    researcher_wallet = "0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA"

    mock_mongo_db.wallets.find_one.return_value = {
        "entity_id": researcher_id,
        "default_address": researcher_wallet
    }

    if True:
        # Execute
        result = await proposal_service.create_proposal(
            researcher_id=researcher_id,
            title="Quantum Portfolio Optimization Study",
            description="Research quantum algorithms for portfolio optimization",
            methodology="Use QAOA with multiple ansatzes",
            budget_required=Decimal("100.0"),
            tags=["quantum", "finance", "optimization"],
            deadline_days=30,
            expected_timeline="2 months",
            auto_fragment=False
        )

    # Assert
    assert "proposal_id" in result
    assert result["title"] == "Quantum Portfolio Optimization Study"
    assert result["researcher_id"] == researcher_id
    assert result["researcher_wallet"] == researcher_wallet
    assert result["budget_required"] == Decimal("100.0")
    assert result["funding_threshold"] == Decimal("70.0")  # Default 70%
    assert result["status"] == "active"
    assert result["fragments"] == []  # No auto-fragmentation
    assert result["escrow_setup"]["type"] == "aave_yield"

    # Verify MongoDB insert was called
    mock_mongo_db.research_proposals.insert_one.assert_called_once()
    inserted_doc = mock_mongo_db.research_proposals.insert_one.call_args[0][0]
    assert inserted_doc["title"] == "Quantum Portfolio Optimization Study"
    assert inserted_doc["status"] == "active"

    # Verify notification was sent
    mock_notification_service.notify_new_proposal.assert_called_once()


# ============================================================================
# Test 2: Proposal Creation with Auto-Fragmentation
# ============================================================================

@pytest.mark.anyio
async def test_create_proposal_with_auto_fragment(
    proposal_service,
    mock_mongo_db,
    mock_bedrock_client,
    mock_notification_service
):
    """Test creating a proposal with AI-powered auto-fragmentation."""
    # Setup
    researcher_id = "researcher_002"
    researcher_wallet = "0xbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbB"

    mock_mongo_db.wallets.find_one.return_value = {
        "entity_id": researcher_id,
        "default_address": researcher_wallet
    }

    # Mock prompt file
    with patch('builtins.open', create=True) as mock_open:
        mock_open.return_value.__enter__.return_value.read.return_value = (
            "Fragmentation prompt: {title}, {description}, {budget}"
        )

        if True:
            # Execute
            result = await proposal_service.create_proposal(
                researcher_id=researcher_id,
                title="Comprehensive QAOA Study",
                description="Test QAOA on various portfolio sizes",
                methodology="Systematic parameter sweep",
                budget_required=Decimal("30.0"),
                tags=["qaoa", "quantum", "optimization"],
                auto_fragment=True
            )

    # Assert
    assert "proposal_id" in result
    assert len(result["fragments"]) == 3  # Bedrock mock returns 3 fragments

    # Verify fragment structure
    fragment = result["fragments"][0]
    assert "fragment_id" in fragment
    assert fragment["title"] == "QAOA on 20-Asset Portfolios"
    assert fragment["budget"] == 10.0
    assert fragment["status"] == "available"
    assert fragment["claimed_by"] is None

    # Verify Bedrock was called
    mock_bedrock_client.invoke_model.assert_called_once()
    call_kwargs = mock_bedrock_client.invoke_model.call_args[1]
    assert "anthropic.claude-3-5-sonnet" in call_kwargs["modelId"]

    # Verify notification
    mock_notification_service.notify_new_proposal.assert_called_once()


# ============================================================================
# Test 3: Fund Proposal
# ============================================================================

@pytest.mark.anyio
async def test_fund_proposal(
    proposal_service,
    mock_mongo_db,
    mock_agentkit_service,
    mock_notification_service
):
    """Test funding a proposal with USDC via Aave escrow."""
    # Setup
    proposal_id = "proposal_123"
    funder_id = "funder_001"
    funder_wallet = "0xcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcCcC"

    from bson import Decimal128

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "status": "active",
        "deadline": datetime.now(timezone.utc) + timedelta(days=10),
        "researcher_wallet": "0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA",
        "budget_required": Decimal128("100.0"),
        "budget_raised": Decimal128("0.0"),
        "funding_threshold": Decimal128("70.0"),
        "funders": []
    }

    mock_mongo_db.wallets.find_one.return_value = {
        "entity_id": funder_id,
        "default_address": funder_wallet
    }

    if True:


        # Execute
        result = await proposal_service.fund_proposal(
            proposal_id=proposal_id,
            funder_id=funder_id,
            funder_type="user",
            amount=Decimal("50.0")
        )

    # Assert
    assert result["proposal_id"] == proposal_id
    assert result["funder_id"] == funder_id
    assert result["amount"] == Decimal("50.0")
    assert result["transaction_hash"] == "0xabc123"
    assert result["new_total_raised"] == Decimal("50.0")
    assert result["funding_percentage"] == 50.0
    assert result["fully_funded"] is False  # Not reached threshold yet

    # Verify Aave supply was called
    mock_agentkit_service.aave_supply.assert_called_once_with(
        wallet_address=funder_wallet,
        amount=Decimal("50.0"),
        on_behalf_of="0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA"
    )

    # Verify MongoDB update
    mock_mongo_db.research_proposals.update_one.assert_called_once()

    # Verify payment record created
    mock_mongo_db.payments.insert_one.assert_called_once()

    # Verify notification
    mock_notification_service.notify_proposal_funded.assert_called_once()


# ============================================================================
# Test 4: Fund Proposal Reaches Threshold
# ============================================================================

@pytest.mark.anyio
async def test_fund_proposal_reaches_threshold(
    proposal_service,
    mock_mongo_db,
    mock_agentkit_service,
    mock_notification_service
):
    """Test that proposal status changes when funding threshold is reached."""
    # Setup
    proposal_id = "proposal_456"

    from bson import Decimal128

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "status": "active",
        "deadline": datetime.now(timezone.utc) + timedelta(days=10),
        "researcher_wallet": "0xaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaA",
        "budget_required": Decimal128("100.0"),
        "budget_raised": Decimal128("60.0"),  # Already at 60
        "funding_threshold": Decimal128("70.0"),
        "funders": []
    }

    mock_mongo_db.wallets.find_one.return_value = {
        "entity_id": "funder_002",
        "default_address": "0xdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdDdD"
    }

    if True:


        # Execute - add 15 more to reach 75 (above threshold of 70)
        result = await proposal_service.fund_proposal(
            proposal_id=proposal_id,
            funder_id="funder_002",
            funder_type="agent",
            amount=Decimal("15.0")
        )

    # Assert
    assert result["fully_funded"] is True
    assert result["new_total_raised"] == Decimal("75.0")

    # Verify proposal was marked as funded
    update_calls = mock_mongo_db.research_proposals.update_one.call_args_list
    assert len(update_calls) == 2  # One for funding update, one for status change

    # Check that second update marks as "funded"
    status_update = update_calls[1][0][1]
    assert status_update["$set"]["status"] == "funded"


# ============================================================================
# Test 5: Claim Fragment
# ============================================================================

@pytest.mark.anyio
async def test_claim_fragment(proposal_service, mock_mongo_db, mock_notification_service):
    """Test researcher claiming a research fragment."""
    # Setup
    proposal_id = "proposal_789"
    fragment_id = "fragment_001"
    researcher_id = "researcher_003"

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "status": "funded",
        "fragments": [
            {
                "fragment_id": fragment_id,
                "title": "QAOA Performance Study",
                "budget": 10.0,
                "status": "available",
                "claimed_by": None
            },
            {
                "fragment_id": "fragment_002",
                "title": "Another Fragment",
                "budget": 5.0,
                "status": "available",
                "claimed_by": None
            }
        ]
    }

    if True:
        # Execute
        result = await proposal_service.claim_fragment(
            proposal_id=proposal_id,
            fragment_id=fragment_id,
            researcher_id=researcher_id
        )

    # Assert
    assert result["proposal_id"] == proposal_id
    assert result["fragment_id"] == fragment_id
    assert result["researcher_id"] == researcher_id
    assert result["fragment_title"] == "QAOA Performance Study"
    assert result["fragment_budget"] == 10.0
    assert "claimed_at" in result

    # Verify MongoDB update
    mock_mongo_db.research_proposals.update_one.assert_called_once()
    update_data = mock_mongo_db.research_proposals.update_one.call_args[0][1]

    # Verify fragment was claimed
    updated_fragments = update_data["$set"]["fragments"]
    claimed_fragment = updated_fragments[0]
    assert claimed_fragment["status"] == "claimed"
    assert claimed_fragment["claimed_by"] == researcher_id

    # Verify proposal status changed to in_progress
    assert update_data["$set"]["status"] == "in_progress"

    # Verify notification
    mock_notification_service.notify_fragment_claimed.assert_called_once()


# ============================================================================
# Test 6: Claim Fragment Already Claimed
# ============================================================================

@pytest.mark.anyio
async def test_claim_fragment_already_claimed(proposal_service, mock_mongo_db):
    """Test error when trying to claim an already-claimed fragment."""
    # Setup
    proposal_id = "proposal_999"
    fragment_id = "fragment_claimed"

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "status": "in_progress",
        "fragments": [
            {
                "fragment_id": fragment_id,
                "title": "Already Claimed Fragment",
                "budget": 10.0,
                "status": "claimed",
                "claimed_by": "researcher_other"
            }
        ]
    }

    # Execute and Assert
    with pytest.raises(ValueError, match="Fragment already claimed"):
        await proposal_service.claim_fragment(
            proposal_id=proposal_id,
            fragment_id=fragment_id,
            researcher_id="researcher_004"
        )


# ============================================================================
# Test 7: Submit Results for Fragment
# ============================================================================

@pytest.mark.anyio
async def test_submit_results_fragment(
    proposal_service,
    mock_mongo_db,
    mock_ipfs_service,
    mock_agentkit_service,
    mock_notification_service
):
    """Test submitting research results for a claimed fragment."""
    # Setup
    proposal_id = "proposal_111"
    fragment_id = "fragment_submit"
    researcher_id = "researcher_005"

    from bson import Decimal128

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "researcher_id": "original_researcher",
        "researcher_wallet": "0xeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeE",
        "fragments": [
            {
                "fragment_id": fragment_id,
                "title": "Test Fragment",
                "budget": 15.0,
                "status": "claimed",
                "claimed_by": researcher_id
            }
        ]
    }

    mock_mongo_db.wallets.find_one.return_value = {
        "entity_id": researcher_id,
        "default_address": "0x1111111111111111111111111111111111111111"
    }

    results_data = {
        "algorithm": "QAOA",
        "results": [{"trial": 1, "quality": 0.95}],
        "conclusion": "QAOA performs well"
    }

    with patch('utils.ipfs.get_ipfs_service', return_value=mock_ipfs_service):


        # Execute
        result = await proposal_service.submit_results(
            proposal_id=proposal_id,
            researcher_id=researcher_id,
            results_data=results_data,
            fragment_id=fragment_id
        )

    # Assert
    assert result["proposal_id"] == proposal_id
    assert result["fragment_id"] == fragment_id
    assert result["ipfs_hash"] == "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
    assert result["payment_released"] is True
    assert result["payment_amount"] == Decimal("15.0")
    assert result["transaction_hash"] == "0xghi789"

    # Verify IPFS upload
    mock_ipfs_service.upload_research_results.assert_called_once_with(results_data)

    # Verify fragment status updated
    mock_mongo_db.research_proposals.update_one.assert_called()
    update_data = mock_mongo_db.research_proposals.update_one.call_args[0][1]
    updated_fragment = update_data["$set"]["fragments"][0]
    assert updated_fragment["status"] == "completed"
    assert updated_fragment["results_ipfs_hash"] == "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"

    # Verify payment withdrawal from Aave
    mock_agentkit_service.aave_withdraw.assert_called_once()

    # Verify notification
    mock_notification_service.notify_results_published.assert_called_once()


# ============================================================================
# Test 8: Submit Results for Full Proposal
# ============================================================================

@pytest.mark.anyio
async def test_submit_results_full_proposal(
    proposal_service,
    mock_mongo_db,
    mock_ipfs_service,
    mock_agentkit_service,
    mock_notification_service
):
    """Test submitting research results for entire proposal (no fragments)."""
    # Setup
    proposal_id = "proposal_222"
    researcher_id = "researcher_006"

    from bson import Decimal128

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "researcher_id": researcher_id,
        "researcher_wallet": "0x2222222222222222222222222222222222222222",
        "budget_raised": Decimal128("100.0"),
        "fragments": []
    }

    results_data = {
        "final_report": "Complete research findings",
        "data_files": ["result1.csv", "result2.csv"]
    }

    with patch('utils.ipfs.get_ipfs_service', return_value=mock_ipfs_service):


        # Execute
        result = await proposal_service.submit_results(
            proposal_id=proposal_id,
            researcher_id=researcher_id,
            results_data=results_data,
            fragment_id=None
        )

    # Assert
    assert result["proposal_id"] == proposal_id
    assert result["fragment_id"] is None
    assert result["payment_released"] is True
    assert result["payment_amount"] == Decimal("100.0")

    # Verify proposal marked as completed
    update_data = mock_mongo_db.research_proposals.update_one.call_args[0][1]
    assert update_data["$set"]["status"] == "completed"
    assert "results_ipfs_hash" in update_data["$set"]

    # Verify full escrow released
    mock_agentkit_service.aave_withdraw.assert_called_once_with(
        wallet_address="0x2222222222222222222222222222222222222222",
        amount=Decimal("100.0"),
        to="0x2222222222222222222222222222222222222222"
    )


# ============================================================================
# Test 9: Auto-Fragment Calls Bedrock
# ============================================================================

@pytest.mark.anyio
async def test_auto_fragment_calls_bedrock(proposal_service, mock_bedrock_client):
    """Test that auto-fragmentation correctly calls AWS Bedrock."""
    # Mock prompt file
    with patch('builtins.open', create=True) as mock_open:
        mock_open.return_value.__enter__.return_value.read.return_value = (
            "Fragment this: {title}, {description}, {methodology}, {budget}, {timeline}, {tags}"
        )

        # Execute
        fragments = await proposal_service._auto_fragment_proposal(
            title="Test Proposal",
            description="Test description",
            methodology="Test methodology",
            budget=Decimal("30.0"),
            timeline="1 month",
            tags=["quantum", "test"]
        )

    # Assert
    assert len(fragments) == 3

    # Verify Bedrock was called with correct parameters
    mock_bedrock_client.invoke_model.assert_called_once()
    call_kwargs = mock_bedrock_client.invoke_model.call_args[1]

    assert "modelId" in call_kwargs
    assert "anthropic.claude-3-5-sonnet" in call_kwargs["modelId"]

    # Verify request body contains prompt
    body_str = call_kwargs["body"]
    body_dict = json.loads(body_str)
    assert "messages" in body_dict
    assert body_dict["messages"][0]["role"] == "user"
    assert "Test Proposal" in body_dict["messages"][0]["content"]

    # Verify fragment structure
    for fragment in fragments:
        assert "fragment_id" in fragment
        assert "title" in fragment
        assert "budget" in fragment
        assert "status" in fragment
        assert fragment["status"] == "available"


# ============================================================================
# Test 10: Pay Fragment Researcher
# ============================================================================

@pytest.mark.anyio
async def test_pay_fragment_researcher(
    proposal_service,
    mock_mongo_db,
    mock_agentkit_service
):
    """Test paying a fragment researcher from Aave escrow."""
    # Setup
    proposal_id = "proposal_333"
    fragment_id = "fragment_pay"

    from bson import Decimal128

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "researcher_wallet": "0x3333333333333333333333333333333333333333",
        "fragments": [
            {
                "fragment_id": fragment_id,
                "budget": 20.0,
                "claimed_by": "researcher_007"
            }
        ]
    }

    mock_mongo_db.wallets.find_one.return_value = {
        "entity_id": "researcher_007",
        "default_address": "0x4444444444444444444444444444444444444444"
    }

    if True:
        # Execute
        result = await proposal_service._pay_fragment_researcher(
            proposal_id=proposal_id,
            fragment_id=fragment_id
        )

    # Assert
    assert result["amount"] == Decimal("20.0")
    assert result["transaction_hash"] == "0xghi789"
    assert result["researcher_wallet"] == "0x4444444444444444444444444444444444444444"

    # Verify Aave withdrawal
    mock_agentkit_service.aave_withdraw.assert_called_once_with(
        wallet_address="0x3333333333333333333333333333333333333333",
        amount=Decimal("20.0"),
        to="0x4444444444444444444444444444444444444444"
    )

    # Verify payment recorded
    mock_mongo_db.payments.insert_one.assert_called_once()
    payment_doc = mock_mongo_db.payments.insert_one.call_args[0][0]
    assert payment_doc["type"] == "escrow_release"
    assert payment_doc["from_wallet"] == "0x3333333333333333333333333333333333333333"
    assert payment_doc["to_wallet"] == "0x4444444444444444444444444444444444444444"


# ============================================================================
# Test 11: Release All Escrow
# ============================================================================

@pytest.mark.anyio
async def test_release_all_escrow(
    proposal_service,
    mock_mongo_db,
    mock_agentkit_service
):
    """Test releasing all escrow funds to proposal researcher."""
    # Setup
    proposal_id = "proposal_444"

    from bson import Decimal128

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": proposal_id,
        "researcher_wallet": "0x5555555555555555555555555555555555555555",
        "budget_raised": Decimal128("150.0")
    }

    if True:
        # Execute
        result = await proposal_service._release_all_escrow(proposal_id)

    # Assert
    assert result["amount"] == Decimal("150.0")
    assert result["transaction_hash"] == "0xghi789"
    assert result["researcher_wallet"] == "0x5555555555555555555555555555555555555555"

    # Verify full withdrawal
    mock_agentkit_service.aave_withdraw.assert_called_once_with(
        wallet_address="0x5555555555555555555555555555555555555555",
        amount=Decimal("150.0"),
        to="0x5555555555555555555555555555555555555555"
    )

    # Verify payment recorded
    mock_mongo_db.payments.insert_one.assert_called_once()


# ============================================================================
# Test 12: Broadcast Triggers Agents
# ============================================================================

@pytest.mark.anyio
async def test_broadcast_triggers_agents(
    proposal_service,
    mock_mongo_db,
    mock_ai_agent_service
):
    """Test that new proposals are broadcast to AI agents for analysis."""
    # Setup
    proposal_data = {
        "proposal_id": "proposal_555",
        "title": "Test Proposal for Agents",
        "budget_required": 100.0
    }

    # Mock active agents with auto_fund enabled
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock(return_value=[
        {
            "agent_id": "agent_001",
            "agent_name": "QuantumFunder1",
            "config": {"auto_fund": True}
        },
        {
            "agent_id": "agent_002",
            "agent_name": "QuantumFunder2",
            "config": {"auto_fund": True}
        }
    ])
    mock_mongo_db.ai_agents.find.return_value = mock_cursor

    if True:
        # Execute
        result = await proposal_service._broadcast_new_proposal(proposal_data)

    # Assert
    assert result["proposal_id"] == "proposal_555"
    assert result["agents_notified"] == 2

    # Verify agents were queried
    mock_mongo_db.ai_agents.find.assert_called_once_with({"config.auto_fund": True})


# ============================================================================
# Additional Edge Case Tests
# ============================================================================

@pytest.mark.anyio
async def test_create_proposal_researcher_not_found(proposal_service, mock_mongo_db):
    """Test error when researcher wallet not found."""
    mock_mongo_db.wallets.find_one.return_value = None

    with pytest.raises(ValueError, match="Researcher wallet not found"):
        await proposal_service.create_proposal(
            researcher_id="nonexistent_researcher",
            title="Test",
            description="Test",
            methodology="Test",
            budget_required=Decimal("100.0"),
            tags=[]
        )


@pytest.mark.anyio
async def test_fund_proposal_deadline_passed(proposal_service, mock_mongo_db):
    """Test error when trying to fund expired proposal."""
    from bson import Decimal128

    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": "expired_proposal",
        "status": "active",
        "deadline": datetime.now(timezone.utc) - timedelta(days=1),  # Past deadline
        "budget_raised": Decimal128("0.0")
    }

    with pytest.raises(ValueError, match="deadline has passed"):
        await proposal_service.fund_proposal(
            proposal_id="expired_proposal",
            funder_id="funder_late",
            funder_type="user",
            amount=Decimal("50.0")
        )


@pytest.mark.anyio
async def test_claim_fragment_proposal_not_funded(proposal_service, mock_mongo_db):
    """Test error when trying to claim fragment from non-funded proposal."""
    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": "not_funded_proposal",
        "status": "active",  # Not funded yet
        "fragments": [{"fragment_id": "frag1", "status": "available"}]
    }

    with pytest.raises(ValueError, match="must be funded before claiming"):
        await proposal_service.claim_fragment(
            proposal_id="not_funded_proposal",
            fragment_id="frag1",
            researcher_id="researcher_eager"
        )


@pytest.mark.anyio
async def test_submit_results_unauthorized_researcher(proposal_service, mock_mongo_db):
    """Test error when unauthorized researcher tries to submit results."""
    mock_mongo_db.research_proposals.find_one.return_value = {
        "proposal_id": "proposal_secured",
        "researcher_id": "original_researcher",
        "fragments": []
    }

    with pytest.raises(ValueError, match="not authorized"):
        await proposal_service.submit_results(
            proposal_id="proposal_secured",
            researcher_id="unauthorized_researcher",
            results_data={"fake": "data"},
            fragment_id=None
        )
