"""Pydantic models for AI Research Agents."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict


class AgentConfig(BaseModel):
    """AI Agent configuration schema."""

    auto_fund: bool = Field(
        ...,
        description="Whether agent should automatically fund proposals"
    )
    max_per_proposal: Decimal = Field(
        ...,
        gt=0,
        description="Maximum USDC to fund per proposal"
    )
    daily_budget: Decimal = Field(
        ...,
        gt=0,
        description="Maximum USDC to spend per day"
    )
    research_interests: List[str] = Field(
        ...,
        min_length=1,
        description="Tags the agent is interested in (e.g., ['QAOA', 'portfolio-optimization'])"
    )
    min_reputation_threshold: float = Field(
        ...,
        ge=0,
        le=100,
        description="Minimum researcher reputation score (0-100)"
    )

    @field_validator('max_per_proposal', 'daily_budget')
    @classmethod
    def validate_positive_amounts(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator('daily_budget')
    @classmethod
    def validate_daily_budget(cls, v: Decimal, info) -> Decimal:
        """Ensure daily_budget >= max_per_proposal."""
        if 'max_per_proposal' in info.data:
            if v < info.data['max_per_proposal']:
                raise ValueError("daily_budget must be >= max_per_proposal")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "auto_fund": True,
                "max_per_proposal": "10.0",
                "daily_budget": "50.0",
                "research_interests": ["QAOA", "portfolio-optimization", "scaling"],
                "min_reputation_threshold": 60.0
            }
        }
    )


class AgentCreateRequest(BaseModel):
    """Request to create a new AI agent."""

    agent_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Name for the agent (e.g., 'QAOA Research Agent')"
    )
    config: AgentConfig = Field(
        ...,
        description="Agent configuration with spending limits and interests"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "agent_name": "QAOA Research Agent",
                "config": {
                    "auto_fund": True,
                    "max_per_proposal": "10.0",
                    "daily_budget": "50.0",
                    "research_interests": ["QAOA", "portfolio-optimization"],
                    "min_reputation_threshold": 60.0
                }
            }
        }
    )


class SpendingHistoryItem(BaseModel):
    """Single spending record."""

    proposal_id: str
    amount: str  # Decimal as string for JSON serialization
    funded_at: datetime
    outcome: str  # "success" | "pending" | "cancelled"
    reasoning: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AgentResponse(BaseModel):
    """AI Agent response with full details."""

    agent_id: str
    agent_name: str
    owner_id: str
    wallet_address: str
    config: AgentConfig
    total_spent: str  # Decimal as string
    spending_history: List[SpendingHistoryItem] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AgentListResponse(BaseModel):
    """List of user's AI agents."""

    agents: List[AgentResponse]
    total: int

    model_config = ConfigDict(from_attributes=True)


class AgentConfigUpdate(BaseModel):
    """Update agent configuration."""

    config: AgentConfig

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "config": {
                    "auto_fund": False,
                    "max_per_proposal": "5.0",
                    "daily_budget": "25.0",
                    "research_interests": ["QAOA"],
                    "min_reputation_threshold": 70.0
                }
            }
        }
    )


class AnalyzeProposalRequest(BaseModel):
    """Request to analyze a research proposal."""

    proposal_id: str = Field(
        ...,
        description="ID of the proposal to analyze"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "proposal_id": "prop_abc123"
            }
        }
    )


class AnalysisResult(BaseModel):
    """Result of AI agent proposal analysis."""

    should_fund: bool = Field(
        ...,
        description="Whether agent decided to fund the proposal"
    )
    funding_amount: Decimal = Field(
        ...,
        ge=0,
        description="Amount agent will contribute (0 if not funding)"
    )
    confidence: int = Field(
        ...,
        ge=0,
        le=100,
        description="Confidence score (0-100)"
    )
    reasoning: str = Field(
        ...,
        description="Agent's reasoning for the decision"
    )
    funded: bool = Field(
        default=False,
        description="Whether funding was actually executed (if auto_fund enabled)"
    )
    transaction_hash: Optional[str] = Field(
        default=None,
        description="Blockchain transaction hash if funded"
    )
    analyzed_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Timestamp of analysis"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "should_fund": True,
                "funding_amount": "5.0",
                "confidence": 85,
                "reasoning": "Strong alignment with QAOA research interests. Methodology is sound and budget reasonable.",
                "funded": True,
                "transaction_hash": "0x123...",
                "analyzed_at": "2026-05-20T10:30:00Z"
            }
        }
    )


class SpendingHistoryResponse(BaseModel):
    """Paginated spending history."""

    spending_history: List[SpendingHistoryItem]
    total: int
    total_spent: str  # Decimal as string

    model_config = ConfigDict(from_attributes=True)
