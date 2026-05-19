"""
Pytest fixtures for integration tests.

Sets up test database with real MongoDB connection (test database).
Provides fixtures for common test data and service mocking.
"""
from __future__ import annotations

import asyncio
import os
from decimal import Decimal
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from beanie import init_beanie
from bson import Decimal128
from motor.motor_asyncio import AsyncIOMotorClient

from db.agentkit_collections import (
    AGENTKIT_COLLECTIONS,
    PaymentDocument,
    ResearchProposalDocument,
    WalletDocument,
    WorkerPricingDocument,
    AIAgentDocument,
    NotificationDocument,
)


# ---------------------------------------------------------------------------
# Database Fixtures
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(scope="session")
async def test_db_client() -> AsyncGenerator[AsyncIOMotorClient, None]:
    """Session-scoped MongoDB client for test database."""
    mongodb_uri = os.getenv("QB2_MONGODB_TEST_URI", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongodb_uri)

    # Verify connection
    try:
        await client.admin.command("ping")
        print(f"\n✓ Connected to test MongoDB at {mongodb_uri}")
    except Exception as e:
        pytest.fail(f"Failed to connect to test MongoDB: {e}")

    yield client

    # Cleanup: Drop test database
    await client.drop_database("test_agentkit")
    client.close()
    print("\n✓ Test database cleaned up")


@pytest_asyncio.fixture
async def test_db(test_db_client: AsyncIOMotorClient) -> AsyncGenerator[AsyncIOMotorClient, None]:
    """Function-scoped test database with clean state for each test."""
    db = test_db_client["test_agentkit"]

    # Initialize Beanie with test collections
    await init_beanie(database=db, document_models=AGENTKIT_COLLECTIONS)

    yield db

    # Cleanup: Clear all collections after test
    for collection in AGENTKIT_COLLECTIONS:
        await collection.delete_all()


# ---------------------------------------------------------------------------
# Mock Service Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_agentkit_service():
    """Mock AgentKitService for testing without real blockchain operations."""
    service = MagicMock()

    # Mock wallet creation
    async def mock_create_wallet(entity_id: str, entity_type: str):
        return {
            "wallet_id": f"wallet_{entity_id}",
            "address": f"0x{'1' * 40}",
            "network": "base-sepolia",
        }
    service.create_wallet = AsyncMock(side_effect=mock_create_wallet)

    # Mock balance queries
    async def mock_get_balance(wallet_id: str):
        return {"usdc": Decimal("1000.00"), "eth": Decimal("0.5")}
    service.get_balance = AsyncMock(side_effect=mock_get_balance)

    # Mock USDC transfers
    async def mock_transfer_usdc(wallet_id: str, to_address: str, amount: Decimal):
        return {
            "payment_id": f"payment_{wallet_id[:8]}",
            "transaction_hash": f"0x{'a' * 64}",
            "basescan_url": f"https://sepolia.basescan.org/tx/0x{'a' * 64}",
            "status": "confirmed",
        }
    service.transfer_usdc = AsyncMock(side_effect=mock_transfer_usdc)

    # Mock faucet requests
    async def mock_request_faucet(wallet_id: str):
        return {"amount": Decimal("100.00"), "status": "success"}
    service.request_faucet = AsyncMock(side_effect=mock_request_faucet)

    return service


@pytest.fixture
def mock_aave_service():
    """Mock AAVE escrow service for testing without real DeFi operations."""
    service = MagicMock()

    async def mock_deposit(amount: Decimal):
        return {"pool_address": f"0x{'2' * 40}", "aToken_received": amount}
    service.deposit = AsyncMock(side_effect=mock_deposit)

    async def mock_withdraw(amount: Decimal):
        return {"amount_withdrawn": amount, "yield_earned": Decimal("5.00")}
    service.withdraw = AsyncMock(side_effect=mock_withdraw)

    return service


