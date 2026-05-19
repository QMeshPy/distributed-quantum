"""Research proposal-related Pydantic models for crowdfunding platform."""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict


class ProposalStatus(str, Enum):
    """Enum for proposal status values."""

    OPEN = "open"
    FUNDED = "funded"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class FragmentStatus(str, Enum):
    """Enum for fragment status values."""

    AVAILABLE = "available"
    CLAIMED = "claimed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class ProposalCreate(BaseModel):
    """Request schema for creating a new research proposal."""

    title: str = Field(..., min_length=10, max_length=200, description="Proposal title")
    description: str = Field(
        ..., min_length=50, max_length=5000, description="Detailed description"
    )
    researcher_id: str = Field(..., description="ID of the researcher creating proposal")
    funding_goal: Decimal = Field(..., gt=0, description="Target funding amount in USDC")
    deadline: datetime = Field(..., description="Funding deadline")
    research_area: str = Field(
        ..., description="Research area (quantum, cryptography, etc.)"
    )
    auto_fragment: bool = Field(
        default=False,
        description="Auto-fragment proposal using AI (default: false)"
    )

    @field_validator("funding_goal")
    @classmethod
    def validate_funding_goal(cls, v: Decimal) -> Decimal:
        """Validate funding goal is positive and has reasonable precision."""
        if v <= 0:
            raise ValueError("Funding goal must be greater than 0")
        if v.as_tuple().exponent < -2:
            raise ValueError("Funding goal cannot have more than 2 decimal places")
        if v > Decimal("1000000"):
            raise ValueError("Funding goal cannot exceed $1,000,000")
        return v

    @field_validator("deadline")
    @classmethod
    def validate_deadline(cls, v: datetime) -> datetime:
        """Validate deadline is in the future."""
        if v <= datetime.utcnow():
            raise ValueError("Deadline must be in the future")
        return v

    @field_validator("research_area")
    @classmethod
    def validate_research_area(cls, v: str) -> str:
        """Validate and normalize research area."""
        allowed_areas = {
            "quantum",
            "cryptography",
            "machine_learning",
            "distributed_systems",
            "blockchain",
            "bioinformatics",
            "other"
        }
        v = v.strip().lower()
        if v not in allowed_areas:
            raise ValueError(f"Research area must be one of {allowed_areas}")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Quantum Error Correction for Noisy Circuits",
                "description": "Research on implementing surface codes for quantum error correction in near-term quantum devices. This project will explore...",
                "researcher_id": "researcher_123",
                "funding_goal": "5000.00",
                "deadline": "2026-12-31T23:59:59Z",
                "research_area": "quantum",
                "auto_fragment": True
            }
        }
    )


class ProposalResponse(BaseModel):
    """Response schema for basic proposal information."""

    proposal_id: str = Field(..., description="Unique proposal identifier")
    title: str = Field(..., description="Proposal title")
    researcher_id: str = Field(..., description="Researcher who created the proposal")
    status: ProposalStatus = Field(..., description="Current proposal status")
    funding_goal: Decimal = Field(..., description="Target funding amount in USDC")
    current_funding: Decimal = Field(
        default=Decimal("0"),
        description="Current amount funded in USDC"
    )
    deadline: datetime = Field(..., description="Funding deadline")
    created_at: datetime = Field(..., description="Timestamp when proposal was created")

    @field_validator("current_funding", "funding_goal")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        """Validate amount is non-negative."""
        if v < 0:
            raise ValueError("Amount cannot be negative")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "proposal_id": "proposal_abc123",
                "title": "Quantum Error Correction for Noisy Circuits",
                "researcher_id": "researcher_123",
                "status": "open",
                "funding_goal": "5000.00",
                "current_funding": "1250.50",
                "deadline": "2026-12-31T23:59:59Z",
                "created_at": "2026-05-20T12:00:00Z"
            }
        }
    )


class FragmentResponse(BaseModel):
    """Response schema for proposal fragment information."""

    fragment_id: str = Field(..., description="Unique fragment identifier")
    title: str = Field(..., description="Fragment title")
    description: str = Field(..., description="Fragment description")
    status: FragmentStatus = Field(..., description="Current fragment status")
    funding_amount: Decimal = Field(..., description="Required funding for this fragment")
    claimed_by: Optional[str] = Field(
        default=None,
        description="Worker/researcher ID who claimed this fragment"
    )
    results_ipfs_hash: Optional[str] = Field(
        default=None,
        description="IPFS hash of submitted results"
    )
    created_at: datetime = Field(..., description="Timestamp when fragment was created")
    claimed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when fragment was claimed"
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when fragment was completed"
    )

    @field_validator("funding_amount")
    @classmethod
    def validate_funding_amount(cls, v: Decimal) -> Decimal:
        """Validate funding amount is non-negative."""
        if v < 0:
            raise ValueError("Funding amount cannot be negative")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "fragment_id": "fragment_xyz789",
                "title": "Literature Review on Surface Codes",
                "description": "Comprehensive review of existing surface code implementations...",
                "status": "claimed",
                "funding_amount": "1000.00",
                "claimed_by": "worker_456",
                "results_ipfs_hash": None,
                "created_at": "2026-05-20T12:00:00Z",
                "claimed_at": "2026-05-21T09:30:00Z",
                "completed_at": None
            }
        }
    )


