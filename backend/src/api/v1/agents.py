"""AI Agents router for autonomous research funding.

This module provides REST API endpoints for managing AI agents that autonomously
analyze and fund quantum research proposals using Claude 3.5 Sonnet via AWS Bedrock.

Features:
- Create/manage AI agents with spending controls
- Configure research interests and reputation thresholds
- Manual trigger for proposal analysis
- Budget tracking and spending history
- Ownership verification and access control
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, Field, ConfigDict

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import PlatformException, ErrorCode
from db.agentkit_collections import AIAgentDocument, ResearchProposalDocument, _decimal128_to_decimal
from services.ai_agent_service import AIAgentService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class AgentConfig(BaseModel):
    """AI agent configuration."""

    model_config = ConfigDict(extra="forbid")

    auto_fund: bool = Field(description="Enable automatic funding for proposals")
    max_per_proposal: str = Field(description="Maximum USDC to fund per proposal")
    daily_budget: str = Field(description="Daily spending limit in USDC")
    research_interests: list[str] = Field(
        description="List of research topics the agent is interested in"
    )
    min_reputation_threshold: float = Field(
        ge=0.0,
        le=100.0,
        description="Minimum researcher reputation score (0-100)"
    )


class AgentCreateRequest(BaseModel):
    """Request to create a new AI agent."""

    model_config = ConfigDict(extra="forbid")

    agent_name: str = Field(min_length=1, max_length=100, description="Human-readable agent name")
    config: AgentConfig = Field(description="Agent configuration")


class AgentResponse(BaseModel):
    """Response containing agent information."""

    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(description="Unique agent identifier")
    owner_id: str = Field(description="User ID of the agent owner")
    agent_name: str = Field(description="Agent name")
    wallet_address: str = Field(description="Agent's crypto wallet address")
    config: dict[str, Any] = Field(description="Agent configuration")
    total_spent: str = Field(description="Total amount spent by agent (USDC)")
    created_at: str = Field(description="ISO 8601 creation timestamp")
    updated_at: str = Field(description="ISO 8601 last update timestamp")


class AgentListResponse(BaseModel):
    """Response containing list of agents."""

    model_config = ConfigDict(extra="forbid")

    agents: list[AgentResponse] = Field(default_factory=list)
    total: int = Field(description="Total number of agents owned by user")


class AgentConfigUpdate(BaseModel):
    """Request to update agent configuration."""

    model_config = ConfigDict(extra="forbid")

    config: AgentConfig = Field(description="Updated agent configuration")


class AnalyzeProposalRequest(BaseModel):
    """Request to manually analyze a proposal."""

    model_config = ConfigDict(extra="forbid")

    proposal_id: str = Field(min_length=1, description="Proposal ID to analyze")


class AnalysisResult(BaseModel):
    """Result of proposal analysis."""

    model_config = ConfigDict(extra="forbid")

    agent_id: str = Field(description="Agent that performed analysis")
    proposal_id: str = Field(description="Analyzed proposal ID")
    should_fund: bool = Field(description="Whether agent recommends funding")
    funding_amount: str = Field(description="Recommended funding amount (USDC)")
    confidence: int = Field(ge=0, le=100, description="Confidence level (0-100)")
    reasoning: str = Field(description="AI reasoning for the decision")
    timestamp: str = Field(description="ISO 8601 analysis timestamp")


class SpendingHistoryItem(BaseModel):
    """Single spending history record."""

    model_config = ConfigDict(extra="forbid")

    timestamp: str = Field(description="ISO 8601 timestamp")
    amount: str = Field(description="Amount spent (USDC)")
    purpose: str = Field(description="Purpose of spending")
    transaction_hash: str | None = Field(description="Blockchain transaction hash")


class SpendingHistoryResponse(BaseModel):
    """Response containing spending history."""

    model_config = ConfigDict(extra="forbid")

    spending_history: list[SpendingHistoryItem] = Field(default_factory=list)
    total: int = Field(description="Total number of spending records")
    total_spent: str = Field(description="Total amount spent (USDC)")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])

# Initialize AI Agent service
ai_agent_service = AIAgentService()


@router.post(
    "",
    response_model=AgentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new AI agent",
    description="Creates an autonomous AI agent with spending controls for research funding.",
)
async def create_agent(
    body: AgentCreateRequest,
    current_user: CurrentUser,
) -> AgentResponse:
    """Create a new AI agent for autonomous research funding.

    The agent will have its own crypto wallet and can analyze proposals using
    Claude 3.5 Sonnet. Spending limits and research interests are configurable.

    Args:
        body: Agent creation request with name and configuration
        current_user: Authenticated user from dependency injection

    Returns:
        AgentResponse with agent details including wallet address

    Raises:
        PlatformException: If agent creation fails or config is invalid
    """
    try:
        # Validate config values
        max_per_proposal = Decimal(body.config.max_per_proposal)
        daily_budget = Decimal(body.config.daily_budget)

        if max_per_proposal <= 0:
            raise ValueError("max_per_proposal must be positive")
        if daily_budget <= 0:
            raise ValueError("daily_budget must be positive")
        if max_per_proposal > daily_budget:
            raise ValueError("max_per_proposal cannot exceed daily_budget")

        # Build config dict
        config = {
            "auto_fund": body.config.auto_fund,
            "max_per_proposal": max_per_proposal,
            "daily_budget": daily_budget,
            "research_interests": body.config.research_interests,
            "min_reputation_threshold": body.config.min_reputation_threshold,
        }

        # Create agent via service
        agent_data = await ai_agent_service.create_agent(
            owner_id=current_user.user_id,
            agent_name=body.agent_name,
            config=config
        )

        # Convert Decimal to string for response
        return AgentResponse(
            agent_id=agent_data["agent_id"],
            owner_id=agent_data["owner_id"],
            agent_name=agent_data["agent_name"],
            wallet_address=agent_data["wallet_address"],
            config={
                "auto_fund": config["auto_fund"],
                "max_per_proposal": str(config["max_per_proposal"]),
                "daily_budget": str(config["daily_budget"]),
                "research_interests": config["research_interests"],
                "min_reputation_threshold": config["min_reputation_threshold"],
            },
            total_spent="0",
            created_at=agent_data["created_at"].isoformat(),
            updated_at=agent_data["created_at"].isoformat(),
        )

    except ValueError as e:
        logger.error(f"Invalid agent configuration: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to create agent for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to create AI agent",
        )


@router.get(
    "",
    response_model=AgentListResponse,
    status_code=status.HTTP_200_OK,
    summary="List user's AI agents",
    description="Retrieves all AI agents owned by the authenticated user.",
)
async def list_agents(
    current_user: CurrentUser,
) -> AgentListResponse:
    """Get all AI agents owned by the current user.

    Returns a list of all agents created by the authenticated user with their
    current configuration and spending totals.

    Args:
        current_user: Authenticated user from dependency injection

    Returns:
        AgentListResponse with list of agents and total count

    Raises:
        PlatformException: If database query fails
    """
    try:
        # Query MongoDB for user's agents
        agents = await AIAgentDocument.find(
            {"owner_id": current_user.user_id}
        ).sort([("created_at", -1)]).to_list()

        agent_list = []
        for agent_doc in agents:
            # Convert Decimal128 to string for response
            config = agent_doc.config.copy()
            config["max_per_proposal"] = str(_decimal128_to_decimal(config["max_per_proposal"]))
            config["daily_budget"] = str(_decimal128_to_decimal(config["daily_budget"]))

            agent_list.append(
                AgentResponse(
                    agent_id=agent_doc.agent_id,
                    owner_id=agent_doc.owner_id,
                    agent_name=agent_doc.agent_name,
                    wallet_address=agent_doc.wallet_address,
                    config=config,
                    total_spent=str(_decimal128_to_decimal(agent_doc.total_spent)),
                    created_at=agent_doc.created_at.isoformat(),
                    updated_at=agent_doc.updated_at.isoformat(),
                )
            )

        return AgentListResponse(
            agents=agent_list,
            total=len(agent_list)
        )

    except Exception as e:
        logger.error(f"Failed to list agents for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve agents",
        )


@router.get(
    "/{agent_id}",
    response_model=AgentResponse,
    status_code=status.HTTP_200_OK,
    summary="Get agent details",
    description="Retrieves detailed information about a specific AI agent.",
)
async def get_agent(
    agent_id: str,
    current_user: CurrentUser,
) -> AgentResponse:
    """Get detailed information about a specific AI agent.

    Returns complete agent information including configuration and spending history.
    User must own the agent to access this endpoint.

    Args:
        agent_id: Agent ID to retrieve
        current_user: Authenticated user from dependency injection

    Returns:
        AgentResponse with complete agent information

    Raises:
        PlatformException: If agent not found or user doesn't own the agent
    """
    try:
        # Get agent from MongoDB
        agent_doc = await AIAgentDocument.find_one({"agent_id": agent_id})

        if not agent_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Agent '{agent_id}' not found",
            )

        # Verify ownership
        if agent_doc.owner_id != current_user.user_id:
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message="You do not have permission to access this agent",
            )

        # Convert Decimal128 to string for response
        config = agent_doc.config.copy()
        config["max_per_proposal"] = str(_decimal128_to_decimal(config["max_per_proposal"]))
        config["daily_budget"] = str(_decimal128_to_decimal(config["daily_budget"]))

        return AgentResponse(
            agent_id=agent_doc.agent_id,
            owner_id=agent_doc.owner_id,
            agent_name=agent_doc.agent_name,
            wallet_address=agent_doc.wallet_address,
            config=config,
            total_spent=str(_decimal128_to_decimal(agent_doc.total_spent)),
            created_at=agent_doc.created_at.isoformat(),
            updated_at=agent_doc.updated_at.isoformat(),
        )

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to get agent {agent_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve agent",
        )


@router.put(
    "/{agent_id}/config",
    response_model=AgentResponse,
    status_code=status.HTTP_200_OK,
    summary="Update agent configuration",
    description="Updates the configuration for an existing AI agent.",
)
async def update_agent_config(
    agent_id: str,
    body: AgentConfigUpdate,
    current_user: CurrentUser,
) -> AgentResponse:
    """Update configuration for an AI agent.

    Updates spending limits, research interests, and other agent settings.
    User must own the agent to perform this operation.

    Args:
        agent_id: Agent ID to update
        body: Updated configuration
        current_user: Authenticated user from dependency injection

    Returns:
        AgentResponse with updated agent information

    Raises:
        PlatformException: If agent not found, user doesn't own agent, or config is invalid
    """
    try:
        # Get agent from MongoDB
        agent_doc = await AIAgentDocument.find_one({"agent_id": agent_id})

        if not agent_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Agent '{agent_id}' not found",
            )

        # Verify ownership
        if agent_doc.owner_id != current_user.user_id:
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message="You do not have permission to modify this agent",
            )

        # Validate new config values
        max_per_proposal = Decimal(body.config.max_per_proposal)
        daily_budget = Decimal(body.config.daily_budget)

        if max_per_proposal <= 0:
            raise ValueError("max_per_proposal must be positive")
        if daily_budget <= 0:
            raise ValueError("daily_budget must be positive")
        if max_per_proposal > daily_budget:
            raise ValueError("max_per_proposal cannot exceed daily_budget")

        # Import conversion utility
        from db.agentkit_collections import _decimal_to_decimal128
        from datetime import datetime, timezone

        # Build updated config
        updated_config = {
            "auto_fund": body.config.auto_fund,
            "max_per_proposal": _decimal_to_decimal128(max_per_proposal),
            "daily_budget": _decimal_to_decimal128(daily_budget),
            "research_interests": body.config.research_interests,
            "min_reputation_threshold": body.config.min_reputation_threshold,
        }

        # Update in MongoDB
        await AIAgentDocument.find_one({"agent_id": agent_id}).update(
            {
                "$set": {
                    "config": updated_config,
                    "updated_at": datetime.now(timezone.utc),
                }
            }
        )

        # Fetch updated document
        updated_doc = await AIAgentDocument.find_one({"agent_id": agent_id})

        # Convert Decimal128 to string for response
        config_response = {
            "auto_fund": updated_config["auto_fund"],
            "max_per_proposal": str(max_per_proposal),
            "daily_budget": str(daily_budget),
            "research_interests": updated_config["research_interests"],
            "min_reputation_threshold": updated_config["min_reputation_threshold"],
        }

        return AgentResponse(
            agent_id=updated_doc.agent_id,
            owner_id=updated_doc.owner_id,
            agent_name=updated_doc.agent_name,
            wallet_address=updated_doc.wallet_address,
            config=config_response,
            total_spent=str(_decimal128_to_decimal(updated_doc.total_spent)),
            created_at=updated_doc.created_at.isoformat(),
            updated_at=updated_doc.updated_at.isoformat(),
        )

    except ValueError as e:
        logger.error(f"Invalid agent configuration: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to update agent {agent_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to update agent configuration",
        )


@router.post(
    "/{agent_id}/analyze",
    response_model=AnalysisResult,
    status_code=status.HTTP_200_OK,
    summary="Analyze a proposal",
    description="Manually trigger proposal analysis by an AI agent.",
)
async def analyze_proposal(
    agent_id: str,
    body: AnalyzeProposalRequest,
    current_user: CurrentUser,
) -> AnalysisResult:
    """Manually trigger analysis of a research proposal.

    Uses Claude 3.5 Sonnet via AWS Bedrock to analyze the proposal against the
    agent's research interests and budget constraints. If auto_fund is enabled
    and the analysis is positive, funding will be executed automatically.

    Args:
        agent_id: Agent ID to perform analysis
        body: Request containing proposal_id
        current_user: Authenticated user from dependency injection

    Returns:
        AnalysisResult with funding decision and reasoning

    Raises:
        PlatformException: If agent/proposal not found, user doesn't own agent, or analysis fails
    """
    try:
        # Get agent from MongoDB
        agent_doc = await AIAgentDocument.find_one({"agent_id": agent_id})

        if not agent_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Agent '{agent_id}' not found",
            )

        # Verify ownership
        if agent_doc.owner_id != current_user.user_id:
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message="You do not have permission to use this agent",
            )

        # Get proposal from MongoDB
        proposal_doc = await ResearchProposalDocument.find_one(
            {"proposal_id": body.proposal_id}
        )

        if not proposal_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Proposal '{body.proposal_id}' not found",
            )

        # Convert proposal to dict for service
        proposal = {
            "proposal_id": proposal_doc.proposal_id,
            "title": proposal_doc.title,
            "description": proposal_doc.description,
            "methodology": proposal_doc.methodology,
            "budget_required": proposal_doc.budget_required,
            "researcher_id": proposal_doc.researcher_id,
            "tags": proposal_doc.tags,
            "expected_timeline": getattr(proposal_doc, "expected_timeline", None),
        }

        # Analyze proposal via service
        decision = await ai_agent_service.analyze_proposal(
            agent_id=agent_id,
            proposal=proposal
        )

        return AnalysisResult(
            agent_id=decision["agent_id"],
            proposal_id=decision["proposal_id"],
            should_fund=decision["should_fund"],
            funding_amount=str(decision["funding_amount"]),
            confidence=decision["confidence"],
            reasoning=decision["reasoning"],
            timestamp=decision["timestamp"].isoformat(),
        )

    except PlatformException:
        raise
    except ValueError as e:
        logger.error(f"Invalid analysis request: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to analyze proposal {body.proposal_id} with agent {agent_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to analyze proposal",
        )


@router.get(
    "/{agent_id}/spending",
    response_model=SpendingHistoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get agent spending history",
    description="Retrieves the spending history for an AI agent with pagination.",
)
async def get_spending_history(
    agent_id: str,
    current_user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200, description="Maximum number of records to return"),
    offset: int = Query(default=0, ge=0, description="Number of records to skip"),
) -> SpendingHistoryResponse:
    """Get spending history for an AI agent.

    Returns paginated spending history including amounts, purposes, and transaction
    hashes. User must own the agent to access this endpoint.

    Args:
        agent_id: Agent ID to query
        current_user: Authenticated user from dependency injection
        limit: Maximum number of records to return (1-200, default 50)
        offset: Number of records to skip for pagination (default 0)

    Returns:
        SpendingHistoryResponse with spending records and totals

    Raises:
        PlatformException: If agent not found or user doesn't own the agent
    """
    try:
        # Get agent from MongoDB
        agent_doc = await AIAgentDocument.find_one({"agent_id": agent_id})

        if not agent_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Agent '{agent_id}' not found",
            )

        # Verify ownership
        if agent_doc.owner_id != current_user.user_id:
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message="You do not have permission to access this agent",
            )

        # Get spending history with pagination
        spending_history = agent_doc.spending_history or []
        total_records = len(spending_history)

        # Sort by timestamp descending (most recent first)
        spending_history_sorted = sorted(
            spending_history,
            key=lambda x: x.get("timestamp"),
            reverse=True
        )

        # Apply pagination
        paginated_history = spending_history_sorted[offset:offset + limit]

        # Convert to response format
        spending_items = []
        for record in paginated_history:
            spending_items.append(
                SpendingHistoryItem(
                    timestamp=record["timestamp"].isoformat(),
                    amount=str(_decimal128_to_decimal(record["amount"])),
                    purpose=record["purpose"],
                    transaction_hash=record.get("transaction_hash"),
                )
            )

        return SpendingHistoryResponse(
            spending_history=spending_items,
            total=total_records,
            total_spent=str(_decimal128_to_decimal(agent_doc.total_spent)),
        )

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to get spending history for agent {agent_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve spending history",
        )


# ── Free-form chat ────────────────────────────────────────────────────────────

class ChatMessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str = Field(description="'user' or 'assistant'")
    content: str = Field(description="Message text")


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(description="Latest user message")
    history: list[ChatMessageIn] = Field(default_factory=list, description="Prior turns (oldest first)")


class ChatResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reply: str = Field(description="Agent's reply")


@router.post(
    "/{agent_id}/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Chat with an AI agent",
    description="Send a free-form message to an agent backed by Claude 3.5 Sonnet via AWS Bedrock.",
)
async def chat_with_agent(
    agent_id: str,
    body: ChatRequest,
    current_user: CurrentUser,
) -> ChatResponse:
    """Send a message to an AI agent and get a response from Claude.

    Maintains conversation context by accepting prior history. The agent is
    aware of its wallet, the platform's proposals, and can take actions.
    """
    try:
        agent_doc = await AIAgentDocument.find_one({"agent_id": agent_id})
        if not agent_doc:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Agent '{agent_id}' not found",
            )
        if agent_doc.owner_id != current_user.user_id:
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message="You do not have permission to use this agent",
            )

        reply = await ai_agent_service.chat(
            agent_id=agent_id,
            agent_name=agent_doc.agent_name,
            message=body.message,
            history=[{"role": m.role, "content": m.content} for m in body.history],
        )
        return ChatResponse(reply=reply)

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Chat failed for agent {agent_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Chat request failed",
        )