@pytest.fixture
def mock_ipfs_service():
    """Mock Web3.Storage/IPFS service for testing without real uploads."""
    service = MagicMock()

    async def mock_upload(content: str):
        return {"ipfs_hash": f"Qm{'X' * 44}", "url": f"https://ipfs.io/ipfs/Qm{'X' * 44}"}
    service.upload = AsyncMock(side_effect=mock_upload)

    return service


# ---------------------------------------------------------------------------
# Test Data Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_wallet_data():
    """Sample wallet data for creating test wallets."""
    return {
        "user": {
            "entity_id": "user_alice",
            "entity_type": "user",
            "wallet_id": "wallet_alice",
            "default_address": "0x" + "a1" * 20,
            "seed_encrypted": "encrypted_seed_alice",
            "balance_usdc": Decimal128("500.00"),
            "balance_eth": Decimal128("0.25"),
        },
        "worker": {
            "entity_id": "worker_bob",
            "entity_type": "worker",
            "wallet_id": "wallet_bob",
            "default_address": "0x" + "b2" * 20,
            "seed_encrypted": "encrypted_seed_bob",
            "balance_usdc": Decimal128("100.00"),
            "balance_eth": Decimal128("0.1"),
        },
        "agent": {
            "entity_id": "agent_charlie",
            "entity_type": "agent",
            "wallet_id": "wallet_charlie",
            "default_address": "0x" + "c3" * 20,
            "seed_encrypted": "encrypted_seed_charlie",
            "balance_usdc": Decimal128("1000.00"),
            "balance_eth": Decimal128("0.5"),
        },
    }


@pytest.fixture
def sample_worker_pricing():
    """Sample worker pricing data for marketplace tests."""
    return {
        "worker_id": "worker_bob",
        "wallet_address": "0x" + "b2" * 20,
        "pricing": {
            "hadamard": Decimal128("0.10"),
            "cnot": Decimal128("0.20"),
            "measurement": Decimal128("0.15"),
        },
        "performance_tier": "silver",
        "reputation_score": 75.5,
        "total_earned": Decimal128("250.00"),
        "jobs_completed": 25,
        "is_active": True,
    }


@pytest.fixture
def sample_research_proposal():
    """Sample research proposal data for crowdfunding tests."""
    from datetime import datetime, timezone, timedelta

    return {
        "proposal_id": "prop_quantum_ml",
        "title": "Quantum Machine Learning for Drug Discovery",
        "description": "Exploring quantum algorithms for molecular simulations",
        "researcher_id": "researcher_alice",
        "researcher_wallet": "0x" + "a1" * 20,
        "methodology": "VQE + QAOA hybrid approach",
        "budget_required": Decimal128("5000.00"),
        "budget_raised": Decimal128("0.00"),
        "funding_threshold": Decimal128("3000.00"),
        "deadline": datetime.now(timezone.utc) + timedelta(days=30),
        "status": "active",
        "tags": ["quantum-ml", "drug-discovery", "vqe"],
        "fragments": [],
        "funders": [],
        "escrow_type": "simple",
    }


@pytest.fixture
def sample_ai_agent():
    """Sample AI agent data for autonomous funding tests."""
    return {
        "agent_id": "agent_auto_fund",
        "owner_id": "user_alice",
        "agent_name": "AutoFund AI",
        "wallet_id": "wallet_agent_auto",
        "wallet_address": "0x" + "aa" * 20,
        "config": {
            "auto_fund": True,
            "max_per_tx": Decimal128("100.00"),
            "daily_limit": Decimal128("500.00"),
        },
        "spending_history": [],
        "total_spent": Decimal128("0.00"),
    }


# ---------------------------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------------------------

def decimal_to_decimal128(value: Decimal | float | int) -> Decimal128:
    """Convert Python Decimal/float/int to BSON Decimal128."""
    return Decimal128(str(value))


def decimal128_to_decimal(value: Decimal128) -> Decimal:
    """Convert BSON Decimal128 to Python Decimal."""
    return value.to_decimal()
