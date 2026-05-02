"""Options pricing API models."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field


OptionType = Literal[
    "european_call_short",
    "european_call_long",
    "expand",
    "delay",
    "abandon",
    "patent",
    "natural_resource",
    "financial_flexibility",
]


class OptionsJobRequest(BaseModel):
    """Input parameters for a real options pricing job."""

    option_type: OptionType
    current_value: Annotated[float, Field(gt=0.0, description="S₀ — current asset / project value")]
    strike_or_cost: Annotated[float, Field(gt=0.0, description="K — strike price or investment cost")]
    time_to_expiry: Annotated[float, Field(gt=0.0, description="T in years")]
    volatility: Annotated[float, Field(gt=0.0, le=5.0, description="σ — annualised volatility")]
    risk_free_rate: Annotated[float, Field(ge=0.0, le=1.0, description="r — annualised risk-free rate")]
    # Short-term option extras
    dividend_per_share: float | None = Field(default=None, ge=0.0)
    days_to_ex_dividend: int | None = Field(default=None, ge=0)
    # Long-term / real option extras
    annual_cost_of_delay: float | None = Field(default=None, ge=0.0)
    # Natural resource extras
    reserve_quantity: float | None = Field(default=None, gt=0.0)
    resource_price_per_unit: float | None = Field(default=None, gt=0.0)
    extraction_cost_per_unit: float | None = Field(default=None, ge=0.0)
    annual_cashflow_after_tax: float | None = Field(default=None, ge=0.0)
    # Financial flexibility extras
    reinvestment_need_pct: float | None = Field(default=None, gt=0.0, le=1.0)
    reinvestment_volatility: float | None = Field(default=None, gt=0.0)
    max_internal_financing_pct: float | None = Field(default=None, gt=0.0, le=1.0)
    cost_of_capital: float | None = Field(default=None, gt=0.0)
    return_on_capital: float | None = Field(default=None)
    # IQAE parameters
    num_uncertainty_qubits: int = Field(default=5, ge=3, le=8)
    epsilon: float = Field(default=0.01, gt=0.0, lt=0.5)
    alpha: float = Field(default=0.05, gt=0.0, lt=1.0)


class OptionsSubmitResponse(BaseModel):
    """Response after submitting an options pricing job."""

    job_id: str
    status: str
    option_type: str


class OptionsJobSummary(BaseModel):
    """Summary of an options job for list view."""

    job_id: str
    option_type: str
    status: str
    error: str | None
    created_at: datetime
    updated_at: datetime


class OptionsGreeks(BaseModel):
    """Option Greeks — quantum via finite difference, classical via B-S formulas."""

    delta: float
    gamma: float
    vega: float
    theta: float  # classical only


class OptionsAnalysisResult(BaseModel):
    """Full result for a completed options pricing job."""

    job_id: str
    option_type: OptionType
    request: dict

    # Pricing
    quantum_price: float
    classical_bs_price: float
    classical_binomial_price: float
    price_difference_pct: float

    # Greeks
    quantum_greeks: OptionsGreeks
    classical_greeks: OptionsGreeks

    # IQAE confidence interval
    confidence_interval: list[float]  # [lower, upper]

    # Moneyness
    moneyness: Literal["ITM", "ATM", "OTM"]
    moneyness_ratio: float  # S/K

    # Divergence warning
    divergence_warning: bool
    sigma_zero_fallback: bool

    # Circuit metadata
    num_qubits: int
    circuit_depth: int
    num_iqae_runs: int  # always 5 (price + delta±δ + vega±δ)
    shots_per_run: int
    epsilon: float
    alpha: float

    # Quantum advantage evidence
    classical_mc_samples_equivalent: int
    quadratic_speedup_factor: float

    # Timing
    analysis_duration_ms: int
    generated_at: str


class OptionsJobResponse(BaseModel):
    """Full options job response with results."""

    job_id: str
    option_type: str
    status: str
    error: str | None
    result: OptionsAnalysisResult | None
    created_at: datetime
    updated_at: datetime
