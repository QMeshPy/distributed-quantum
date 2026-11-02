"""Financial analysis API models."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class FinancialJobStatus(str, Enum):
    """Status of a financial analysis job."""

    INGESTING = "ingesting"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    FAILED = "failed"


class FinancialSubmitResponse(BaseModel):
    """Response after submitting a financial CSV."""

    job_id: str
    status: str
    problem_type: str


class FinancialJobSummary(BaseModel):
    """Summary of a financial job for list view."""

    job_id: str
    filename: str
    problem_type: str | None
    status: str
    row_count: int | None
    col_count: int | None
    error: str | None
    created_at: datetime
    updated_at: datetime


class FinancialJobResponse(BaseModel):
    """Full financial job response with results."""

    job_id: str
    filename: str
    problem_type: str | None
    status: str
    row_count: int | None
    col_count: int | None
    error: str | None
    result: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class FinancialComparisonResponse(BaseModel):
    """Investor-facing quantum-vs-classical comparison report for a finance job."""

    job_id: str
    filename: str
    generated_at: datetime | str
    fairness: dict[str, Any]
    dataset: dict[str, Any]
    problem: dict[str, Any]
    classical: dict[str, Any]
    quantum: dict[str, Any]
    scorecard: dict[str, Any]
    evidence: dict[str, Any]
    verdict: dict[str, Any]


class TokenizedAssetInfo(BaseModel):
    """One allowlisted Robinhood Stock Token and its Chainlink price feed."""

    symbol: str
    name: str
    isin: str
    token_address: str
    feed_address: str


class TokenizedAssetsResponse(BaseModel):
    """Assets and rules for analysis-only tokenized-stock portfolios (#18)."""

    chain_id: str
    display_name: str
    data_source: str
    price_unit: str
    sampling: str
    min_aligned_days: int
    max_history_days: int
    disclaimer: str
    assets: list[TokenizedAssetInfo]


class TokenizedPortfolioRequest(BaseModel):
    """Optimize allowlisted tokenized stocks over a date range; never trades."""

    model_config = ConfigDict(extra="forbid")

    # Checked against the allowlist with a fixed message; a pattern error would echo input.
    symbols: list[str] = Field(min_length=2, max_length=20)
    start_date: date
    end_date: date
    budget: int | None = Field(default=None, ge=1)
    risk_aversion: float = Field(default=0.5, ge=0.0, le=10.0, allow_inf_nan=False)
    max_assets_considered: int = Field(default=6, ge=2, le=8)
    qaoa_reps: int = Field(default=1, ge=1, le=4)
    parameter_search_steps: int = Field(default=9, ge=3, le=25)
