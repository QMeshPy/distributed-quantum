"""API models for read-only wallet portfolio risk analysis (issue #19)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

TokenKind = Literal["native", "stablecoin"]


class WalletPortfolioRequest(BaseModel):
    """Analyze on-chain holdings for a public address. No signing required."""

    address: str = Field(
        min_length=42,
        max_length=42,
        pattern=r"^0x[0-9a-fA-F]{40}$",
        description="Checksummed or hex EVM address (resolve ENS on the client first)",
    )
    networks: list[str] = Field(
        default_factory=list,
        description="Registry aliases or chain ids; empty = all enabled EVM chains with get_balance",
    )
    lookback_days: int = Field(default=252, ge=60, le=2520)
    num_uncertainty_qubits: int = Field(default=4, ge=3, le=8)
    epsilon: float = Field(default=0.05, gt=0, lt=0.5)
    alpha: float = Field(default=0.05, gt=0, lt=0.5)


class HoldingSource(BaseModel):
    kind: str
    detail: str
    observed_at: datetime


class PricedHolding(BaseModel):
    network: str
    chain_id: str
    symbol: str
    kind: TokenKind
    token_address: str | None = None
    balance: str
    decimals: int
    price_usd: str
    value_usd: str
    weight: float
    source: HoldingSource


class UnpriceableHolding(BaseModel):
    network: str
    chain_id: str
    symbol: str
    kind: TokenKind
    token_address: str | None = None
    balance: str
    decimals: int
    reason: str
    observed_at: datetime


class WalletPortfolioRiskSummary(BaseModel):
    portfolio_value_usd: float
    classical_var_95: float
    classical_var_99: float
    classical_cvar_99: float
    quantum_var_95: float | None = None
    quantum_var_99: float | None = None
    quantum_cvar_99: float | None = None
    confidence_note: str


class WalletPortfolioAnalysisResponse(BaseModel):
    address: str
    analyzed_at: datetime
    networks: list[str]
    priced_holdings: list[PricedHolding]
    unpriceable_holdings: list[UnpriceableHolding]
    risk: WalletPortfolioRiskSummary | None
    risk_job: dict[str, Any] | None = None
    data_sources: list[HoldingSource]
    notes: list[str] = Field(default_factory=list)
