"""Payment-related Pydantic models for AgentKit crypto payment integration."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


class PaymentStatus(str, Enum):
    """Enum for payment status values."""

    PENDING = "pending"
    ESCROWED = "escrowed"
    COMPLETED = "completed"
    FAILED = "failed"


class PaymentType(str, Enum):
    """Enum for payment type values."""

    JOB_PAYMENT = "job_payment"
    PROPOSAL_FUNDING = "proposal_funding"
    WORKER_EARNINGS = "worker_earnings"


class PaymentCreate(BaseModel):
    """Request schema for creating a new payment."""

    type: PaymentType = Field(..., description="Type of payment")
    from_wallet: str = Field(..., description="Source wallet address")
    to_wallet: str = Field(..., description="Destination wallet address")
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    currency: str = Field(..., description="Currency (USDC, ETH)")
    job_id: Optional[str] = Field(
        default=None,
        description="Associated job ID (required for job_payment and worker_earnings)"
    )
    proposal_id: Optional[str] = Field(
        default=None,
        description="Associated proposal ID (required for proposal_funding)"
    )

    @field_validator("from_wallet", "to_wallet")
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

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """Validate currency is one of supported values."""
        allowed_currencies = {"USDC", "ETH"}
        v = v.strip().upper()
        if v not in allowed_currencies:
            raise ValueError(f"Currency must be one of {allowed_currencies}")
        return v

    def model_post_init(self, __context) -> None:
        """Validate required fields based on payment type."""
        if self.type == PaymentType.JOB_PAYMENT and not self.job_id:
            raise ValueError("job_id is required for job_payment type")
        if self.type == PaymentType.WORKER_EARNINGS and not self.job_id:
            raise ValueError("job_id is required for worker_earnings type")
        if self.type == PaymentType.PROPOSAL_FUNDING and not self.proposal_id:
            raise ValueError("proposal_id is required for proposal_funding type")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "job_payment",
                "from_wallet": "0x1234567890123456789012345678901234567890",
                "to_wallet": "0x0987654321098765432109876543210987654321",
                "amount": "100.00",
                "currency": "USDC",
                "job_id": "job_456",
                "proposal_id": None
            }
        }
    )


class PaymentResponse(BaseModel):
    """Response schema for payment information."""

    payment_id: str = Field(..., description="Unique payment identifier")
    type: PaymentType = Field(..., description="Type of payment")
    amount: Decimal = Field(..., description="Payment amount")
    status: PaymentStatus = Field(..., description="Current payment status")
    transaction_hash: Optional[str] = Field(
        default=None,
        description="Blockchain transaction hash (if confirmed)"
    )
    basescan_url: Optional[str] = Field(
        default=None,
        description="BaseScan explorer URL (if confirmed)"
    )
    created_at: datetime = Field(..., description="Timestamp when payment was created")

    @field_validator("transaction_hash")
    @classmethod
    def validate_transaction_hash(cls, v: Optional[str]) -> Optional[str]:
        """Validate transaction hash format if provided."""
        if v is None:
            return v
        if not v.startswith("0x"):
            raise ValueError("Transaction hash must start with 0x")
        if len(v) != 66:
            raise ValueError("Transaction hash must be 66 characters long")
        if not all(c in "0123456789abcdefABCDEF" for c in v[2:]):
            raise ValueError("Transaction hash contains invalid characters")
        return v.lower()

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        """Validate amount is non-negative."""
        if v < 0:
            raise ValueError("Amount cannot be negative")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "payment_id": "payment_xyz789",
                "type": "job_payment",
                "amount": "100.00",
                "status": "pending",
                "transaction_hash": "0x" + "a" * 64,
                "basescan_url": "https://sepolia.basescan.org/tx/0x" + "a" * 64,
                "created_at": "2026-05-20T12:00:00Z"
            }
        }
    )
