"""Wallet-related Pydantic models for AgentKit crypto payment integration."""

from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


class WalletCreate(BaseModel):
    """Request schema for creating a new wallet."""

    entity_id: str = Field(..., description="ID of the entity (agent, client, etc.)")
    entity_type: str = Field(..., description="Type of entity (agent, client, system)")

    @field_validator("entity_id")
    @classmethod
    def validate_entity_id(cls, v: str) -> str:
        """Validate entity_id is not empty."""
        if not v or not v.strip():
            raise ValueError("entity_id cannot be empty")
        return v.strip()

    @field_validator("entity_type")
    @classmethod
    def validate_entity_type(cls, v: str) -> str:
        """Validate entity_type is one of allowed values."""
        allowed_types = {"agent", "client", "system", "worker"}
        v = v.strip().lower()
        if v not in allowed_types:
            raise ValueError(f"entity_type must be one of {allowed_types}")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "entity_id": "agent_123",
                "entity_type": "agent"
            }
        }
    )


class WalletResponse(BaseModel):
    """Response schema for wallet information."""

    wallet_id: str = Field(..., description="Unique wallet identifier")
    address: str = Field(..., description="Ethereum wallet address")
    network: str = Field(..., description="Network name (e.g., base-sepolia)")
    balance_usdc: Decimal = Field(..., description="USDC balance")
    balance_eth: Decimal = Field(..., description="ETH balance")

    @field_validator("address")
    @classmethod
    def validate_ethereum_address(cls, v: str) -> str:
        """Validate Ethereum address format."""
        if not v.startswith("0x"):
            raise ValueError("Ethereum address must start with 0x")
        if len(v) != 42:
            raise ValueError("Ethereum address must be 42 characters long")
        if not all(c in "0123456789abcdefABCDEF" for c in v[2:]):
            raise ValueError("Ethereum address contains invalid characters")
        return v.lower()

    @field_validator("balance_usdc", "balance_eth")
    @classmethod
    def validate_balance(cls, v: Decimal) -> Decimal:
        """Validate balance is non-negative."""
        if v < 0:
            raise ValueError("Balance cannot be negative")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "wallet_id": "wallet_abc123",
                "address": "0x1234567890123456789012345678901234567890",
                "network": "base-sepolia",
                "balance_usdc": "100.50",
                "balance_eth": "0.05"
            }
        }
    )


class TransferRequest(BaseModel):
    """Request schema for transferring funds."""

    to_address: str = Field(..., description="Recipient Ethereum address")
    amount: Decimal = Field(..., gt=0, description="Amount to transfer")
    metadata: Optional[dict] = Field(
        default=None,
        description="Optional metadata for the transfer"
    )

    @field_validator("to_address")
    @classmethod
    def validate_ethereum_address(cls, v: str) -> str:
        """Validate Ethereum address format."""
        if not v.startswith("0x"):
            raise ValueError("Ethereum address must start with 0x")
        if len(v) != 42:
            raise ValueError("Ethereum address must be 42 characters long")
        if not all(c in "0123456789abcdefABCDEF" for c in v[2:]):
            raise ValueError("Ethereum address contains invalid characters")
        return v.lower()

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        """Validate amount is positive and has reasonable precision."""
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        if v.as_tuple().exponent < -6:
            raise ValueError("Amount cannot have more than 6 decimal places")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "to_address": "0x1234567890123456789012345678901234567890",
                "amount": "50.00",
                "metadata": {
                    "purpose": "job_payment",
                    "job_id": "job_456"
                }
            }
        }
    )


class TransferResponse(BaseModel):
    """Response schema for transfer operation."""

    payment_id: str = Field(..., description="Unique payment identifier")
    transaction_hash: str = Field(..., description="Blockchain transaction hash")
    basescan_url: str = Field(..., description="BaseScan explorer URL")
    status: str = Field(..., description="Transaction status")

    @field_validator("transaction_hash")
    @classmethod
    def validate_transaction_hash(cls, v: str) -> str:
        """Validate transaction hash format."""
        if not v.startswith("0x"):
            raise ValueError("Transaction hash must start with 0x")
        if len(v) != 66:
            raise ValueError("Transaction hash must be 66 characters long")
        if not all(c in "0123456789abcdefABCDEF" for c in v[2:]):
            raise ValueError("Transaction hash contains invalid characters")
        return v.lower()

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        """Validate status is one of allowed values."""
        allowed_statuses = {"pending", "confirmed", "failed"}
        v = v.strip().lower()
        if v not in allowed_statuses:
            raise ValueError(f"Status must be one of {allowed_statuses}")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "payment_id": "payment_xyz789",
                "transaction_hash": "0x" + "a" * 64,
                "basescan_url": "https://sepolia.basescan.org/tx/0x" + "a" * 64,
                "status": "pending"
            }
        }
    )


class BalanceResponse(BaseModel):
    """Response schema for wallet balance query."""

    usdc: Decimal = Field(..., description="USDC balance")
    eth: Decimal = Field(..., description="ETH balance")

    @field_validator("usdc", "eth")
    @classmethod
    def validate_balance(cls, v: Decimal) -> Decimal:
        """Validate balance is non-negative."""
        if v < 0:
            raise ValueError("Balance cannot be negative")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "usdc": "100.50",
                "eth": "0.05"
            }
        }
    )
