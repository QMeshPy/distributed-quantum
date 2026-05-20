"""AgentKit MongoDB Collections for Crypto-Enabled Quantum Research Crowdfunding Platform.

This module defines six core collections for the AgentKit integration:
1. Wallets - Entity wallet management with encrypted seeds
2. Worker Pricing - Worker reputation and pricing tiers
3. Research Proposals - Crowdfunded research with escrow and AAVE integration
4. AI Agents - Autonomous agents with spending controls
5. Payments - Transaction history and blockchain tracking
6. Notifications - User notification management
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from beanie import Document
from bson import Decimal128
from pydantic import ConfigDict, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


def _utc_now() -> datetime:
    """Return current UTC timestamp."""
    return datetime.now(timezone.utc)


def _decimal_to_decimal128(value: Decimal | float | int) -> Decimal128:
    """Convert Python Decimal/float/int to BSON Decimal128."""
    return Decimal128(str(value))


def _decimal128_to_decimal(value: Decimal128) -> Decimal:
    """Convert BSON Decimal128 to Python Decimal."""
    return value.to_decimal()


# ---------------------------------------------------------------------------
# 1. Wallets Collection
# ---------------------------------------------------------------------------

class WalletDocument(Document):
    """Entity wallet management with Base Sepolia testnet integration.

    Each entity (user, agent, worker) can have a wallet for crypto operations.
    Supports USDC and ETH balance tracking with encrypted seed storage.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    entity_id: str
    entity_type: Literal["user", "agent", "worker"]
    wallet_id: str
    default_address: str
    network: str = "base-sepolia"
    seed_encrypted: str  # AES-encrypted seed phrase
    balance_usdc: Decimal128 = Field(default_factory=lambda: Decimal128("0"))
    balance_eth: Decimal128 = Field(default_factory=lambda: Decimal128("0"))
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "wallets"
        indexes = [
            IndexModel("entity_id", unique=True),
            IndexModel("default_address", unique=True),
            IndexModel("entity_type"),
        ]


# ---------------------------------------------------------------------------
# 2. Worker Pricing Collection
# ---------------------------------------------------------------------------

