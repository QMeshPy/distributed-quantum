"""
ProposalService - Research Crowdfunding with AI Auto-Fragmentation

This is the CROWN JEWEL service - the most innovative part of the platform!

Features:
1. Create research proposals with Aave escrow
2. Fund proposals with USDC via AgentKit
3. AI-powered auto-fragmentation using Claude 3.5 Sonnet
4. Fragment claiming and results submission
5. IPFS storage for research results
6. Automated escrow management with Aave protocol

AI Model: Claude 3.5 Sonnet via AWS Bedrock
MongoDB: research_proposals collection
Blockchain: Base Sepolia (USDC + Aave V3)
"""

from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timezone, timedelta
from typing import TYPE_CHECKING, Any, Optional, Literal
import logging
import os
import uuid
import json

if TYPE_CHECKING:
    from services.agentkit_service import AgentKitService

logger = logging.getLogger(__name__)

# AWS Bedrock imports
try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError as e:
    logger.warning(f"AWS Bedrock SDK not available: {e}")
    boto3 = Any
    ClientError = Exception

# Motor async MongoDB
try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError as e:
    logger.warning(f"Motor async MongoDB not available: {e}")
    AsyncIOMotorClient = Any

# Import MongoDB models and utilities
import hashlib
from decimal import ROUND_DOWN
from typing import Callable
from db.agentkit_collections import (
    ResearchProposalDocument,
    PaymentDocument,
    FundingRoundDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)
from quantum_backend_v2.payments.ledger import LedgerService
from quantum_backend_v2.payments.models import PaymentPurpose, PaymentRail
from services.payment_events import (
    begin_payout,
    chain_id_of,
    confirm_quietly,
    record_settled_quietly,
    settle_failed_send,
)


def _utc_now() -> datetime:
    """Return current UTC timestamp."""
    return datetime.now(timezone.utc)