class ProposalDetail(BaseModel):
    """Response schema for full proposal details including fragments and funders."""

    proposal_id: str = Field(..., description="Unique proposal identifier")
    title: str = Field(..., description="Proposal title")
    description: str = Field(..., description="Full proposal description")
    researcher_id: str = Field(..., description="Researcher who created the proposal")
    status: ProposalStatus = Field(..., description="Current proposal status")
    funding_goal: Decimal = Field(..., description="Target funding amount in USDC")
    current_funding: Decimal = Field(..., description="Current amount funded in USDC")
    deadline: datetime = Field(..., description="Funding deadline")
    research_area: str = Field(..., description="Research area")
    fragments: List[FragmentResponse] = Field(
        default_factory=list,
        description="List of proposal fragments (if fragmented)"
    )
    funders: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of funders with their contribution amounts"
    )
    created_at: datetime = Field(..., description="Timestamp when proposal was created")
    funded_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when funding goal was reached"
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when proposal was completed"
    )

    @field_validator("current_funding", "funding_goal")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        """Validate amount is non-negative."""
        if v < 0:
            raise ValueError("Amount cannot be negative")
        return v

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "proposal_id": "proposal_abc123",
                "title": "Quantum Error Correction for Noisy Circuits",
                "description": "Research on implementing surface codes for quantum error correction...",
                "researcher_id": "researcher_123",
                "status": "funded",
                "funding_goal": "5000.00",
                "current_funding": "5000.00",
                "deadline": "2026-12-31T23:59:59Z",
                "research_area": "quantum",
                "fragments": [
                    {
                        "fragment_id": "fragment_1",
                        "title": "Literature Review",
                        "description": "Review existing work...",
                        "status": "completed",
                        "funding_amount": "1000.00",
                        "claimed_by": "worker_456",
                        "results_ipfs_hash": "QmX...",
                        "created_at": "2026-05-20T12:00:00Z",
                        "claimed_at": "2026-05-21T09:30:00Z",
                        "completed_at": "2026-05-25T14:00:00Z"
                    }
                ],
                "funders": [
                    {"funder_id": "agent_ai_001", "amount": "2500.00", "funded_at": "2026-05-22T10:00:00Z"},
                    {"funder_id": "user_789", "amount": "2500.00", "funded_at": "2026-05-22T11:30:00Z"}
                ],
                "created_at": "2026-05-20T12:00:00Z",
                "funded_at": "2026-05-22T11:30:00Z",
                "completed_at": None
            }
        }
    )


class FundProposalRequest(BaseModel):
    """Request schema for funding a research proposal."""

    amount: Decimal = Field(..., gt=0, description="Funding amount in USDC")
    funder_wallet: str = Field(..., description="Wallet address of the funder")
    funder_id: str = Field(
        ...,
        description="ID of the funder (user_id or agent_id)"
    )

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        """Validate amount is positive and has reasonable precision."""
        if v <= 0:
            raise ValueError("Amount must be greater than 0")
        if v.as_tuple().exponent < -2:
            raise ValueError("Amount cannot have more than 2 decimal places")
        if v > Decimal("1000000"):
            raise ValueError("Amount cannot exceed $1,000,000")
        return v

    @field_validator("funder_wallet")
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

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "amount": "2500.00",
                "funder_wallet": "0x1234567890123456789012345678901234567890",
                "funder_id": "agent_ai_001"
            }
        }
    )


class SubmitResultsRequest(BaseModel):
    """Request schema for submitting research results."""

    results_data: Dict[str, Any] = Field(
        ...,
        description="Research results data (will be uploaded to IPFS)"
    )
    fragment_id: Optional[str] = Field(
        default=None,
        description="Fragment ID (if submitting for a specific fragment)"
    )
    researcher_wallet: str = Field(
        ...,
        description="Wallet address to receive payment"
    )

    @field_validator("results_data")
    @classmethod
    def validate_results_data(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Validate results data is not empty."""
        if not v:
            raise ValueError("Results data cannot be empty")
        # Ensure minimum required fields
        required_fields = {"summary", "findings"}
        if not all(field in v for field in required_fields):
            raise ValueError(f"Results data must contain: {required_fields}")
        return v

    @field_validator("researcher_wallet")
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

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "results_data": {
                    "summary": "Completed literature review of surface codes",
                    "findings": "Key finding 1: Surface codes show promise...",
                    "references": ["arxiv:1234.5678", "doi:10.1000/xyz"],
                    "methodology": "Systematic review following PRISMA guidelines"
                },
                "fragment_id": "fragment_xyz789",
                "researcher_wallet": "0x0987654321098765432109876543210987654321"
            }
        }
    )
