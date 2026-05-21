"""Research Proposals API Router - The NOVEL FEATURE of the platform.

This router handles research crowdfunding with AI-powered auto-fragmentation:
- Create proposals with auto-fragmentation using Claude 3.5 Sonnet
- Fund proposals with USDC (stored in Aave escrow for yield)
- Claim fragments for execution
- Submit results to IPFS
- Release payments from escrow

Integration:
- ProposalService: Core business logic with Bedrock AI
- MongoDB: ResearchProposalDocument collection
- AgentKit: USDC payments via Base Sepolia
- IPFS: Research results storage
"""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Query, status
from pydantic import BaseModel, Field, ConfigDict

from quantum_backend_v2.api.deps.auth import CurrentUser
from quantum_backend_v2.api.errors.models import PlatformException, ErrorCode
from db.agentkit_collections import ResearchProposalDocument
from services.proposal_service import ProposalService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Request/Response Models
# ---------------------------------------------------------------------------


class ProposalCreateRequest(BaseModel):
    """Request to create a new research proposal."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200, description="Proposal title")
    description: str = Field(min_length=1, description="Detailed proposal description")
    methodology: str = Field(min_length=1, description="Research methodology")
    budget_required: str = Field(min_length=1, description="Total USDC funding needed")
    tags: list[str] = Field(default_factory=list, description="Research categories/topics")
    auto_fragment: bool = Field(default=False, description="Enable AI auto-fragmentation")
    funding_threshold: str | None = Field(default=None, description="Minimum funding threshold (default: 70%)")
    deadline_days: int = Field(default=30, ge=1, le=365, description="Days until deadline")
    expected_timeline: str = Field(default="Not specified", description="Expected research duration")


class FragmentInfo(BaseModel):
    """Information about a research fragment."""

    model_config = ConfigDict(extra="forbid")

    fragment_id: str = Field(description="Unique fragment identifier")
    title: str = Field(description="Fragment title")
    description: str = Field(description="Fragment description")
    budget_allocated: str = Field(description="USDC allocated to this fragment")
    status: str = Field(description="Fragment status (unclaimed, claimed, completed)")
    claimed_by: str | None = Field(default=None, description="Researcher who claimed this fragment")
    claimed_at: str | None = Field(default=None, description="ISO timestamp of claim")


class ProposalResponse(BaseModel):
    """Response from proposal creation."""

    model_config = ConfigDict(extra="forbid")

    proposal_id: str = Field(description="Unique proposal identifier")
    title: str = Field(description="Proposal title")
    status: str = Field(description="Proposal status")
    researcher_id: str = Field(description="Researcher who created the proposal")
    budget_required: str = Field(description="Total USDC funding needed")
    budget_raised: str = Field(description="USDC raised so far")
    fragments: list[FragmentInfo] = Field(default_factory=list, description="Auto-generated fragments")
    created_at: str = Field(description="ISO timestamp")


class FundProposalRequest(BaseModel):
    """Request to fund a research proposal."""

    model_config = ConfigDict(extra="forbid")

    amount: str = Field(min_length=1, description="USDC amount to contribute")


class FundProposalResponse(BaseModel):
    """Response from funding a proposal."""

    model_config = ConfigDict(extra="forbid")

    payment_id: str = Field(description="Unique payment identifier")
    transaction_hash: str = Field(description="Blockchain transaction hash")
    basescan_url: str = Field(description="URL to view transaction on Basescan")
    budget_raised: str = Field(description="Updated total USDC raised")
    funding_percentage: str = Field(description="Percentage of goal reached")


class ClaimFragmentResponse(BaseModel):
    """Response from claiming a fragment."""

    model_config = ConfigDict(extra="forbid")

    fragment_id: str = Field(description="Claimed fragment ID")
    claimed_by: str = Field(description="Researcher who claimed the fragment")
    claimed_at: str = Field(description="ISO timestamp of claim")
    fragment_title: str = Field(description="Fragment title")
    fragment_budget: str = Field(description="Allocated budget for this fragment")


class SubmitResultsRequest(BaseModel):
    """Request to submit research results."""

    model_config = ConfigDict(extra="forbid")

    fragment_id: str | None = Field(default=None, description="Fragment ID (if submitting fragment results)")
    results_data: dict[str, Any] = Field(description="Research results and findings")


class SubmitResultsResponse(BaseModel):
    """Response from submitting results."""

    model_config = ConfigDict(extra="forbid")

    results_ipfs_hash: str = Field(description="IPFS content identifier")
    gateway_url: str = Field(description="Public IPFS gateway URL")
    payment_released: bool = Field(description="Whether payment was released from escrow")
    payment_amount: str | None = Field(default=None, description="Amount released (if applicable)")


class FunderInfo(BaseModel):
    """Information about a proposal funder."""

    model_config = ConfigDict(extra="forbid")

    funder_id: str = Field(description="Funder identifier")
    funder_type: str = Field(description="Type of funder (user, agent, worker)")
    wallet_address: str = Field(description="Funder's wallet address")
    amount_usdc: str = Field(description="Amount contributed in USDC")
    funded_at: str = Field(description="ISO timestamp of contribution")


class FunderListResponse(BaseModel):
    """Response containing list of funders."""

    model_config = ConfigDict(extra="forbid")

    funders: list[FunderInfo] = Field(default_factory=list)
    total_funders: int = Field(description="Total number of funders")
    total_raised: str = Field(description="Total USDC raised")


class ProposalDetailResponse(BaseModel):
    """Detailed proposal information."""

    model_config = ConfigDict(extra="forbid")

    proposal_id: str
    title: str
    description: str
    methodology: str
    researcher_id: str
    researcher_wallet: str
    budget_required: str
    budget_raised: str
    funding_threshold: str
    deadline: str
    status: str
    tags: list[str]
    fragments: list[FragmentInfo]
    funders: list[FunderInfo]
    results_ipfs_hash: str | None
    created_at: str
    updated_at: str


class ProposalListItem(BaseModel):
    """Compact proposal info for list views."""

    model_config = ConfigDict(extra="forbid")

    proposal_id: str
    title: str
    researcher_id: str
    budget_required: str
    budget_raised: str
    funding_percentage: str
    status: str
    tags: list[str]
    deadline: str
    created_at: str


class ProposalListResponse(BaseModel):
    """Response containing paginated list of proposals."""

    model_config = ConfigDict(extra="forbid")

    proposals: list[ProposalListItem] = Field(default_factory=list)
    total: int = Field(description="Total number of proposals matching filters")
    limit: int = Field(description="Page size")
    offset: int = Field(description="Page offset")


class GenerateFragmentsResponse(BaseModel):
    """Response from fragment generation."""

    model_config = ConfigDict(extra="forbid")

    fragments: list[FragmentInfo] = Field(description="Generated fragments")
    total_fragments: int = Field(description="Number of fragments generated")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/v1/proposals", tags=["proposals"])

# Initialize Proposal service
proposal_service = ProposalService()


@router.post(
    "",
    response_model=ProposalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create research proposal",
    description="Create a new research proposal with optional AI auto-fragmentation using Claude 3.5 Sonnet.",
)
async def create_proposal(
    body: ProposalCreateRequest,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> ProposalResponse:
    """Create a new research proposal.

    This endpoint creates a research proposal that can be crowdfunded with USDC.
    If auto_fragment=True, Claude 3.5 Sonnet will automatically break down the
    proposal into smaller, independent research fragments.

    Args:
        body: Proposal creation request with title, description, methodology, budget, tags
        current_user: Authenticated user from dependency injection
        background_tasks: FastAPI background tasks for notifications

    Returns:
        ProposalResponse with proposal_id, title, status, and fragments

    Raises:
        PlatformException: If proposal creation fails or parameters invalid
    """
    try:
        # Convert budget strings to Decimal
        budget_required = Decimal(body.budget_required)
        funding_threshold = Decimal(body.funding_threshold) if body.funding_threshold else None

        # Create proposal via service
        proposal_data = await proposal_service.create_proposal(
            researcher_id=current_user.user_id,
            title=body.title,
            description=body.description,
            methodology=body.methodology,
            budget_required=budget_required,
            tags=body.tags,
            funding_threshold=funding_threshold,
            deadline_days=body.deadline_days,
            expected_timeline=body.expected_timeline,
            auto_fragment=body.auto_fragment,
        )

        # Format fragments for response
        fragments = []
        for frag in proposal_data.get("fragments", []):
            fragments.append(
                FragmentInfo(
                    fragment_id=frag["fragment_id"],
                    title=frag["title"],
                    description=frag["description"],
                    budget_allocated=str(frag.get("budget_allocated", "0")),
                    status=frag.get("status", "unclaimed"),
                    claimed_by=frag.get("claimed_by"),
                    claimed_at=frag.get("claimed_at").isoformat() if frag.get("claimed_at") else None,
                )
            )

        return ProposalResponse(
            proposal_id=proposal_data["proposal_id"],
            title=proposal_data["title"],
            status=proposal_data["status"],
            researcher_id=proposal_data["researcher_id"],
            budget_required=str(proposal_data["budget_required"]),
            budget_raised="0",
            fragments=fragments,
            created_at=proposal_data["created_at"].isoformat(),
        )

    except ValueError as e:
        logger.error(f"Invalid proposal parameters: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to create proposal for user {current_user.user_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to create research proposal",
        )


@router.get(
    "",
    response_model=ProposalListResponse,
    status_code=status.HTTP_200_OK,
    summary="List research proposals",
    description="Retrieve a paginated, filtered list of research proposals.",
)
async def list_proposals(
    status_filter: str | None = Query(default=None, alias="status", description="Filter by status"),
    tags: list[str] | None = Query(default=None, description="Filter by tags"),
    researcher_id: str | None = Query(default=None, description="Filter by researcher ID"),
    limit: int = Query(default=20, ge=1, le=100, description="Number of proposals per page"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),
) -> ProposalListResponse:
    """List research proposals with optional filters.

    Returns a paginated list of research proposals. Can be filtered by status,
    tags, or researcher ID.

    Args:
        status_filter: Filter by proposal status (active, funded, in_progress, completed, etc.)
        tags: Filter by research tags/categories
        researcher_id: Filter by researcher who created the proposal
        limit: Number of proposals per page (1-100, default 20)
        offset: Pagination offset (default 0)

    Returns:
        ProposalListResponse with proposals list and pagination info

    Raises:
        PlatformException: If query fails
    """
    try:
        # Build MongoDB filter
        query_filter = {}
        if status_filter:
            query_filter["status"] = status_filter
        if researcher_id:
            query_filter["researcher_id"] = researcher_id
        if tags:
            # Match any of the provided tags
            query_filter["tags"] = {"$in": tags}

        # Query proposals from MongoDB
        proposals_cursor = ResearchProposalDocument.find(query_filter).sort([("created_at", -1)]).skip(offset).limit(limit)
        proposals = await proposals_cursor.to_list()

        # Count total matching proposals
        total_count = await ResearchProposalDocument.find(query_filter).count()

        # Format proposals for response
        proposal_items = []
        for prop in proposals:
            budget_required = prop.budget_required.to_decimal()
            budget_raised = prop.budget_raised.to_decimal()
            funding_percentage = (budget_raised / budget_required * 100) if budget_required > 0 else 0

            proposal_items.append(
                ProposalListItem(
                    proposal_id=prop.proposal_id,
                    title=prop.title,
                    researcher_id=prop.researcher_id,
                    budget_required=str(budget_required),
                    budget_raised=str(budget_raised),
                    funding_percentage=f"{funding_percentage:.1f}%",
                    status=prop.status,
                    tags=prop.tags,
                    deadline=prop.deadline.isoformat(),
                    created_at=prop.created_at.isoformat(),
                )
            )

        return ProposalListResponse(
            proposals=proposal_items,
            total=total_count,
            limit=limit,
            offset=offset,
        )

    except Exception as e:
        logger.error(f"Failed to list proposals: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve proposals",
        )


@router.get(
    "/{proposal_id}",
    response_model=ProposalDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get proposal details",
    description="Retrieve complete details for a specific research proposal.",
)
async def get_proposal(
    proposal_id: str,
) -> ProposalDetailResponse:
    """Get detailed information about a research proposal.

    Returns complete proposal details including fragments, funders, and results.

    Args:
        proposal_id: Unique proposal identifier

    Returns:
        ProposalDetailResponse with complete proposal information

    Raises:
        PlatformException: If proposal not found
    """
    try:
        # Get proposal from MongoDB
        proposal = await ResearchProposalDocument.find_one({"proposal_id": proposal_id})
        if not proposal:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Proposal not found: {proposal_id}",
            )

        # Format fragments
        fragments = []
        for frag in proposal.fragments:
            if isinstance(frag, dict):
                fragments.append(
                    FragmentInfo(
                        fragment_id=frag["fragment_id"],
                        title=frag["title"],
                        description=frag["description"],
                        budget_allocated=str(frag.get("budget_allocated", "0")),
                        status=frag.get("status", "unclaimed"),
                        claimed_by=frag.get("claimed_by"),
                        claimed_at=(
                            frag["claimed_at"].isoformat()
                            if frag.get("claimed_at") and hasattr(frag["claimed_at"], "isoformat")
                            else frag.get("claimed_at")  # already a string
                        ),
                    )
                )

        # Format funders
        funders = []
        for funder in proposal.funders:
            funders.append(
                FunderInfo(
                    funder_id=funder["funder_id"],
                    funder_type=funder.get("funder_type", "user"),
                    wallet_address=funder["wallet_address"],
                    amount_usdc=str(funder["amount_usdc"].to_decimal()),
                    funded_at=funder["funded_at"].isoformat(),
                )
            )

        return ProposalDetailResponse(
            proposal_id=proposal.proposal_id,
            title=proposal.title,
            description=proposal.description,
            methodology=proposal.methodology,
            researcher_id=proposal.researcher_id,
            researcher_wallet=proposal.researcher_wallet,
            budget_required=str(proposal.budget_required.to_decimal()),
            budget_raised=str(proposal.budget_raised.to_decimal()),
            funding_threshold=str(proposal.funding_threshold.to_decimal()),
            deadline=proposal.deadline.isoformat(),
            status=proposal.status,
            tags=proposal.tags,
            fragments=fragments,
            funders=funders,
            results_ipfs_hash=proposal.results_ipfs_hash,
            created_at=proposal.created_at.isoformat(),
            updated_at=proposal.updated_at.isoformat(),
        )

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to get proposal {proposal_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve proposal details",
        )


@router.post(
    "/{proposal_id}/fund",
    response_model=FundProposalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Fund research proposal",
    description="Contribute USDC to a research proposal. Funds are held in Aave escrow earning yield.",
)
async def fund_proposal(
    proposal_id: str,
    body: FundProposalRequest,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> FundProposalResponse:
    """Fund a research proposal with USDC.

    Contributes USDC to the proposal. Funds are deposited into Aave escrow
    where they earn yield until research is complete.

    Args:
        proposal_id: Proposal to fund
        body: Funding request with amount
        current_user: Authenticated user from dependency injection
        background_tasks: FastAPI background tasks for notifications

    Returns:
        FundProposalResponse with payment details and updated funding status

    Raises:
        PlatformException: If proposal not found, invalid amount, or funding fails
    """
    try:
        # Convert amount to Decimal
        amount = Decimal(body.amount)

        if amount <= 0:
            raise ValueError("Amount must be greater than 0")

        # Fund proposal via service
        funding_result = await proposal_service.fund_proposal(
            proposal_id=proposal_id,
            funder_id=current_user.user_id,
            funder_type="user",
            amount=amount,
        )

        # Generate Basescan URL
        transaction_hash = funding_result["transaction_hash"]
        basescan_url = f"https://sepolia.basescan.org/tx/{transaction_hash}"

        # Calculate funding percentage
        new_total = funding_result["new_total_raised"]
        budget_required = funding_result.get("budget_required", new_total)
        funding_percentage = (new_total / budget_required * 100) if budget_required > 0 else 0

        return FundProposalResponse(
            payment_id=funding_result.get("payment_id", transaction_hash),
            transaction_hash=transaction_hash,
            basescan_url=basescan_url,
            budget_raised=str(new_total),
            funding_percentage=f"{funding_percentage:.1f}%",
        )

    except ValueError as e:
        logger.error(f"Invalid funding parameters: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to fund proposal {proposal_id}: {e}")
        # Check for common error patterns
        error_msg = str(e).lower()
        if "insufficient" in error_msg or "balance" in error_msg:
            raise PlatformException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error=ErrorCode.VALIDATION_ERROR,
                message="Insufficient balance for funding",
            )
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to fund proposal",
        )


@router.post(
    "/{proposal_id}/fragments/{fragment_id}/claim",
    response_model=ClaimFragmentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Claim research fragment",
    description="Claim a research fragment for execution by a researcher.",
)
async def claim_fragment(
    proposal_id: str,
    fragment_id: str,
    current_user: CurrentUser,
) -> ClaimFragmentResponse:
    """Claim a research fragment for execution.

    Allows a researcher to claim an unclaimed fragment. Once claimed, the
    researcher is responsible for executing that portion of the research.

    Args:
        proposal_id: Proposal containing the fragment
        fragment_id: Fragment to claim
        current_user: Authenticated user from dependency injection

    Returns:
        ClaimFragmentResponse with fragment details and claim timestamp

    Raises:
        PlatformException: If fragment not found, already claimed, or claim fails
    """
    try:
        # Claim fragment via service
        claim_result = await proposal_service.claim_fragment(
            proposal_id=proposal_id,
            fragment_id=fragment_id,
            researcher_id=current_user.user_id,
        )

        return ClaimFragmentResponse(
            fragment_id=claim_result["fragment_id"],
            claimed_by=claim_result["researcher_id"],
            claimed_at=claim_result["claimed_at"].isoformat(),
            fragment_title=claim_result["fragment_title"],
            fragment_budget=str(claim_result.get("fragment_budget", "0")),
        )

    except ValueError as e:
        logger.error(f"Invalid claim request: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to claim fragment {fragment_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to claim fragment",
        )


@router.post(
    "/{proposal_id}/results",
    response_model=SubmitResultsResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit research results",
    description="Submit research results to IPFS and trigger payment release from escrow.",
)
async def submit_results(
    proposal_id: str,
    body: SubmitResultsRequest,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
) -> SubmitResultsResponse:
    """Submit research results.

    Submits research results to IPFS and triggers payment release from Aave
    escrow. Only the researcher or fragment claimer can submit results.

    Args:
        proposal_id: Proposal to submit results for
        body: Results submission with results_data and optional fragment_id
        current_user: Authenticated user from dependency injection
        background_tasks: FastAPI background tasks for notifications

    Returns:
        SubmitResultsResponse with IPFS hash, gateway URL, and payment info

    Raises:
        PlatformException: If unauthorized, invalid data, or submission fails
    """
    try:
        # Verify authorization: user must be researcher or fragment claimer
        proposal = await ResearchProposalDocument.find_one({"proposal_id": proposal_id})
        if not proposal:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Proposal not found: {proposal_id}",
            )

        # Check if user is the researcher
        is_researcher = proposal.researcher_id == current_user.user_id

        # If submitting fragment results, check if user claimed the fragment
        is_fragment_claimer = False
        if body.fragment_id:
            for frag in proposal.fragments:
                if isinstance(frag, dict) and frag.get("fragment_id") == body.fragment_id:
                    is_fragment_claimer = frag.get("claimed_by") == current_user.user_id
                    break

        # Authorization check
        if not (is_researcher or is_fragment_claimer):
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message="Only the researcher or fragment claimer can submit results",
            )

        # Submit results via service
        submission_result = await proposal_service.submit_results(
            proposal_id=proposal_id,
            researcher_id=current_user.user_id,
            results_data=body.results_data,
            fragment_id=body.fragment_id,
        )

        return SubmitResultsResponse(
            results_ipfs_hash=submission_result["ipfs_hash"],
            gateway_url=submission_result["ipfs_url"],
            payment_released=submission_result.get("payment_released", False),
            payment_amount=str(submission_result["payment_amount"]) if submission_result.get("payment_amount") else None,
        )

    except PlatformException:
        raise
    except ValueError as e:
        logger.error(f"Invalid results submission: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to submit results for proposal {proposal_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to submit research results",
        )


@router.get(
    "/{proposal_id}/funders",
    response_model=FunderListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get proposal funders",
    description="Retrieve list of funders who contributed to a research proposal.",
)
async def get_funders(
    proposal_id: str,
) -> FunderListResponse:
    """Get list of funders for a research proposal.

    Returns all funders who have contributed USDC to the proposal,
    along with their contribution amounts.

    Args:
        proposal_id: Proposal to get funders for

    Returns:
        FunderListResponse with list of funders and total raised

    Raises:
        PlatformException: If proposal not found or query fails
    """
    try:
        # Get proposal from MongoDB
        proposal = await ResearchProposalDocument.find_one({"proposal_id": proposal_id})
        if not proposal:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Proposal not found: {proposal_id}",
            )

        # Format funders
        funders = []
        for funder in proposal.funders:
            funders.append(
                FunderInfo(
                    funder_id=funder["funder_id"],
                    funder_type=funder.get("funder_type", "user"),
                    wallet_address=funder["wallet_address"],
                    amount_usdc=str(funder["amount_usdc"].to_decimal()),
                    funded_at=funder["funded_at"].isoformat(),
                )
            )

        return FunderListResponse(
            funders=funders,
            total_funders=len(funders),
            total_raised=str(proposal.budget_raised.to_decimal()),
        )

    except PlatformException:
        raise
    except Exception as e:
        logger.error(f"Failed to get funders for proposal {proposal_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to retrieve funders",
        )


@router.post(
    "/{proposal_id}/fragments/generate",
    response_model=GenerateFragmentsResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate research fragments",
    description="Use AI to generate research fragments for an existing proposal (researcher only).",
)
async def generate_fragments(
    proposal_id: str,
    current_user: CurrentUser,
) -> GenerateFragmentsResponse:
    """Generate research fragments using Claude 3.5 Sonnet.

    Uses AI to automatically break down the research proposal into smaller,
    independent fragments. Only the proposal researcher can trigger this.

    Args:
        proposal_id: Proposal to generate fragments for
        current_user: Authenticated user from dependency injection

    Returns:
        GenerateFragmentsResponse with array of generated fragments

    Raises:
        PlatformException: If unauthorized, proposal not found, or generation fails
    """
    try:
        # Get proposal from MongoDB
        proposal = await ResearchProposalDocument.find_one({"proposal_id": proposal_id})
        if not proposal:
            raise PlatformException(
                status_code=status.HTTP_404_NOT_FOUND,
                error=ErrorCode.NOT_FOUND,
                message=f"Proposal not found: {proposal_id}",
            )

        # Verify user is the researcher
        if proposal.researcher_id != current_user.user_id:
            raise PlatformException(
                status_code=status.HTTP_403_FORBIDDEN,
                error=ErrorCode.FORBIDDEN,
                message="Only the proposal researcher can generate fragments",
            )

        # Generate fragments via AI
        fragments = await proposal_service._auto_fragment_proposal(
            title=proposal.title,
            description=proposal.description,
            methodology=proposal.methodology,
            budget=proposal.budget_required.to_decimal(),
            timeline="Not specified",  # Could extract from proposal if stored
            tags=proposal.tags,
        )

        # Update proposal with generated fragments
        await ResearchProposalDocument.find_one_and_update(
            {"proposal_id": proposal_id},
            {"$set": {"fragments": fragments}},
        )

        # Format fragments for response
        fragment_infos = []
        for frag in fragments:
            fragment_infos.append(
                FragmentInfo(
                    fragment_id=frag["fragment_id"],
                    title=frag["title"],
                    description=frag["description"],
                    budget_allocated=str(frag.get("budget_allocated", "0")),
                    status=frag.get("status", "unclaimed"),
                    claimed_by=frag.get("claimed_by"),
                    claimed_at=frag.get("claimed_at").isoformat() if frag.get("claimed_at") else None,
                )
            )

        return GenerateFragmentsResponse(
            fragments=fragment_infos,
            total_fragments=len(fragment_infos),
        )

    except PlatformException:
        raise
    except ValueError as e:
        logger.error(f"Invalid fragment generation request: {e}")
        raise PlatformException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error=ErrorCode.VALIDATION_ERROR,
            message=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to generate fragments for proposal {proposal_id}: {e}")
        raise PlatformException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error=ErrorCode.INTERNAL_ERROR,
            message="Failed to generate research fragments",
        )