class ProposalService:
    """
    Service for managing research proposals with crowdfunding and auto-fragmentation.

    This service handles:
    - Proposal creation with Aave escrow integration
    - USDC funding via AgentKit
    - AI-powered proposal fragmentation using Claude 3.5 Sonnet
    - Fragment claiming by researchers
    - Results submission to IPFS
    - Escrow release and payment distribution
    """

    def __init__(
        self,
        notification_service=None,
        agentkit_service: AgentKitService | None = None,
        ai_agent_service=None,
    ) -> None:
        """
        Initialize Proposal service with AWS Bedrock and MongoDB.

        Loads configuration from environment variables:
        - AWS_REGION (default: us-east-1)
        - BEDROCK_MODEL_ID (default: anthropic.claude-3-5-sonnet-20241022-v2:0)
        - MONGODB_URI
        - MONGODB_DATABASE
        """
        logger.info("Initializing ProposalService")

        # AWS Bedrock configuration
        self.aws_region = os.getenv("AWS_REGION", "us-east-1")
        self.bedrock_model_id = os.getenv(
            "BEDROCK_MODEL_ID",
            "us.anthropic.claude-sonnet-4-6"
        )

        # Initialize Bedrock client
        try:
            self.bedrock = boto3.client(
                "bedrock-runtime",
                region_name=self.aws_region
            )
            logger.info(f"AWS Bedrock client initialized for region: {self.aws_region}")
        except Exception as e:
            logger.warning(f"Failed to initialize AWS Bedrock client: {e}")
            self.bedrock = None

        # Initialize MongoDB connection
        mongodb_uri = os.getenv("QB2_MONGODB_LOCAL_URI", "mongodb://127.0.0.1:27017")
        mongodb_database = os.getenv("QB2_MONGODB_DATABASE", "qds")
        self.mongo_client = AsyncIOMotorClient(mongodb_uri)
        self.db = self.mongo_client[mongodb_database]
        self.ledger = LedgerService(self.db)

        # Load prompts directory path
        self.prompts_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "prompts"
        )

        logger.info("ProposalService initialized")

        # Dependency injection for testability
        self._notification_service = notification_service
        self._agentkit_service = agentkit_service
        self._ai_agent_service = ai_agent_service

    @property
    def agentkit(self) -> AgentKitService:
        if self._agentkit_service is None:
            from services.agentkit_service import AgentKitService

            self._agentkit_service = AgentKitService()
        return self._agentkit_service

    async def create_proposal(
        self,
        researcher_id: str,
        title: str,
        description: str,
        methodology: str,
        budget_required: Decimal,
        tags: list[str],
        funding_threshold: Optional[Decimal] = None,
        deadline_days: int = 30,
        expected_timeline: str = "Not specified",
        auto_fragment: bool = False
    ) -> dict:
        """
        Create a new research proposal with optional AI auto-fragmentation.

        Args:
            researcher_id: ID of the researcher creating the proposal
            title: Proposal title
            description: Detailed description
            methodology: Research methodology
            budget_required: Total USDC funding needed
            tags: Research categories/topics
            funding_threshold: Minimum funding to start (default: 70% of budget_required)
            deadline_days: Days until proposal expires (default: 30)
            expected_timeline: Expected research duration
            auto_fragment: Enable AI auto-fragmentation into sub-experiments

        Returns:
            dict: Created proposal containing:
                - proposal_id: Unique identifier
                - title: Proposal title
                - researcher_id: Researcher ID
                - researcher_wallet: Researcher's wallet address
                - budget_required: Total budget needed
                - funding_threshold: Minimum funding threshold
                - deadline: Deadline timestamp
                - status: Proposal status
                - fragments: List of fragments (if auto_fragment=True)
                - escrow_setup: Escrow configuration
                - created_at: Creation timestamp

        Raises:
            ValueError: If researcher not found or parameters invalid
            Exception: If proposal creation fails
        """
        logger.info(f"Creating proposal '{title}' for researcher {researcher_id}")
        try:
            # Get researcher wallet from MongoDB
            wallet_doc = await self.db.wallets.find_one({"entity_id": researcher_id})
            if not wallet_doc:
                raise ValueError(f"Researcher wallet not found for {researcher_id}")

            researcher_wallet = wallet_doc["default_address"]

            # Generate proposal_id
            proposal_id = str(uuid.uuid4())

            # Set funding threshold (default: 70% of budget)
            if funding_threshold is None:
                funding_threshold = budget_required * Decimal("0.7")

            # Calculate deadline
            deadline = _utc_now() + timedelta(days=deadline_days)

            # Initialize fragments list
            fragments = []

            # If auto_fragment is enabled, call AI to break down the proposal
            if auto_fragment:
                logger.info(f"Auto-fragmenting proposal {proposal_id} using Claude 3.5 Sonnet")
                try:
                    fragments = await self._auto_fragment_proposal(
                        title=title,
                        description=description,
                        methodology=methodology,
                        budget=budget_required,
                        timeline=expected_timeline,
                        tags=tags
                    )
                    logger.info(f"Generated {len(fragments)} fragments for proposal {proposal_id}")
                except Exception as frag_error:
                    logger.error(f"Auto-fragmentation failed: {frag_error}")
                    # Continue without fragments rather than failing the entire proposal

            # Create ResearchProposalDocument
            proposal_doc = ResearchProposalDocument(
                proposal_id=proposal_id,
                title=title,
                description=description,
                researcher_id=researcher_id,
                researcher_wallet=researcher_wallet,
                methodology=methodology,
                budget_required=_decimal_to_decimal128(budget_required),
                budget_raised=_decimal_to_decimal128(Decimal("0")),
                funding_threshold=_decimal_to_decimal128(funding_threshold),
                deadline=deadline,
                status="active",
                tags=tags,
                fragments=fragments,
                funders=[],
                escrow_type="aave_yield",
                aave_pool_address=None,  # Set when first funding arrives
                results_ipfs_hash=None,
            )

            # Save to MongoDB
            await self.db.research_proposals.insert_one(proposal_doc.model_dump())

            logger.info(f"Proposal {proposal_id} saved to database")

            # Import services (avoid circular imports)
            from services.notification_service import NotificationService

            # Broadcast new proposal notification
            notification_service = self._notification_service or NotificationService()
            await notification_service.notify_new_proposal(proposal_doc.model_dump())

            logger.info(f"Proposal {proposal_id} broadcast to network")

            # Trigger AI agents to analyze (async - don't wait)
            try:
                await self._broadcast_new_proposal(proposal_doc.model_dump())
            except Exception as broadcast_error:
                logger.warning(f"Failed to broadcast to AI agents: {broadcast_error}")

            return {
                "proposal_id": proposal_id,
                "title": title,
                "researcher_id": researcher_id,
                "researcher_wallet": researcher_wallet,
                "budget_required": budget_required,
                "funding_threshold": funding_threshold,
                "deadline": deadline,
                "status": "active",
                "fragments": fragments,
                "escrow_setup": {
                    "type": "aave_yield",
                    "status": "pending_first_deposit"
                },
                "created_at": proposal_doc.created_at,
            }

        except Exception as e:
            logger.error(f"Failed to create proposal: {e}")
            raise

    async def fund_proposal(
        self,
        proposal_id: str,
        funder_id: str,
        funder_type: Literal["user", "agent", "worker"],
        amount: Decimal
    ) -> dict:
        """
        Fund a proposal with USDC using Aave escrow.

        Args:
            proposal_id: Proposal to fund
            funder_id: ID of funder (user, agent, or worker)
            funder_type: Type of funder entity
            amount: Amount of USDC to contribute

        Returns:
            dict: Funding result containing:
                - proposal_id: Funded proposal
                - funder_id: Funder ID
                - amount: Contribution amount
                - transaction_hash: Blockchain transaction hash
                - new_total_raised: Updated total funding
                - funding_percentage: Percentage of goal reached
                - fully_funded: Whether proposal reached threshold
                - timestamp: Funding timestamp

        Raises:
            ValueError: If proposal not found or parameters invalid
            Exception: If funding transaction fails
        """
        logger.info(f"Funding proposal {proposal_id} with {amount} USDC from {funder_type}:{funder_id}")
        try:
            # Get proposal from MongoDB
            proposal_doc = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
            if not proposal_doc:
                raise ValueError(f"Proposal not found: {proposal_id}")

            # Validate proposal is active
            if proposal_doc["status"] not in ["active", "funded"]:
                raise ValueError(f"Proposal is not active (status: {proposal_doc['status']})")

            # Check if deadline has passed
            if proposal_doc["deadline"] < _utc_now():
                raise ValueError("Proposal deadline has passed")

            # Get funder wallet
            funder_wallet_doc = await self.db.wallets.find_one({"entity_id": funder_id})
            if not funder_wallet_doc:
                raise ValueError(f"Funder wallet not found for {funder_type}:{funder_id}")

            funder_wallet = funder_wallet_doc["default_address"]

            agentkit_service = self.agentkit

            # Deposit to Aave pool on behalf of proposal wallet
            # This locks the funds in escrow while earning yield
            logger.info(f"Depositing {amount} USDC to Aave escrow for proposal {proposal_id}")

            aave_result = await agentkit_service.aave_supply(
                wallet_address=funder_wallet,
                amount=amount,
                on_behalf_of=proposal_doc["researcher_wallet"]
            )

            logger.info(f"Aave escrow deposit successful: {aave_result['transaction_hash']}")

            # Update proposal: increment budget_raised, add to funders array
            budget_raised = _decimal128_to_decimal(proposal_doc["budget_raised"])
            new_budget_raised = budget_raised + amount
            funding_threshold = _decimal128_to_decimal(proposal_doc["funding_threshold"])

            funder_record = {
                "funder_id": funder_id,
                "funder_type": funder_type,
                "wallet_address": funder_wallet,
                "amount_usdc": _decimal_to_decimal128(amount),
                "funded_at": _utc_now(),
                "transaction_hash": aave_result["transaction_hash"],
            }

            # Update proposal document
            update_data = {
                "$set": {
                    "budget_raised": _decimal_to_decimal128(new_budget_raised),
                    "updated_at": _utc_now(),
                    "aave_pool_address": aave_result.get("aave_pool_address"),
                },
                "$push": {
                    "funders": funder_record
                }
            }

            await self.db.research_proposals.update_one(
                {"proposal_id": proposal_id},
                update_data
            )

            logger.info(f"Proposal {proposal_id} funding updated: {new_budget_raised} USDC raised")

            # Create PaymentDocument
            payment_id = str(uuid.uuid4())
            payment_doc = PaymentDocument(
                payment_id=payment_id,
                type="research_funding",
                from_wallet=funder_wallet,
                to_wallet=proposal_doc["researcher_wallet"],
                amount=_decimal_to_decimal128(amount),
                currency="USDC",
                status="confirmed",
                proposal_id=proposal_id,
                transaction_hash=aave_result["transaction_hash"],
                basescan_url=aave_result.get("basescan_url"),
                created_at=_utc_now(),
                completed_at=_utc_now(),
            )

            await self.db.payments.insert_one(payment_doc.model_dump())
            await record_settled_quietly(
                self.ledger,
                idempotency_key=f"proposal_funding:{proposal_id}:{aave_result['transaction_hash']}",
                rail=PaymentRail.ONCHAIN,
                purpose=PaymentPurpose.PROPOSAL_FUNDING,
                amount=amount,
                chain_id=chain_id_of(agentkit_service),
                payer_ref=funder_wallet,
                payee_ref=aave_result.get("aave_pool_address"),
                proposal_id=proposal_id,
                external_ref=aave_result["transaction_hash"],
                metadata={"funder_id": funder_id, "funder_type": funder_type},
            )

            # Check if funding threshold reached
            fully_funded = new_budget_raised >= funding_threshold

            if fully_funded and proposal_doc["status"] == "active":
                await self._mark_proposal_funded(proposal_id)
                logger.info(f"Proposal {proposal_id} reached funding threshold!")

            # Notify about funding
            from services.notification_service import NotificationService
            notification_service = self._notification_service or NotificationService()

            await notification_service.notify_proposal_funded(
                proposal_id=proposal_id,
                funder_name=funder_id,
                amount=float(amount),
                total_raised=float(new_budget_raised),
                fully_funded=fully_funded
            )

            funding_percentage = (new_budget_raised / _decimal128_to_decimal(proposal_doc["budget_required"])) * 100

            return {
                "proposal_id": proposal_id,
                "funder_id": funder_id,
                "amount": amount,
                "transaction_hash": aave_result["transaction_hash"],
                "new_total_raised": new_budget_raised,
                "funding_percentage": float(funding_percentage),
                "fully_funded": fully_funded,
                "timestamp": _utc_now(),
            }

        except Exception as e:
            logger.error(f"Failed to fund proposal: {e}")
            raise

    async def claim_fragment(
        self,
        proposal_id: str,
        fragment_id: str,
        researcher_id: str
    ) -> dict:
        """
        Claim a research fragment for execution.

        Args:
            proposal_id: Proposal containing the fragment
            fragment_id: Fragment to claim
            researcher_id: Researcher claiming the fragment

        Returns:
            dict: Claim result containing:
                - proposal_id: Parent proposal
                - fragment_id: Claimed fragment
                - researcher_id: Researcher assigned
                - fragment_title: Fragment title
                - fragment_budget: Allocated budget
                - claimed_at: Claim timestamp

        Raises:
            ValueError: If proposal, fragment, or researcher not found
            Exception: If claim operation fails
        """
        logger.info(f"Researcher {researcher_id} claiming fragment {fragment_id} from proposal {proposal_id}")
        try:
            # Get proposal from MongoDB
            proposal_doc = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
            if not proposal_doc:
                raise ValueError(f"Proposal not found: {proposal_id}")

            # Validate proposal is funded
            if proposal_doc["status"] not in ["funded", "in_progress"]:
                raise ValueError(f"Proposal must be funded before claiming fragments (status: {proposal_doc['status']})")

            # Find fragment by fragment_id
            fragments = proposal_doc.get("fragments", [])
            fragment = None
            fragment_index = None

            for idx, frag in enumerate(fragments):
                if frag.get("fragment_id") == fragment_id:
                    fragment = frag
                    fragment_index = idx
                    break

            if not fragment:
                raise ValueError(f"Fragment not found: {fragment_id}")

            # Check if fragment already claimed
            if fragment.get("status") == "claimed":
                raise ValueError(f"Fragment already claimed by {fragment.get('claimed_by')}")

            if fragment.get("status") == "completed":
                raise ValueError("Fragment already completed")

            # Update fragment status
            fragment["status"] = "claimed"
            fragment["claimed_by"] = researcher_id
            fragment["claimed_at"] = _utc_now()

            # Update in MongoDB
            fragments[fragment_index] = fragment

            await self.db.research_proposals.update_one(
                {"proposal_id": proposal_id},
                {
                    "$set": {
                        "fragments": fragments,
                        "status": "in_progress",
                        "updated_at": _utc_now(),
                    }
                }
            )

            logger.info(f"Fragment {fragment_id} claimed by researcher {researcher_id}")

            # Notify fragment claimed
            from services.notification_service import NotificationService
            notification_service = self._notification_service or NotificationService()

            await notification_service.notify_fragment_claimed(
                proposal_id=proposal_id,
                fragment_id=fragment_id,
                researcher_id=researcher_id,
                fragment_title=fragment.get("title", "Unknown Fragment")
            )

            return {
                "proposal_id": proposal_id,
                "fragment_id": fragment_id,
                "researcher_id": researcher_id,
                "fragment_title": fragment.get("title"),
                "fragment_budget": fragment.get("budget"),
                "claimed_at": fragment["claimed_at"],
            }

        except Exception as e:
            logger.error(f"Failed to claim fragment: {e}")
            raise

    async def submit_results(
        self,
        proposal_id: str,
        researcher_id: str,
        results_data: dict,
        fragment_id: Optional[str] = None
    ) -> dict:
        """
        Submit research results and trigger payment release.

        Args:
            proposal_id: Proposal to submit results for
            researcher_id: Researcher submitting results
            results_data: Research results and findings
            fragment_id: Specific fragment (if submitting fragment results)

        Returns:
            dict: Submission result containing:
                - proposal_id: Parent proposal
                - fragment_id: Fragment (if applicable)
                - ipfs_hash: IPFS content identifier
                - ipfs_url: Public IPFS gateway URL
                - payment_released: Whether payment was released
                - payment_amount: Amount released
                - transaction_hash: Payment transaction hash
                - submitted_at: Submission timestamp

        Raises:
            ValueError: If proposal/fragment not found or researcher unauthorized
            Exception: If submission or payment release fails
        """
        logger.info(f"Researcher {researcher_id} submitting results for proposal {proposal_id}")
        try:
            # Get proposal from MongoDB
            proposal_doc = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
            if not proposal_doc:
                raise ValueError(f"Proposal not found: {proposal_id}")

            # Verify researcher is authorized
            if proposal_doc["researcher_id"] != researcher_id and not fragment_id:
                raise ValueError(f"Researcher {researcher_id} not authorized for proposal {proposal_id}")

            # Import IPFS service
            from utils.ipfs import get_ipfs_service
            ipfs_service = get_ipfs_service()

            # Upload results to IPFS
            logger.info("Uploading results to IPFS")
            ipfs_result = await ipfs_service.upload_research_results(results_data)

            ipfs_hash = ipfs_result["cid"]
            ipfs_url = ipfs_result["url"]

            logger.info(f"Results uploaded to IPFS: {ipfs_hash}")

            payment_released = False
            payment_amount = Decimal("0")
            transaction_hash = None

            if fragment_id:
                # Submitting fragment results
                fragments = proposal_doc.get("fragments", [])
                fragment = None
                fragment_index = None

                for idx, frag in enumerate(fragments):
                    if frag.get("fragment_id") == fragment_id:
                        fragment = frag
                        fragment_index = idx
                        break

                if not fragment:
                    raise ValueError(f"Fragment not found: {fragment_id}")

                # Verify researcher claimed this fragment
                if fragment.get("claimed_by") != researcher_id:
                    raise ValueError(f"Researcher {researcher_id} did not claim fragment {fragment_id}")

                # Update fragment
                fragment["status"] = "completed"
                fragment["results_ipfs_hash"] = ipfs_hash
                fragment["completed_at"] = _utc_now()
                fragments[fragment_index] = fragment

                await self.db.research_proposals.update_one(
                    {"proposal_id": proposal_id},
                    {
                        "$set": {
                            "fragments": fragments,
                            "updated_at": _utc_now(),
                        }
                    }
                )

                # Pay researcher for fragment
                payment_result = await self._pay_fragment_researcher(proposal_id, fragment_id)
                payment_released = True
                payment_amount = payment_result["amount"]
                transaction_hash = payment_result["transaction_hash"]

                logger.info(f"Fragment {fragment_id} completed, paid {payment_amount} USDC to researcher")

            else:
                # Submitting full proposal results
                await self.db.research_proposals.update_one(
                    {"proposal_id": proposal_id},
                    {
                        "$set": {
                            "status": "completed",
                            "results_ipfs_hash": ipfs_hash,
                            "updated_at": _utc_now(),
                        }
                    }
                )

                # Release all escrow to researcher
                payment_result = await self._release_all_escrow(proposal_id)
                payment_released = True
                payment_amount = payment_result["amount"]
                transaction_hash = payment_result["transaction_hash"]

                logger.info(f"Proposal {proposal_id} completed, paid {payment_amount} USDC to researcher")

            # Notify results published
            from services.notification_service import NotificationService
            notification_service = self._notification_service or NotificationService()

            await notification_service.notify_results_published(
                proposal_id=proposal_id,
                researcher_id=researcher_id,
                ipfs_url=ipfs_url
            )

            return {
                "proposal_id": proposal_id,
                "fragment_id": fragment_id,
                "ipfs_hash": ipfs_hash,
                "ipfs_url": ipfs_url,
                "payment_released": payment_released,
                "payment_amount": payment_amount,
                "transaction_hash": transaction_hash,
                "submitted_at": _utc_now(),
            }

        except Exception as e:
            logger.error(f"Failed to submit results: {e}")
            raise

    async def _auto_fragment_proposal(
        self,
        title: str,
        description: str,
        methodology: str,
        budget: Decimal,
        timeline: str,
        tags: list[str]
    ) -> list[dict]:
        """
        Auto-fragment proposal using Claude 3.5 Sonnet via AWS Bedrock.

        Uses AI to break down a large research proposal into 3-5 independent
        sub-experiments that can be executed in parallel by different researchers.

        Args:
            title: Proposal title
            description: Proposal description
            methodology: Research methodology
            budget: Total budget
            timeline: Expected timeline
            tags: Research tags

        Returns:
            list[dict]: Fragment definitions with structure:
                - fragment_id: Unique identifier
                - title: Fragment title
                - budget: Allocated budget
                - methodology: Fragment-specific methodology
                - deliverables: Expected outputs
                - expected_duration_days: Time estimate
                - success_criteria: Success metrics
                - status: "available"

        Raises:
            Exception: If AI fragmentation fails
        """
        logger.info(f"Auto-fragmenting proposal: {title}")
        try:
            if not self.bedrock:
                raise Exception("AWS Bedrock client not initialized")

            # Load prompt template
            prompt_path = os.path.join(self.prompts_dir, "auto_fragmentation.txt")
            with open(prompt_path, "r") as f:
                prompt_template = f.read()

            # Prepare template variables
            template_vars = {
                "title": title,
                "description": description,
                "methodology": methodology,
                "budget": float(budget),
                "timeline": timeline,
                "tags": ", ".join(tags),
            }

            # Replace template variables
            prompt = prompt_template
            for key, value in template_vars.items():
                prompt = prompt.replace(f"{{{key}}}", str(value))

            logger.info("Sending fragmentation request to Claude via Bedrock")

            # Call Claude 3.5 Sonnet
            response = await self._call_bedrock(prompt)

            logger.info("Received fragmentation response from Claude")

            # Parse JSON response
            fragmentation_result = self._parse_fragmentation_response(response)

            # Validate budget allocation
            fragments = fragmentation_result.get("fragments", [])
            total_allocated = sum(Decimal(str(f["budget"])) for f in fragments)

            if abs(total_allocated - budget) > Decimal("0.01"):
                logger.warning(
                    f"Budget mismatch: allocated {total_allocated}, required {budget}. Adjusting..."
                )
                # Proportionally adjust fragment budgets
                adjustment_ratio = budget / total_allocated
                for fragment in fragments:
                    fragment["budget"] = float(Decimal(str(fragment["budget"])) * adjustment_ratio)

            # Add fragment metadata
            for fragment in fragments:
                fragment["fragment_id"] = str(uuid.uuid4())
                fragment["status"] = "available"
                fragment["claimed_by"] = None
                fragment["claimed_at"] = None
                fragment["completed_at"] = None
                fragment["results_ipfs_hash"] = None

            logger.info(f"Successfully fragmented proposal into {len(fragments)} fragments")

            return fragments

        except Exception as e:
            logger.error(f"Failed to auto-fragment proposal: {e}")
            raise

    async def _broadcast_new_proposal(self, proposal: dict) -> dict:
        """
        Broadcast new proposal to AI agents for analysis.

        Args:
            proposal: Proposal data to broadcast

        Returns:
            dict: Broadcast confirmation

        Raises:
            Exception: If broadcast fails
        """
        logger.info(f"Broadcasting proposal {proposal['proposal_id']} to AI agents")
        try:
            from services.ai_agent_service import AIAgentService

            if self._ai_agent_service is None:
                self._ai_agent_service = AIAgentService(agentkit_service=self.agentkit)
            ai_agent_service = self._ai_agent_service

            # Get all active agents with auto_fund enabled
            agent_docs = await self.db.ai_agents.find({"config.auto_fund": True}).to_list(None)

            logger.info(f"Found {len(agent_docs)} active agents for proposal analysis")

            # Trigger analysis for each agent (fire and forget)
            for agent_doc in agent_docs:
                try:
                    # Don't await - let agents analyze asynchronously
                    import asyncio
                    asyncio.create_task(
                        ai_agent_service.analyze_proposal(
                            agent_id=agent_doc["agent_id"],
                            proposal=proposal
                        )
                    )
                except Exception as agent_error:
                    logger.warning(f"Failed to trigger agent {agent_doc['agent_id']}: {agent_error}")

            return {
                "proposal_id": proposal["proposal_id"],
                "agents_notified": len(agent_docs),
                "timestamp": _utc_now(),
            }

        except Exception as e:
            logger.error(f"Failed to broadcast proposal: {e}")
            raise

    async def _pay_fragment_researcher(
        self,
        proposal_id: str,
        fragment_id: str
    ) -> dict:
        """
        Release payment to fragment researcher from Aave escrow.

        Args:
            proposal_id: Parent proposal
            fragment_id: Completed fragment

        Returns:
            dict: Payment result with transaction hash and amount

        Raises:
            ValueError: If proposal or fragment not found
            Exception: If payment release fails
        """
        logger.info(f"Releasing payment for fragment {fragment_id}")
        try:
            # Get proposal
            proposal_doc = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
            if not proposal_doc:
                raise ValueError(f"Proposal not found: {proposal_id}")

            # Find fragment
            fragment = None
            for frag in proposal_doc.get("fragments", []):
                if frag.get("fragment_id") == fragment_id:
                    fragment = frag
                    break

            if not fragment:
                raise ValueError(f"Fragment not found: {fragment_id}")

            # Get fragment budget
            fragment_budget = Decimal(str(fragment["budget"]))

            # Get researcher wallet
            researcher_id = fragment["claimed_by"]
            researcher_wallet_doc = await self.db.wallets.find_one({"entity_id": researcher_id})
            if not researcher_wallet_doc:
                raise ValueError(f"Researcher wallet not found for {researcher_id}")

            researcher_wallet = researcher_wallet_doc["default_address"]

            agentkit_service = self.agentkit

            # One payout per fragment: refuses to pay again while an earlier
            # attempt is pending, paid or uncertain
            payout_key = await begin_payout(
                self.ledger,
                f"fragment_payout:{proposal_id}:{fragment_id}",
                purpose=PaymentPurpose.WORKER_PAYOUT,
                amount=fragment_budget,
                chain_id=chain_id_of(agentkit_service),
                payer_ref=proposal_doc["researcher_wallet"],
                payee_ref=researcher_wallet,
                proposal_id=proposal_id,
                metadata={"fragment_id": fragment_id, "researcher_id": researcher_id},
            )

            # Withdraw from Aave escrow
            logger.info(f"Withdrawing {fragment_budget} USDC from Aave escrow")

            try:
                withdraw_result = await agentkit_service.aave_withdraw(
                    wallet_address=proposal_doc["researcher_wallet"],
                    amount=fragment_budget,
                    to=researcher_wallet
                )
            except Exception as withdraw_error:
                await settle_failed_send(self.ledger, payout_key, withdraw_error)
                raise

            logger.info(f"Payment released: {withdraw_result['transaction_hash']}")
            await confirm_quietly(self.ledger, payout_key, withdraw_result["transaction_hash"])

            # Record payment
            payment_id = str(uuid.uuid4())
            payment_doc = PaymentDocument(
                payment_id=payment_id,
                type="escrow_release",
                from_wallet=proposal_doc["researcher_wallet"],
                to_wallet=researcher_wallet,
                amount=_decimal_to_decimal128(fragment_budget),
                currency="USDC",
                status="confirmed",
                proposal_id=proposal_id,
                transaction_hash=withdraw_result["transaction_hash"],
                basescan_url=withdraw_result.get("basescan_url"),
                created_at=_utc_now(),
                completed_at=_utc_now(),
            )

            await self.db.payments.insert_one(payment_doc.model_dump())

            return {
                "amount": fragment_budget,
                "transaction_hash": withdraw_result["transaction_hash"],
                "researcher_wallet": researcher_wallet,
                "timestamp": _utc_now(),
            }

        except Exception as e:
            logger.error(f"Failed to pay fragment researcher: {e}")
            raise

    async def _release_all_escrow(self, proposal_id: str) -> dict:
        """
        Release all escrow funds to proposal researcher.

        Args:
            proposal_id: Proposal to release funds for

        Returns:
            dict: Payment result with transaction hash and amount

        Raises:
            ValueError: If proposal not found
            Exception: If escrow release fails
        """
        logger.info(f"Releasing all escrow for proposal {proposal_id}")
        try:
            # Get proposal
            proposal_doc = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
            if not proposal_doc:
                raise ValueError(f"Proposal not found: {proposal_id}")

            # Get total raised
            total_raised = _decimal128_to_decimal(proposal_doc["budget_raised"])

            agentkit_service = self.agentkit

            # One full release per proposal
            release_key = await begin_payout(
                self.ledger,
                f"escrow_release:{proposal_id}",
                purpose=PaymentPurpose.ESCROW_RELEASE,
                amount=total_raised,
                chain_id=chain_id_of(agentkit_service),
                payer_ref=proposal_doc["researcher_wallet"],
                payee_ref=proposal_doc["researcher_wallet"],
                proposal_id=proposal_id,
            )

            # Withdraw all from Aave escrow
            logger.info(f"Withdrawing {total_raised} USDC from Aave escrow")

            try:
                withdraw_result = await agentkit_service.aave_withdraw(
                    wallet_address=proposal_doc["researcher_wallet"],
                    amount=total_raised,
                    to=proposal_doc["researcher_wallet"]
                )
            except Exception as withdraw_error:
                await settle_failed_send(self.ledger, release_key, withdraw_error)
                raise

            logger.info(f"Full escrow released: {withdraw_result['transaction_hash']}")
            await confirm_quietly(self.ledger, release_key, withdraw_result["transaction_hash"])

            # Record payment
            payment_id = str(uuid.uuid4())
            payment_doc = PaymentDocument(
                payment_id=payment_id,
                type="escrow_release",
                from_wallet=proposal_doc["researcher_wallet"],
                to_wallet=proposal_doc["researcher_wallet"],
                amount=_decimal_to_decimal128(total_raised),
                currency="USDC",
                status="confirmed",
                proposal_id=proposal_id,
                transaction_hash=withdraw_result["transaction_hash"],
                basescan_url=withdraw_result.get("basescan_url"),
                created_at=_utc_now(),
                completed_at=_utc_now(),
            )

            await self.db.payments.insert_one(payment_doc.model_dump())

            return {
                "amount": total_raised,
                "transaction_hash": withdraw_result["transaction_hash"],
                "researcher_wallet": proposal_doc["researcher_wallet"],
                "timestamp": _utc_now(),
            }

        except Exception as e:
            logger.error(f"Failed to release escrow: {e}")
            raise

    async def _mark_proposal_funded(self, proposal_id: str) -> None:
        """
        Mark proposal as funded when threshold is reached.

        Args:
            proposal_id: Proposal to mark as funded

        Raises:
            Exception: If update fails
        """
        logger.info(f"Marking proposal {proposal_id} as funded")
        try:
            await self.db.research_proposals.update_one(
                {"proposal_id": proposal_id},
                {
                    "$set": {
                        "status": "funded",
                        "updated_at": _utc_now(),
                    }
                }
            )
        except Exception as e:
            logger.error(f"Failed to mark proposal as funded: {e}")
            raise

    async def _call_bedrock(self, prompt: str) -> str:
        """
        Call Claude 3.5 Sonnet via AWS Bedrock.

        Args:
            prompt: Prompt to send to Claude

        Returns:
            str: Raw text response from Claude

        Raises:
            Exception: If Bedrock API call fails
        """
        if not self.bedrock:
            raise Exception("AWS Bedrock client not initialized")

        try:
            response = self.bedrock.invoke_model(
                modelId=self.bedrock_model_id,
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 2048,
                    "messages": [{"role": "user", "content": prompt}]
                })
            )

            response_body = json.loads(response["body"].read())
            result = response_body["content"][0]["text"]
            return result

        except ClientError as e:
            logger.error(f"AWS Bedrock API error: {e}")
            raise Exception(f"Failed to call Bedrock API: {e}")
        except Exception as e:
            logger.error(f"Unexpected error calling Bedrock: {e}")
            raise

    def _parse_fragmentation_response(self, response: str) -> dict:
        """
        Parse Claude's fragmentation response.

        Args:
            response: Raw JSON response from Claude

        Returns:
            dict: Parsed fragmentation result with fragments array

        Raises:
            ValueError: If response is not valid JSON or missing required fields
        """
        try:
            # Try to parse JSON directly
            result = json.loads(response)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            if "```json" in response:
                json_start = response.find("```json") + 7
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                result = json.loads(json_str)
            elif "```" in response:
                json_start = response.find("```") + 3
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                result = json.loads(json_str)
            else:
                raise ValueError(f"Response is not valid JSON: {response}")

        # Validate required fields
        if "fragments" not in result:
            raise ValueError("Missing 'fragments' field in response")

        fragments = result["fragments"]
        if not isinstance(fragments, list) or len(fragments) < 3 or len(fragments) > 5:
            raise ValueError(f"Fragments must be a list of 3-5 elements, got {len(fragments)}")

        # Validate each fragment has required fields
        required_fields = ["title", "budget", "methodology", "deliverables", "success_criteria"]
        for fragment in fragments:
            for field in required_fields:
                if field not in fragment:
                    raise ValueError(f"Fragment missing required field: {field}")

        return result

    # =========================================================================
    # Quadratic Funding Rounds (Issue #17)
    # =========================================================================

    @staticmethod
    def compute_quadratic_matching(
        matching_pool: Decimal | str | float | int,
        proposals: list[dict[str, Any]],
        min_contribution: Decimal | str | float | int = Decimal("1"),
        per_donor_cap: Decimal | str | float | int = Decimal("1000"),
        per_proposal_cap: Optional[Decimal | str | float | int] = None,
        start_time: Optional[datetime | str] = None,
        end_time: Optional[datetime | str] = None,
        identity_verifier: Optional[Callable[[str, str], bool]] = None,
    ) -> dict[str, Any]:
        """
        Deterministically compute Quadratic Funding (QF) matching allocations.

        Applies Gitcoin/Buterin standard quadratic funding with strict sybil
        and budget-bound guarantees:
        1. Self-funding exclusion: contributions where funder_id == researcher_id
           or wallet_address matches researcher_wallet are ignored.
        2. Duplicate-account / sybil resistance: contributions are aggregated per
           canonical donor identity (linking funder_id and normalized wallet_address
           into connected donor clusters so splitting funds across multiple
           transactions or duplicate accounts sharing a wallet/funder cannot
           increase the sum of square roots).
        3. Pluggable external identity verifier: if provided, donors failing
           `identity_verifier(funder_id, wallet_address)` are excluded.
        4. Minimum contribution & per-donor cap: aggregated donor contributions
           below `min_contribution` are excluded; contributions above
           `per_donor_cap` are capped at `per_donor_cap`.
        5. Quadratic weight: W_p = (sum_{d in D_p} sqrt(c_{d,p}))^2.
        6. Budget bound & per-proposal cap: allocations are scaled so the sum
           never exceeds `matching_pool` (with deterministic ROUND_DOWN to 6
           decimals, USDC micro-units) and each proposal's match never exceeds
           `per_proposal_cap`.
        """
        pool = Decimal(str(matching_pool))
        if pool < Decimal("0"):
            raise ValueError("matching_pool must be non-negative")

        min_contrib = Decimal(str(min_contribution))
        donor_cap = Decimal(str(per_donor_cap))
        if min_contrib < Decimal("0") or donor_cap <= Decimal("0"):
            raise ValueError("Invalid contribution bounds")

        prop_cap: Optional[Decimal] = (
            Decimal(str(per_proposal_cap)) if per_proposal_cap is not None else None
        )
        if prop_cap is not None and prop_cap < Decimal("0"):
            raise ValueError("per_proposal_cap must be non-negative")

        def _parse_ts(ts: Any) -> Optional[datetime]:
            if ts is None:
                return None
            if isinstance(ts, datetime):
                return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
            if isinstance(ts, str):
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            return None

        round_start = _parse_ts(start_time)
        round_end = _parse_ts(end_time)

        # Build global sybil cluster map: unify any funder_id and wallet_address
        # that appear together so a single wallet using multiple funder_ids (or
        # vice versa) collapses to one canonical donor key across the round.
        parent: dict[str, str] = {}

        def _find(x: str) -> str:
            while parent.get(x, x) != x:
                parent[x] = parent.get(parent[x], parent[x])
                x = parent[x]
            return x

        def _union(a: str, b: str) -> None:
            ra, rb = _find(a), _find(b)
            if ra != rb:
                # Deterministic lexicographical root
                if ra < rb:
                    parent[rb] = ra
                else:
                    parent[ra] = rb

        sorted_proposals = sorted(proposals, key=lambda p: str(p.get("proposal_id", "")))

        for prop in sorted_proposals:
            for c in prop.get("contributions", prop.get("funders", [])):
                fid = str(c.get("funder_id", "")).strip()
                waddr = str(c.get("wallet_address", "")).strip().lower()
                if fid and waddr:
                    _union(f"id:{fid}", f"wallet:{waddr}")

        proposal_weights: dict[str, Decimal] = {}
        proposal_stats: dict[str, dict[str, Any]] = {}
        published_proposal_inputs: list[dict[str, Any]] = []

        quant = Decimal("0.000001")

        for prop in sorted_proposals:
            pid = str(prop["proposal_id"])
            researcher_id = str(prop.get("researcher_id", "")).strip()
            researcher_wallet = str(prop.get("researcher_wallet", "")).strip().lower()
            raw_contribs = prop.get("contributions", prop.get("funders", []))

            donor_totals: dict[str, Decimal] = {}
            excluded_self = int(prop.get("_excluded_self_funding_count", 0))
            excluded_unverified = int(prop.get("_excluded_unverified_count", 0))
            excluded_window = int(prop.get("_excluded_outside_window_count", 0))

            for c in raw_contribs:
                fid = str(c.get("funder_id", "")).strip()
                waddr = str(c.get("wallet_address", "")).strip().lower()
                raw_amt = c.get("amount_usdc", c.get("amount", "0"))
                if hasattr(raw_amt, "to_decimal"):
                    amt = raw_amt.to_decimal()
                else:
                    amt = Decimal(str(raw_amt))

                if amt <= Decimal("0"):
                    continue

                funded_at = _parse_ts(c.get("funded_at"))
                if round_start and funded_at and funded_at < round_start:
                    excluded_window += 1
                    continue
                if round_end and funded_at and funded_at > round_end:
                    excluded_window += 1
                    continue

                # Self-funding check (by researcher_id, wallet, or sybil cluster)
                is_self = False
                if researcher_id and fid == researcher_id:
                    is_self = True
                if researcher_wallet and waddr == researcher_wallet:
                    is_self = True
                if researcher_id and fid and _find(f"id:{fid}") == _find(f"id:{researcher_id}"):
                    is_self = True
                if researcher_wallet and waddr and _find(f"wallet:{waddr}") == _find(f"wallet:{researcher_wallet}"):
                    is_self = True

                if is_self:
                    excluded_self += 1
                    continue

                if identity_verifier is not None and not identity_verifier(fid, waddr):
                    excluded_unverified += 1
                    continue

                donor_key = _find(f"id:{fid}") if fid else _find(f"wallet:{waddr}")
                donor_totals[donor_key] = donor_totals.get(donor_key, Decimal("0")) + amt

            # Apply min_contribution and per_donor_cap deterministically
            eligible_donors: dict[str, Decimal] = {}
            for d_key in sorted(donor_totals.keys()):
                total_d = donor_totals[d_key]
                if total_d < min_contrib:
                    continue
                capped_d = min(total_d, donor_cap)
                eligible_donors[d_key] = capped_d.quantize(quant, rounding=ROUND_DOWN)

            sum_sqrt = Decimal("0")
            direct_total = Decimal("0")
            for d_key, eff_amt in eligible_donors.items():
                sum_sqrt += eff_amt.sqrt()
                direct_total += eff_amt

            weight = (sum_sqrt * sum_sqrt) if eligible_donors else Decimal("0")
            proposal_weights[pid] = weight

            proposal_stats[pid] = {
                "proposal_id": pid,
                "unique_eligible_donors": len(eligible_donors),
                "direct_contributions_usdc": str(direct_total.quantize(quant, rounding=ROUND_DOWN)),
                "quadratic_weight": str(weight.quantize(quant, rounding=ROUND_DOWN)),
                "excluded_self_funding_count": excluded_self,
                "excluded_unverified_count": excluded_unverified,
                "excluded_outside_window_count": excluded_window,
            }

            published_proposal_inputs.append({
                "proposal_id": pid,
                "researcher_id": researcher_id,
                "researcher_wallet": researcher_wallet,
                "eligible_donor_contributions": {
                    k: str(v) for k, v in sorted(eligible_donors.items())
                },
                "excluded_self_funding_count": excluded_self,
                "excluded_unverified_count": excluded_unverified,
                "excluded_outside_window_count": excluded_window,
            })

        total_weight = sum(proposal_weights.values(), Decimal("0"))
        allocations: list[dict[str, Any]] = []
        total_matched = Decimal("0")

        for prop in sorted_proposals:
            pid = str(prop["proposal_id"])
            w = proposal_weights[pid]
            if total_weight > Decimal("0") and pool > Decimal("0") and w > Decimal("0"):
                # Proportional share of matching pool, bounded by raw quadratic weight
                # and optional per-proposal cap so matching never exceeds pool or cap.
                proportional_share = (pool * w) / total_weight
                raw_match = min(proportional_share, w)
                if prop_cap is not None:
                    raw_match = min(raw_match, prop_cap)
                matched = raw_match.quantize(quant, rounding=ROUND_DOWN)
            else:
                matched = Decimal("0.000000")

            total_matched += matched
            stats = proposal_stats[pid]
            direct_dec = Decimal(stats["direct_contributions_usdc"])
            allocations.append({
                **stats,
                "matched_usdc": str(matched),
                "total_funding_usdc": str((direct_dec + matched).quantize(quant, rounding=ROUND_DOWN)),
            })

        computation_inputs = {
            "matching_pool": str(pool.quantize(quant, rounding=ROUND_DOWN)),
            "min_contribution": str(min_contrib.quantize(quant, rounding=ROUND_DOWN)),
            "per_donor_cap": str(donor_cap.quantize(quant, rounding=ROUND_DOWN)),
            "per_proposal_cap": (
                str(prop_cap.quantize(quant, rounding=ROUND_DOWN))
                if prop_cap is not None
                else None
            ),
            "start_time": round_start.isoformat() if round_start else None,
            "end_time": round_end.isoformat() if round_end else None,
            "proposals": published_proposal_inputs,
        }

        canonical_payload = json.dumps(
            {"inputs": computation_inputs, "allocations": allocations},
            sort_keys=True,
            separators=(",", ":"),
        )
        audit_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

        return {
            "matching_pool_usdc": str(pool.quantize(quant, rounding=ROUND_DOWN)),
            "total_matched_usdc": str(total_matched.quantize(quant, rounding=ROUND_DOWN)),
            "unallocated_pool_usdc": str((pool - total_matched).quantize(quant, rounding=ROUND_DOWN)),
            "allocations": allocations,
            "computation_inputs": computation_inputs,
            "audit_hash": audit_hash,
        }

    @classmethod
    def recompute_from_published_inputs(cls, computation_inputs: dict[str, Any]) -> dict[str, Any]:
        """Recompute quadratic funding results strictly from published audit inputs."""
        reconstructed_proposals = []
        for p in computation_inputs.get("proposals", []):
            contribs = [
                {
                    "funder_id": donor_key.split(":", 1)[-1] if donor_key.startswith("id:") else "",
                    "wallet_address": donor_key.split(":", 1)[-1] if donor_key.startswith("wallet:") else "",
                    "amount_usdc": Decimal(amt_str),
                }
                for donor_key, amt_str in sorted(p.get("eligible_donor_contributions", {}).items())
            ]
            reconstructed_proposals.append({
                "proposal_id": p["proposal_id"],
                "researcher_id": p.get("researcher_id", ""),
                "researcher_wallet": p.get("researcher_wallet", ""),
                "contributions": contribs,
                "_excluded_self_funding_count": int(p.get("excluded_self_funding_count", 0)),
                "_excluded_unverified_count": int(p.get("excluded_unverified_count", 0)),
                "_excluded_outside_window_count": int(p.get("excluded_outside_window_count", 0)),
            })

        return cls.compute_quadratic_matching(
            matching_pool=Decimal(str(computation_inputs["matching_pool"])),
            proposals=reconstructed_proposals,
            min_contribution=Decimal(str(computation_inputs["min_contribution"])),
            per_donor_cap=Decimal(str(computation_inputs["per_donor_cap"])),
            per_proposal_cap=(
                Decimal(str(computation_inputs["per_proposal_cap"]))
                if computation_inputs.get("per_proposal_cap") is not None
                else None
            ),
            start_time=computation_inputs.get("start_time"),
            end_time=computation_inputs.get("end_time"),
        )

    async def create_funding_round(
        self,
        title: str,
        matching_pool: Decimal,
        start_time: datetime,
        end_time: datetime,
        eligible_proposal_ids: list[str],
        min_contribution: Decimal = Decimal("1"),
        per_donor_cap: Decimal = Decimal("1000"),
        per_proposal_cap: Optional[Decimal] = None,
        require_verified_identity: bool = False,
        created_by: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a time-boxed quadratic funding round."""
        if matching_pool <= Decimal("0"):
            raise ValueError("matching_pool must be greater than 0")
        if end_time <= start_time:
            raise ValueError("end_time must be after start_time")
        if min_contribution <= Decimal("0") or per_donor_cap <= Decimal("0"):
            raise ValueError("min_contribution and per_donor_cap must be greater than 0")
        if min_contribution > per_donor_cap:
            raise ValueError("min_contribution cannot exceed per_donor_cap")

        round_id = str(uuid.uuid4())
        round_doc = FundingRoundDocument(
            round_id=round_id,
            title=title,
            matching_pool=_decimal_to_decimal128(matching_pool),
            start_time=start_time,
            end_time=end_time,
            eligible_proposal_ids=list(dict.fromkeys(eligible_proposal_ids)),
            min_contribution=_decimal_to_decimal128(min_contribution),
            per_donor_cap=_decimal_to_decimal128(per_donor_cap),
            per_proposal_cap=(
                _decimal_to_decimal128(per_proposal_cap)
                if per_proposal_cap is not None
                else None
            ),
            require_verified_identity=require_verified_identity,
            status="active",
            created_by=created_by,
        )

        if hasattr(self.db, "funding_rounds"):
            await self.db.funding_rounds.insert_one(round_doc.model_dump())

        return {
            "round_id": round_id,
            "title": title,
            "matching_pool": matching_pool,
            "start_time": start_time,
            "end_time": end_time,
            "eligible_proposal_ids": round_doc.eligible_proposal_ids,
            "min_contribution": min_contribution,
            "per_donor_cap": per_donor_cap,
            "per_proposal_cap": per_proposal_cap,
            "require_verified_identity": require_verified_identity,
            "status": "active",
            "created_at": round_doc.created_at,
        }

    async def finalize_funding_round(
        self,
        round_id: str,
        identity_verifier: Optional[Callable[[str, str], bool]] = None,
    ) -> dict[str, Any]:
        """Finalize a quadratic funding round and persist auditable inputs and results."""
        round_doc = await self.db.funding_rounds.find_one({"round_id": round_id})
        if not round_doc:
            raise ValueError(f"Funding round not found: {round_id}")
        if round_doc.get("status") == "cancelled":
            raise ValueError(f"Funding round {round_id} is cancelled")

        proposal_ids = round_doc.get("eligible_proposal_ids", [])
        proposals_data: list[dict[str, Any]] = []
        for pid in proposal_ids:
            pdoc = await self.db.research_proposals.find_one({"proposal_id": pid})
            if pdoc:
                proposals_data.append(pdoc)

        matching_pool = _decimal128_to_decimal(round_doc["matching_pool"])
        min_contrib = _decimal128_to_decimal(round_doc["min_contribution"])
        donor_cap = _decimal128_to_decimal(round_doc["per_donor_cap"])
        prop_cap = (
            _decimal128_to_decimal(round_doc["per_proposal_cap"])
            if round_doc.get("per_proposal_cap") is not None
            else None
        )

        qf_result = self.compute_quadratic_matching(
            matching_pool=matching_pool,
            proposals=proposals_data,
            min_contribution=min_contrib,
            per_donor_cap=donor_cap,
            per_proposal_cap=prop_cap,
            start_time=round_doc.get("start_time"),
            end_time=round_doc.get("end_time"),
            identity_verifier=identity_verifier,
        )

        results_summary = {
            "matching_pool_usdc": qf_result["matching_pool_usdc"],
            "total_matched_usdc": qf_result["total_matched_usdc"],
            "unallocated_pool_usdc": qf_result["unallocated_pool_usdc"],
            "allocations": qf_result["allocations"],
            "audit_hash": qf_result["audit_hash"],
            "finalized_at": _utc_now().isoformat(),
        }

        await self.db.funding_rounds.update_one(
            {"round_id": round_id},
            {
                "$set": {
                    "status": "finalized",
                    "computation_inputs": qf_result["computation_inputs"],
                    "results": results_summary,
                    "updated_at": _utc_now(),
                }
            },
        )

        return {
            "round_id": round_id,
            "status": "finalized",
            **qf_result,
        }