class WorkerPricingDocument(Document):
    """Worker reputation, pricing tiers, and performance tracking.

    Workers publish their pricing and build reputation through completed jobs.
    Performance tier determines priority in job matching algorithms.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    worker_id: str
    wallet_address: str
    pricing: dict[str, Any] = Field(default_factory=dict)  # {service_type: price_per_unit}
    performance_tier: Literal["bronze", "silver", "gold", "platinum"] = "bronze"
    reputation_score: float = 0.0  # 0-100 scale
    total_earned: Decimal128 = Field(default_factory=lambda: Decimal128("0"))
    jobs_completed: int = 0
    is_active: bool = True
    published_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "worker_pricing"
        indexes = [
            IndexModel("worker_id", unique=True),
            IndexModel("is_active"),
            IndexModel([("reputation_score", DESCENDING)]),
            IndexModel([("performance_tier", ASCENDING), ("reputation_score", DESCENDING)]),
        ]


# ---------------------------------------------------------------------------
# 3. Research Proposals Collection
# ---------------------------------------------------------------------------

class FunderRecord(dict):
    """Embedded funder contribution record."""
    funder_id: str
    wallet_address: str
    amount_usdc: Decimal128
    funded_at: datetime


class ResearchProposalDocument(Document):
    """Crowdfunded quantum research proposals with escrow and AAVE yield.

    Researchers submit proposals that funders can support with USDC.
    Funds are held in escrow (optionally earning yield via AAVE) until
    research milestones are met or deadline expires.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    proposal_id: str
    title: str
    description: str
    researcher_id: str
    researcher_wallet: str
    methodology: str = ""
    budget_required: Decimal128  # Total USDC needed
    budget_raised: Decimal128 = Field(default_factory=lambda: Decimal128("0"))
    funding_threshold: Decimal128  # Minimum to unlock funds
    deadline: datetime
    status: Literal[
        "draft",
        "active",
        "funded",
        "in_progress",
        "completed",
        "expired",
        "cancelled"
    ] = "draft"
    tags: list[str] = Field(default_factory=list)  # For categorization
    fragments: list[dict] = Field(default_factory=list)  # Research proposal fragments
    funders: list[dict[str, Any]] = Field(default_factory=list)  # FunderRecord array
    escrow_type: Literal["simple", "aave_yield"] = "simple"
    aave_pool_address: str | None = None
    results_ipfs_hash: str | None = None  # Published results
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "research_proposals"
        indexes = [
            IndexModel("proposal_id", unique=True),
            IndexModel("researcher_id"),
            IndexModel("status"),
            IndexModel("tags"),  # Multikey index for array field
            IndexModel([("status", ASCENDING), ("deadline", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
        ]


# ---------------------------------------------------------------------------
# 4. AI Agents Collection
# ---------------------------------------------------------------------------

class SpendingHistoryRecord(dict):
    """Embedded spending history record."""
    timestamp: datetime
    amount: Decimal128
    purpose: str
    transaction_hash: str | None


class AIAgentDocument(Document):
    """Autonomous AI agents with crypto wallets and spending controls.

    Agents can autonomously execute trades and fund jobs within configured
    spending limits. All spending is tracked and auditable.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    agent_id: str
    owner_id: str
    agent_name: str
    wallet_id: str
    wallet_address: str
    config: dict[str, Any] = Field(default_factory=dict)  # {auto_fund: bool, max_per_tx: Decimal128, ...}
    spending_history: list[dict[str, Any]] = Field(default_factory=list)  # SpendingHistoryRecord array
    total_spent: Decimal128 = Field(default_factory=lambda: Decimal128("0"))
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "ai_agents"
        indexes = [
            IndexModel("agent_id", unique=True),
            IndexModel("owner_id"),
            IndexModel("config.auto_fund"),  # For querying auto-funding agents
            IndexModel([("owner_id", ASCENDING), ("created_at", DESCENDING)]),
        ]


# ---------------------------------------------------------------------------
# 5. Payments Collection
# ---------------------------------------------------------------------------

class PaymentDocument(Document):
    """Transaction history with blockchain tracking and status management.

    Records all payment flows: user→worker, funder→escrow, escrow→researcher, etc.
    Includes BaseScan URLs for blockchain verification.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    payment_id: str
    type: Literal[
        "worker_payment",
        "research_funding",
        "escrow_release",
        "agent_trade",
        "refund",
        "other"
    ]
    from_wallet: str
    to_wallet: str
    amount: Decimal128
    currency: Literal["USDC", "ETH"] = "USDC"
    status: Literal["pending", "submitted", "confirmed", "failed", "cancelled"]
    job_id: str | None = None
    proposal_id: str | None = None
    transaction_hash: str | None = None
    basescan_url: str | None = None
    block_number: int | None = None
    gas_used: Decimal128 | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    completed_at: datetime | None = None
    error_message: str | None = None

    class Settings:
        name = "payments"
        indexes = [
            IndexModel("payment_id", unique=True),
            IndexModel("from_wallet"),
            IndexModel("to_wallet"),
            IndexModel("job_id"),
            IndexModel("proposal_id"),
            IndexModel("status"),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel("transaction_hash"),  # For blockchain lookups
            IndexModel([("from_wallet", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel([("to_wallet", ASCENDING), ("created_at", DESCENDING)]),
        ]


# ---------------------------------------------------------------------------
# 6. Notifications Collection
# ---------------------------------------------------------------------------

class NotificationDocument(Document):
    """User notification management with email tracking.

    Supports multiple notification types: payment confirmations, proposal updates,
    job completions, agent actions, etc. Tracks read status and email delivery.
    """

    user_id: str
    type: Literal[
        "payment_received",
        "payment_sent",
        "proposal_funded",
        "proposal_milestone",
        "job_completed",
        "agent_action",
        "wallet_low_balance",
        "system_alert",
        "other"
    ]
    title: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)  # Extra context (payment_id, proposal_id, etc.)
    read: bool = False
    sent_email: bool = False
    email_sent_at: datetime | None = None
    created_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "notifications"
        indexes = [
            IndexModel("user_id"),
            IndexModel([("user_id", ASCENDING), ("read", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)]),
            IndexModel("type"),
            IndexModel([("created_at", DESCENDING)]),
        ]


# ---------------------------------------------------------------------------
# Collection Registry
# ---------------------------------------------------------------------------

AGENTKIT_COLLECTIONS = [
    WalletDocument,
    WorkerPricingDocument,
    ResearchProposalDocument,
    AIAgentDocument,
    PaymentDocument,
    NotificationDocument,
]

__all__ = [
    "WalletDocument",
    "WorkerPricingDocument",
    "ResearchProposalDocument",
    "AIAgentDocument",
    "PaymentDocument",
    "NotificationDocument",
    "AGENTKIT_COLLECTIONS",
]
