"""Marketplace router for worker pricing, job routing, and payments.

This module provides REST API endpoints for the quantum computing job marketplace:
- Worker pricing registration and updates
- Job cost estimation from OpenQASM circuits
- Operation routing to cheapest qualified workers
- Worker earnings and statistics retrieval

Features:
- Register/update worker pricing with performance tiers
- Estimate total job cost from quantum circuits
- Route operations to cost-optimal workers
- Track worker earnings and reputation
- Network-wide price discovery via GossipSub
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Path, Query, status
from pydantic import BaseModel, Field, ConfigDict, field_validator

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import PlatformException, ErrorCode
from services.marketplace_service import MarketplaceService
from services.agentkit_service import AgentKitService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class RegisterPricingRequest(BaseModel):
    """Request to register or update worker pricing."""

    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(min_length=1, description="Unique worker identifier")
    pricing: dict[str, float] = Field(
        description="Price per operation type (e.g., {'hadamard': 0.001, 'cnot': 0.002})"
    )
    performance_tier: Literal["bronze", "silver", "gold", "platinum"] = Field(
        default="bronze",
        description="Worker performance category (bronze|silver|gold|platinum)"
    )

    @field_validator("pricing")
    @classmethod
    def validate_pricing(cls, v: dict[str, float]) -> dict[str, float]:
        """Validate all prices are non-negative."""
        if not v:
            raise ValueError("pricing cannot be empty")
        for op_type, price in v.items():
            if price < 0:
                raise ValueError(f"Price for {op_type} must be non-negative, got: {price}")
        return v


class RegisterPricingResponse(BaseModel):
    """Response from worker pricing registration."""

    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(description="Worker identifier")
    wallet_address: str = Field(description="Worker wallet address for payments")
    pricing: dict[str, float] = Field(description="Registered pricing per operation")
    performance_tier: str = Field(description="Worker performance tier")
    reputation_score: float = Field(description="Current reputation score (0-100)")
    is_active: bool = Field(description="Worker active status")
    timestamp: str = Field(description="Registration/update timestamp (ISO 8601)")


class EstimateCostRequest(BaseModel):
    """Request to estimate job cost from quantum circuit."""

    model_config = ConfigDict(extra="forbid")

    circuit: str = Field(min_length=1, description="OpenQASM circuit string")

    @field_validator("circuit")
    @classmethod
    def validate_circuit(cls, v: str) -> str:
        """Validate circuit is not empty."""
        if not v.strip():
            raise ValueError("circuit cannot be empty")
        return v


class OperationBreakdown(BaseModel):
    """Cost breakdown for a single operation type."""

    model_config = ConfigDict(extra="forbid")

    operation: str = Field(description="Operation type (hadamard, cnot, etc.)")
    count: int = Field(description="Number of operations")
    price_per_op: float | None = Field(description="Price per operation in USDC")
    subtotal: float | None = Field(description="Subtotal cost for this operation")
    worker_id: str | None = Field(description="Assigned worker ID")
    worker_reputation: float | None = Field(description="Worker reputation score")
    error: str | None = Field(default=None, description="Error message if no worker available")


class EstimateCostResponse(BaseModel):
    """Response from job cost estimation."""

    model_config = ConfigDict(extra="forbid")

    total_usdc: float = Field(description="Total estimated cost in USDC")
    breakdown: list[OperationBreakdown] = Field(
        description="Per-operation cost breakdown with worker assignments"
    )
    operation_counts: dict[str, int] = Field(
        description="Count of each operation type in the circuit"
    )
    workers_required: list[str] = Field(
        description="List of worker IDs needed for this job"
    )


class WorkerInfo(BaseModel):
    """Worker information and statistics."""

    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(description="Worker identifier")
    wallet_address: str = Field(description="Worker wallet address")
    pricing: dict[str, float] = Field(description="Pricing per operation type")
    performance_tier: str = Field(description="Performance tier")
    reputation_score: float = Field(description="Reputation score (0-100)")
    total_earned: float = Field(description="Total USDC earned")
    jobs_completed: int = Field(description="Number of jobs completed")
    is_active: bool = Field(default=True, description="Active status")
    agent_name: str | None = Field(default=None, description="Display name")
    specialty: str | None = Field(default=None, description="Specialisation area")
    description: str | None = Field(default=None, description="Agent description")
    price_per_task: float | None = Field(default=None, description="Price per task in USDC")


class ListWorkersResponse(BaseModel):
    """Response with list of active workers."""

    model_config = ConfigDict(extra="forbid")

    workers: list[WorkerInfo] = Field(description="List of active workers")
    total: int = Field(description="Total number of workers matching criteria")


class WorkerEarningsResponse(BaseModel):
    """Response with worker earnings and statistics."""

    model_config = ConfigDict(extra="forbid")

    worker_id: str = Field(description="Worker identifier")
    wallet_address: str = Field(description="Worker wallet address")
    total_earned: float = Field(description="Total USDC earned")
    jobs_completed: int = Field(description="Number of jobs completed")
    reputation_score: float = Field(description="Current reputation score (0-100)")
    performance_tier: str = Field(description="Performance tier")
    is_active: bool = Field(description="Active status")
    pricing: dict[str, float] = Field(description="Current pricing per operation")
    published_at: str = Field(description="First registration timestamp (ISO 8601)")
    updated_at: str = Field(description="Last update timestamp (ISO 8601)")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/marketplace", tags=["marketplace"])

# Initialize services
agentkit_service = AgentKitService()
marketplace_service = MarketplaceService(agentkit_service=agentkit_service)


@router.post(
    "/register-pricing",
    response_model=RegisterPricingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register or update worker pricing",
    description="Registers or updates pricing for a quantum computing worker in the marketplace. "
                "Broadcasts pricing update to the network via GossipSub for price discovery.",
)
async def register_worker_pricing(
    body: RegisterPricingRequest,
    current_user: CurrentUser,
) -> RegisterPricingResponse:
    """Register or update worker pricing in the marketplace.

    Creates or updates a worker's pricing entry in the marketplace. The pricing
    will be broadcast to the network for price discovery. Workers must have a
    wallet created before registering pricing.

    Args:
        body: Worker pricing registration request
        current_user: Authenticated user from dependency injection

    Returns:
        RegisterPricingResponse with worker details and reputation

    Raises:
        PlatformException: If wallet not found, pricing invalid, or registration fails
    """
    try:
        # Register pricing via MarketplaceService
        result = await marketplace_service.register_worker_pricing(
            worker_id=body.worker_id,
            pricing=body.pricing,
            performance_tier=body.performance_tier,
        )

        return RegisterPricingResponse(
            worker_id=result["worker_id"],
            wallet_address=result["wallet_address"],
            pricing=result["pricing"],
            performance_tier=result["performance_tier"],
            reputation_score=result["reputation_score"],
            is_active=result["is_active"],
            timestamp=result["timestamp"].isoformat(),
        )

    except ValueError as e:
        logger.error(f"Invalid pricing registration request: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.INVALID_INPUT,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to register worker pricing: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to register worker pricing",
        )


@router.get(
    "/workers",
    response_model=ListWorkersResponse,
    status_code=status.HTTP_200_OK,
    summary="List active workers",
    description="Retrieves list of active workers meeting the specified criteria. "
                "Useful for browsing available workers and their pricing.",
)
async def list_workers(
    current_user: CurrentUser,
    min_reputation: float = Query(
        default=40.0,
        ge=0.0,
        le=100.0,
        description="Minimum reputation score filter (0-100)"
    ),
    performance_tier: Literal["bronze", "silver", "gold", "platinum"] | None = Query(
        default=None,
        description="Optional performance tier filter"
    ),
) -> ListWorkersResponse:
    """List active workers meeting criteria.

    Returns a list of active workers filtered by reputation and optionally by
    performance tier. Results are sorted by reputation score (highest first).

    Args:
        current_user: Authenticated user from dependency injection
        min_reputation: Minimum reputation score (default: 40.0)
        performance_tier: Optional performance tier filter

    Returns:
        ListWorkersResponse with list of workers and total count

    Raises:
        PlatformException: If worker query fails
    """
    try:
        # Query active workers via MarketplaceService
        workers = await marketplace_service.list_active_workers(
            min_reputation=min_reputation,
            performance_tier=performance_tier,
        )

        # Convert to response format
        worker_items = [
            WorkerInfo(
                worker_id=w["worker_id"],
                wallet_address=w["wallet_address"],
                pricing=w["pricing"],
                performance_tier=w["performance_tier"],
                reputation_score=w["reputation_score"],
                total_earned=w["total_earned"],
                jobs_completed=w["jobs_completed"],
                is_active=True,
                agent_name=w.get("agent_name"),
                specialty=w.get("specialty"),
                description=w.get("description"),
                price_per_task=w.get("price_per_task"),
            )
            for w in workers
        ]

        return ListWorkersResponse(
            workers=worker_items,
            total=len(worker_items),
        )

    except Exception as e:
        logger.error(f"Failed to list workers: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve worker list",
        )


@router.post(
    "/estimate-cost",
    response_model=EstimateCostResponse,
    status_code=status.HTTP_200_OK,
    summary="Estimate job cost",
    description="Estimates the total cost of executing a quantum circuit based on current "
                "worker pricing. Parses the OpenQASM circuit and calculates cost using "
                "cheapest available workers for each operation type.",
)
async def estimate_job_cost(
    body: EstimateCostRequest,
    current_user: CurrentUser,
) -> EstimateCostResponse:
    """Estimate cost of executing a quantum circuit.

    Parses the provided OpenQASM circuit, counts operations, and calculates
    the total cost based on current marketplace pricing. Routes each operation
    to the cheapest qualified worker.

    Args:
        body: Cost estimation request with circuit
        current_user: Authenticated user from dependency injection

    Returns:
        EstimateCostResponse with total cost, breakdown, and worker assignments

    Raises:
        PlatformException: If circuit invalid or cost estimation fails
    """
    try:
        # Estimate cost via MarketplaceService
        estimate = await marketplace_service.estimate_job_cost(circuit=body.circuit)

        # Convert to response format
        breakdown_items = [
            OperationBreakdown(
                operation=item["operation"],
                count=item["count"],
                price_per_op=item.get("price_per_op"),
                subtotal=item.get("subtotal"),
                worker_id=item.get("worker_id"),
                worker_reputation=item.get("worker_reputation"),
                error=item.get("error"),
            )
            for item in estimate["breakdown"]
        ]

        return EstimateCostResponse(
            total_usdc=estimate["total_usdc"],
            breakdown=breakdown_items,
            operation_counts=estimate["operation_counts"],
            workers_required=estimate["workers_required"],
        )

    except ValueError as e:
        logger.error(f"Invalid circuit for cost estimation: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.INVALID_INPUT,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to estimate job cost: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to estimate job cost",
        )


@router.get(
    "/worker/{worker_id}/earnings",
    response_model=WorkerEarningsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get worker earnings",
    description="Retrieves comprehensive statistics for a specific worker, including "
                "total earnings, jobs completed, reputation, and pricing.",
)
async def get_worker_earnings(
    worker_id: str = Path(..., description="Worker identifier"),
    current_user: CurrentUser = None,
) -> WorkerEarningsResponse:
    """Get earnings and statistics for a specific worker.

    Returns detailed information about a worker's performance, earnings, and
    current marketplace status.

    Args:
        worker_id: Worker identifier
        current_user: Authenticated user from dependency injection

    Returns:
        WorkerEarningsResponse with comprehensive worker statistics

    Raises:
        PlatformException: If worker not found or query fails
    """
    try:
        # Get worker stats via MarketplaceService
        stats = await marketplace_service.get_worker_stats(worker_id=worker_id)

        return WorkerEarningsResponse(
            worker_id=stats["worker_id"],
            wallet_address=stats["wallet_address"],
            total_earned=stats["total_earned"],
            jobs_completed=stats["jobs_completed"],
            reputation_score=stats["reputation_score"],
            performance_tier=stats["performance_tier"],
            is_active=stats["is_active"],
            pricing=stats["pricing"],
            published_at=stats["published_at"].isoformat(),
            updated_at=stats["updated_at"].isoformat(),
        )

    except ValueError as e:
        logger.error(f"Worker not found: {e}")
        raise PlatformException(
            status_code=status.HTTP_404_NOT_FOUND,
            error=ErrorCode.NOT_FOUND,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to get worker earnings for {worker_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve worker earnings",
        )
