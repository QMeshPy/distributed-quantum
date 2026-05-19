"""
Unit tests for AgentKitService - Wallet Management and USDC Transfers

Tests cover:
1. Wallet creation (success + duplicate)
2. Balance queries
3. USDC transfers (success + validation)
4. Aave escrow operations
5. Testnet faucet requests
6. Wallet loading and encryption

All tests use mocks for CDP API and MongoDB to ensure isolation.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import Decimal128

from src.services.agentkit_service import AgentKitService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_env_vars(monkeypatch):
    """Mock environment variables for AgentKit service."""
    monkeypatch.setenv("CDP_API_KEY_NAME", "test-key-id")
    monkeypatch.setenv("CDP_API_KEY_PRIVATE_KEY", "test-secret-key")
    monkeypatch.setenv("NETWORK", "base-sepolia")
    monkeypatch.setenv("QB2_MONGODB_LOCAL_URI", "mongodb://localhost:27017")
    monkeypatch.setenv("QB2_MONGODB_DATABASE", "test_db")


@pytest.fixture
def mock_mongo_client():
    """Mock MongoDB client with collections."""
    mock_client = MagicMock()
    mock_db = MagicMock()
    mock_client.__getitem__.return_value = mock_db

    # Create mock collections
    mock_db.wallets = AsyncMock()
    mock_db.payments = AsyncMock()

    return mock_client, mock_db


@pytest.fixture
def mock_wallet_provider():
    """Mock CDP EVM wallet provider."""
    mock_provider = MagicMock()
    mock_provider.get_address.return_value = "0x1234567890123456789012345678901234567890"
    mock_provider.get_balance.return_value = 100000000000000000  # 0.1 ETH in wei
    mock_provider.send_transaction.return_value = "0xabcd1234" + "0" * 56  # 64 hex chars

    # Mock web3 instance
    mock_web3 = MagicMock()
    mock_provider._web3 = mock_web3

    return mock_provider


@pytest.fixture
def agentkit_service(mock_env_vars, mock_mongo_client):
    """Create AgentKitService instance with mocked dependencies."""
    mock_client, mock_db = mock_mongo_client

    with patch("services.agentkit_service.AsyncIOMotorClient", return_value=mock_client):
        service = AgentKitService()
        service.db = mock_db
        return service


# ---------------------------------------------------------------------------
# Test 1: Create Wallet Success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_wallet_success(agentkit_service, mock_wallet_provider):
    """Test successful wallet creation for a new entity."""
    # Arrange
    entity_id = "user-123"
    entity_type = "user"

    # Mock: No existing wallet
    agentkit_service.db.wallets.find_one = AsyncMock(return_value=None)
    agentkit_service.db.wallets.insert_one = AsyncMock()

    with patch(
        "services.agentkit_service.CdpEvmWalletProvider",
        return_value=mock_wallet_provider
    ):
        with patch.object(agentkit_service, "request_testnet_funds", new_callable=AsyncMock):
            # Act
            result = await agentkit_service.create_wallet(entity_id, entity_type)

    # Assert
    assert result["wallet_address"] == mock_wallet_provider.get_address()
    assert result["entity_id"] == entity_id
    assert result["entity_type"] == entity_type
    assert result["network_id"] == "base-sepolia"
    assert "created_at" in result

    # Verify MongoDB insert was called
    agentkit_service.db.wallets.insert_one.assert_called_once()
    inserted_doc = agentkit_service.db.wallets.insert_one.call_args[0][0]
    assert inserted_doc["entity_id"] == entity_id
    assert inserted_doc["default_address"] == mock_wallet_provider.get_address()
    assert "seed_encrypted" in inserted_doc


# ---------------------------------------------------------------------------
# Test 2: Create Wallet Duplicate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_wallet_duplicate(agentkit_service):
    """Test wallet creation when entity already has a wallet."""
    # Arrange
    entity_id = "user-456"
    entity_type = "user"
    existing_address = "0xabcdef1234567890abcdef1234567890abcdef12"
    existing_wallet = {
        "entity_id": entity_id,
        "entity_type": entity_type,
        "default_address": existing_address,
        "network": "base-sepolia",
        "created_at": datetime.now(timezone.utc),
    }

    # Mock: Existing wallet found
    agentkit_service.db.wallets.find_one = AsyncMock(return_value=existing_wallet)

    # Act
    result = await agentkit_service.create_wallet(entity_id, entity_type)

    # Assert
    assert result["wallet_address"] == existing_address
    assert result["entity_id"] == entity_id
    assert result["entity_type"] == entity_type
    assert result["network_id"] == "base-sepolia"

    # Verify no new wallet was created (insert_one not called)
    agentkit_service.db.wallets.insert_one.assert_not_called()


# ---------------------------------------------------------------------------
# Test 3: Get Balance Success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_balance_success(agentkit_service, mock_wallet_provider):
    """Test successful balance query for USDC and ETH."""
    # Arrange
    wallet_address = "0x1234567890123456789012345678901234567890"

    # Mock wallet loading
    with patch.object(
        agentkit_service, "_load_wallet", new_callable=AsyncMock, return_value=mock_wallet_provider
    ):
        # Mock USDC contract balanceOf call
        mock_contract = MagicMock()
        mock_contract.functions.balanceOf.return_value.call.return_value = 1000000  # 1 USDC (6 decimals)

        mock_web3 = mock_wallet_provider._web3
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3.to_checksum_address = lambda addr: addr

        # Mock MongoDB update
        agentkit_service.db.wallets.update_one = AsyncMock()

        # Act
        result = await agentkit_service.get_balance(wallet_address)

    # Assert
    assert result["wallet_address"] == wallet_address
    assert result["usdc_balance"] == Decimal("1")
    assert result["eth_balance"] == Decimal("0.1")
    assert result["network_id"] == "base-sepolia"
    assert "timestamp" in result

    # Verify MongoDB update was called
    agentkit_service.db.wallets.update_one.assert_called_once()


# ---------------------------------------------------------------------------
# Test 4: Transfer USDC Success
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transfer_usdc_success(agentkit_service, mock_wallet_provider):
    """Test successful USDC transfer between wallets."""
    # Arrange
    from_address = "0x1234567890123456789012345678901234567890"
    to_address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    amount = Decimal("10.5")
    tx_hash = "0xabcd1234" + "0" * 56

    # Mock wallet loading
    with patch.object(
        agentkit_service, "_load_wallet", new_callable=AsyncMock, return_value=mock_wallet_provider
    ):
        # Mock balance check (sufficient funds)
        with patch.object(
            agentkit_service,
            "get_balance",
            new_callable=AsyncMock,
            return_value={
                "usdc_balance": Decimal("50"),
                "eth_balance": Decimal("0.1"),
            }
        ):
            # Mock USDC contract transfer
            mock_contract = MagicMock()
            mock_build_tx = {"from": from_address, "nonce": 0}
            mock_contract.functions.transfer.return_value.build_transaction.return_value = mock_build_tx

            mock_web3 = mock_wallet_provider._web3
            mock_web3.eth.contract.return_value = mock_contract
            mock_web3.eth.get_transaction_count.return_value = 0
            mock_web3.to_checksum_address = lambda addr: addr

            # Mock payment insertion
            agentkit_service.db.payments.insert_one = AsyncMock()

            # Act
            result = await agentkit_service.transfer_usdc(
                from_address, to_address, amount, metadata={"job_id": "job-123"}
            )

    # Assert
    assert result["transaction_hash"] == tx_hash
    assert result["from_address"] == from_address
    assert result["to_address"] == to_address
    assert result["amount"] == amount
    assert result["status"] == "submitted"
    assert "basescan_url" in result
    assert result["metadata"]["job_id"] == "job-123"

    # Verify payment record was created
    agentkit_service.db.payments.insert_one.assert_called_once()


# ---------------------------------------------------------------------------
# Test 5: Transfer Insufficient Balance
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transfer_insufficient_balance(agentkit_service, mock_wallet_provider):
    """Test USDC transfer fails when sender has insufficient balance."""
    # Arrange
    from_address = "0x1234567890123456789012345678901234567890"
    to_address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    amount = Decimal("100")

    # Mock wallet loading
    with patch.object(
        agentkit_service, "_load_wallet", new_callable=AsyncMock, return_value=mock_wallet_provider
    ):
        # Mock balance check (insufficient funds)
        with patch.object(
            agentkit_service,
            "get_balance",
            new_callable=AsyncMock,
            return_value={
                "usdc_balance": Decimal("10"),  # Less than amount
                "eth_balance": Decimal("0.1"),
            }
        ):
            # Act & Assert
            with pytest.raises(ValueError, match="Insufficient USDC balance"):
                await agentkit_service.transfer_usdc(from_address, to_address, amount)


# ---------------------------------------------------------------------------
# Test 6: Aave Supply (Escrow Deposit)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_aave_supply_escrow(agentkit_service, mock_wallet_provider):
    """Test supplying USDC to Aave protocol for escrow."""
    # Arrange
    wallet_address = "0x1234567890123456789012345678901234567890"
    amount = Decimal("50")
    on_behalf_of = wallet_address
    approve_tx_hash = "0x1111" + "0" * 60
    supply_tx_hash = "0x2222" + "0" * 60

    # Mock wallet loading
    with patch.object(
        agentkit_service, "_load_wallet", new_callable=AsyncMock, return_value=mock_wallet_provider
    ):
        # Mock balance check (sufficient funds)
        with patch.object(
            agentkit_service,
            "get_balance",
            new_callable=AsyncMock,
            return_value={
                "usdc_balance": Decimal("100"),
                "eth_balance": Decimal("0.1"),
            }
        ):
            # Mock USDC approve and Aave supply contracts
            mock_usdc_contract = MagicMock()
            mock_aave_contract = MagicMock()

            mock_usdc_contract.functions.approve.return_value.build_transaction.return_value = {
                "from": wallet_address, "nonce": 0
            }
            mock_aave_contract.functions.supply.return_value.build_transaction.return_value = {
                "from": wallet_address, "nonce": 1
            }

            mock_web3 = mock_wallet_provider._web3
            mock_web3.eth.contract.side_effect = [mock_usdc_contract, mock_aave_contract]
            mock_web3.eth.get_transaction_count.side_effect = [0, 1]
            mock_web3.to_checksum_address = lambda addr: addr

            # Mock provider to return different tx hashes
            mock_wallet_provider.send_transaction.side_effect = [approve_tx_hash, supply_tx_hash]

            # Mock payment insertion
            agentkit_service.db.payments.insert_one = AsyncMock()

            # Act
            result = await agentkit_service.aave_supply(wallet_address, amount, on_behalf_of)

    # Assert
    assert result["transaction_hash"] == supply_tx_hash
    assert result["wallet_address"] == wallet_address
    assert result["amount"] == amount
    assert result["on_behalf_of"] == on_behalf_of
    assert result["status"] == "submitted"
    assert "basescan_url" in result

    # Verify payment record was created
    agentkit_service.db.payments.insert_one.assert_called_once()
    payment_doc = agentkit_service.db.payments.insert_one.call_args[0][0]
    assert payment_doc["type"] == "escrow_deposit"


# ---------------------------------------------------------------------------
# Test 7: Aave Withdraw (Escrow Release)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_aave_withdraw(agentkit_service, mock_wallet_provider):
    """Test withdrawing USDC from Aave protocol (escrow release)."""
    # Arrange
    wallet_address = "0x1234567890123456789012345678901234567890"
    to_address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    amount = Decimal("25")
    tx_hash = "0x3333" + "0" * 60

    # Mock wallet loading
    with patch.object(
        agentkit_service, "_load_wallet", new_callable=AsyncMock, return_value=mock_wallet_provider
    ):
        # Mock Aave withdraw contract
        mock_contract = MagicMock()
        mock_contract.functions.withdraw.return_value.build_transaction.return_value = {
            "from": wallet_address, "nonce": 0
        }

        mock_web3 = mock_wallet_provider._web3
        mock_web3.eth.contract.return_value = mock_contract
        mock_web3.eth.get_transaction_count.return_value = 0
        mock_web3.to_checksum_address = lambda addr: addr

        # Mock wallet provider transaction
        mock_wallet_provider.send_transaction.return_value = tx_hash

        # Mock payment insertion
        agentkit_service.db.payments.insert_one = AsyncMock()

        # Act
        result = await agentkit_service.aave_withdraw(wallet_address, amount, to_address)

    # Assert
    assert result["transaction_hash"] == tx_hash
    assert result["wallet_address"] == wallet_address
    assert result["amount"] == amount
    assert result["to"] == to_address
    assert result["status"] == "submitted"
    assert "basescan_url" in result

    # Verify payment record was created
    agentkit_service.db.payments.insert_one.assert_called_once()
    payment_doc = agentkit_service.db.payments.insert_one.call_args[0][0]
    assert payment_doc["type"] == "escrow_release"


# ---------------------------------------------------------------------------
# Test 8: Request Testnet Funds
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_request_testnet_funds(agentkit_service):
    """Test requesting testnet funds from faucet."""
    # Arrange
    wallet_address = "0x1234567890123456789012345678901234567890"

    # Act
    result = await agentkit_service.request_testnet_funds(wallet_address)

    # Assert
    assert result["wallet_address"] == wallet_address
    assert "faucet_url" in result
    assert result["status"] == "manual_request_required"
    assert "message" in result
    assert "timestamp" in result


# ---------------------------------------------------------------------------
# Test 9: Load Wallet Not Found
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_load_wallet_not_found(agentkit_service):
    """Test loading a non-existent wallet raises ValueError."""
    # Arrange
    wallet_address = "0x1234567890123456789012345678901234567890"

    # Mock: Wallet not found in database
    agentkit_service.db.wallets.find_one = AsyncMock(return_value=None)

    # Act & Assert
    with pytest.raises(ValueError, match="Wallet not found"):
        await agentkit_service._load_wallet(wallet_address)


# ---------------------------------------------------------------------------
# Test 10: Wallet Seed Encryption
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_wallet_seed_encryption(agentkit_service, mock_wallet_provider):
    """Test that wallet seeds are properly encrypted during creation."""
    # Arrange
    entity_id = "user-crypto-test"
    entity_type = "user"

    # Mock: No existing wallet
    agentkit_service.db.wallets.find_one = AsyncMock(return_value=None)
    agentkit_service.db.wallets.insert_one = AsyncMock()

    with patch(
        "services.agentkit_service.CdpEvmWalletProvider",
        return_value=mock_wallet_provider
    ):
        with patch.object(agentkit_service, "request_testnet_funds", new_callable=AsyncMock):
            # Act
            await agentkit_service.create_wallet(entity_id, entity_type)

    # Assert
    inserted_doc = agentkit_service.db.wallets.insert_one.call_args[0][0]
    assert "seed_encrypted" in inserted_doc

    # Verify encrypted seed can be decrypted
    encrypted_seed = inserted_doc["seed_encrypted"]
    decrypted_seed = agentkit_service.fernet.decrypt(encrypted_seed.encode()).decode()

    # Decrypted seed should be a valid UUID-like string (36 chars with dashes)
    assert len(decrypted_seed) >= 32  # At minimum, a UUID without dashes


# ---------------------------------------------------------------------------
# Test 11: Validate Invalid Entity Type
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_wallet_invalid_entity_type(agentkit_service):
    """Test wallet creation fails with invalid entity type."""
    # Arrange
    entity_id = "test-123"
    entity_type = "invalid_type"

    # Act & Assert
    with pytest.raises(ValueError, match="Invalid entity_type"):
        await agentkit_service.create_wallet(entity_id, entity_type)


# ---------------------------------------------------------------------------
# Test 12: Transfer with Invalid Address Format
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transfer_invalid_address(agentkit_service):
    """Test USDC transfer fails with invalid address format."""
    # Arrange
    from_address = "invalid-address"
    to_address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    amount = Decimal("10")

    # Act & Assert
    with pytest.raises(ValueError, match="Invalid address format"):
        await agentkit_service.transfer_usdc(from_address, to_address, amount)


# ---------------------------------------------------------------------------
# Test 13: Transfer with Negative Amount
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_transfer_negative_amount(agentkit_service, mock_wallet_provider):
    """Test USDC transfer fails with negative amount."""
    # Arrange
    from_address = "0x1234567890123456789012345678901234567890"
    to_address = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    amount = Decimal("-10")

    # Mock wallet loading
    with patch.object(
        agentkit_service, "_load_wallet", new_callable=AsyncMock, return_value=mock_wallet_provider
    ):
        # Act & Assert
        with pytest.raises(ValueError, match="Transfer amount must be positive"):
            await agentkit_service.transfer_usdc(from_address, to_address, amount)


# ---------------------------------------------------------------------------
# Test 14: Get Balance Invalid Address
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_balance_invalid_address(agentkit_service):
    """Test balance query fails with invalid address format."""
    # Arrange
    wallet_address = "not-a-valid-address"

    # Act & Assert
    with pytest.raises(ValueError, match="Invalid address format"):
        await agentkit_service.get_balance(wallet_address)
