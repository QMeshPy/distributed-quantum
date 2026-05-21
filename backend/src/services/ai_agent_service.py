"""
AI Agent Service - Autonomous Proposal Funding

This service provides AI-powered autonomous funding for quantum research proposals:
- Agent creation with spending controls and research interests
- Claude 3.5 Sonnet analysis via AWS Bedrock
- Individual proposal analysis and funding decisions
- Coalition formation for collaborative funding
- Spending limit enforcement and budget tracking

AI Model: Claude 3.5 Sonnet via AWS Bedrock
MongoDB: ai_agents collection
"""

from decimal import Decimal
from datetime import datetime, date, timezone
from typing import Any, Optional
import logging
import os
import uuid
import json

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
from db.agentkit_collections import (
    AIAgentDocument,
    ResearchProposalDocument,
    WorkerPricingDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)


class AIAgentService:
    """
    Service for managing autonomous AI research agents with spending controls.

    AI agents can:
    - Analyze research proposals using Claude 3.5 Sonnet
    - Make autonomous funding decisions based on configured criteria
    - Form coalitions with other agents for collaborative funding
    - Track spending history and enforce budget limits
    """

    def __init__(self) -> None:
        """
        Initialize AI Agent service with AWS Bedrock and MongoDB.

        Loads configuration from environment variables:
        - AWS_REGION (default: us-east-1)
        - BEDROCK_MODEL_ID (default: anthropic.claude-3-5-sonnet-20241022-v2:0)
        - MONGODB_URI
        - MONGODB_DATABASE
        """
        logger.info("Initializing AIAgentService")

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

        # Load prompts directory path
        self.prompts_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "prompts"
        )

        logger.info("AIAgentService initialized")

    async def create_agent(
        self,
        owner_id: str,
        agent_name: str,
        config: dict[str, Any]
    ) -> dict:
        """
        Create a new AI agent with spending controls and research interests.

        Args:
            owner_id: User who owns this agent
            agent_name: Human-readable name for the agent
            config: Agent configuration containing:
                - auto_fund (bool): Enable automatic funding
                - max_per_proposal (Decimal): Maximum funding per proposal
                - daily_budget (Decimal): Daily spending limit
                - research_interests (list[str]): Research topics of interest
                - min_reputation_threshold (float): Minimum researcher reputation (0-100)

        Returns:
            dict: Agent information containing:
                - agent_id: Unique agent identifier
                - owner_id: Owner user ID
                - agent_name: Agent name
                - wallet_address: Agent's crypto wallet address
                - config: Agent configuration
                - created_at: Creation timestamp

        Raises:
            ValueError: If config is invalid
            Exception: If agent creation fails
        """
        logger.info(f"Creating AI agent '{agent_name}' for owner {owner_id}")
        try:
            # Validate config
            required_keys = [
                "auto_fund",
                "max_per_proposal",
                "daily_budget",
                "research_interests",
                "min_reputation_threshold"
            ]
            for key in required_keys:
                if key not in config:
                    raise ValueError(f"Missing required config key: {key}")

            # Validate types
            if not isinstance(config["auto_fund"], bool):
                raise ValueError("auto_fund must be boolean")
            if not isinstance(config["research_interests"], list):
                raise ValueError("research_interests must be a list")
            if not (0 <= config["min_reputation_threshold"] <= 100):
                raise ValueError("min_reputation_threshold must be between 0 and 100")

            # Convert Decimal types if needed
            if isinstance(config["max_per_proposal"], (int, float, str)):
                config["max_per_proposal"] = Decimal(str(config["max_per_proposal"]))
            if isinstance(config["daily_budget"], (int, float, str)):
                config["daily_budget"] = Decimal(str(config["daily_budget"]))

            # Import AgentKitService here to avoid circular imports
            from services.agentkit_service import AgentKitService

            # Create wallet for agent
            agentkit_service = AgentKitService()
            agent_id = str(uuid.uuid4())
            wallet_info = await agentkit_service.create_wallet(
                entity_id=agent_id,
                entity_type="agent"
            )

            logger.info(f"Created wallet {wallet_info['wallet_address']} for agent {agent_id}")

            # Convert config Decimals to Decimal128 for MongoDB
            config_mongo = config.copy()
            config_mongo["max_per_proposal"] = _decimal_to_decimal128(config["max_per_proposal"])
            config_mongo["daily_budget"] = _decimal_to_decimal128(config["daily_budget"])

            # Create AIAgentDocument
            agent_doc = AIAgentDocument(
                agent_id=agent_id,
                owner_id=owner_id,
                agent_name=agent_name,
                wallet_id=wallet_info["wallet_address"][:8],
                wallet_address=wallet_info["wallet_address"],
                config=config_mongo,
                spending_history=[],
                total_spent=_decimal_to_decimal128(Decimal("0")),
            )

            # Save to MongoDB
            await self.db.ai_agents.insert_one(agent_doc.model_dump())

            logger.info(f"AI agent {agent_id} created successfully")

            return {
                "agent_id": agent_id,
                "owner_id": owner_id,
                "agent_name": agent_name,
                "wallet_address": wallet_info["wallet_address"],
                "config": config,
                "created_at": agent_doc.created_at,
            }

        except Exception as e:
            logger.error(f"Failed to create AI agent: {e}")
            raise

    async def analyze_proposal(
        self,
        agent_id: str,
        proposal: dict
    ) -> dict:
        """
        Analyze a research proposal and make funding decision.

        Uses Claude 3.5 Sonnet via AWS Bedrock to analyze the proposal against
        agent's research interests, budget constraints, and reputation thresholds.

        Args:
            agent_id: Agent performing the analysis
            proposal: Proposal data containing:
                - proposal_id: Unique identifier
                - title: Proposal title
                - description: Detailed description
                - methodology: Research methodology
                - budget_required: Total funding needed
                - researcher_id: Researcher identifier
                - tags: Research categories
                - expected_timeline: Timeline (optional)

        Returns:
            dict: Funding decision containing:
                - agent_id: Agent that made decision
                - proposal_id: Analyzed proposal
                - should_fund: Whether to fund
                - funding_amount: Amount to contribute (Decimal)
                - confidence: Confidence level (0-100)
                - reasoning: AI reasoning for decision
                - timestamp: Decision timestamp

        Raises:
            ValueError: If agent or proposal not found
            Exception: If analysis or funding execution fails
        """
        logger.info(f"Agent {agent_id} analyzing proposal {proposal.get('proposal_id')}")
        try:
            # Load agent from MongoDB
            agent_doc = await self.db.ai_agents.find_one({"agent_id": agent_id})
            if not agent_doc:
                raise ValueError(f"Agent not found: {agent_id}")

            # Load researcher reputation
            researcher_id = proposal.get("researcher_id")
            researcher_doc = await self.db.worker_pricing.find_one({"worker_id": researcher_id})
            researcher_reputation = researcher_doc["reputation_score"] if researcher_doc else 0.0

            # Get daily remaining budget
            daily_remaining = await self._get_daily_remaining(agent_id)

            # Extract config values
            config = agent_doc["config"]
            max_per_proposal = _decimal128_to_decimal(config["max_per_proposal"])
            daily_budget = _decimal128_to_decimal(config["daily_budget"])
            research_interests = config["research_interests"]
            min_reputation = config["min_reputation_threshold"]
            total_spent = _decimal128_to_decimal(agent_doc["total_spent"])

            # Load prompt template
            prompt_path = os.path.join(self.prompts_dir, "proposal_analysis.txt")
            with open(prompt_path, "r") as f:
                prompt_template = f.read()

            # Prepare template variables
            budget_required = proposal.get("budget_required", 0)
            if hasattr(budget_required, "to_decimal"):
                budget_required = float(budget_required.to_decimal())

            template_vars = {
                "title": proposal.get("title", ""),
                "description": proposal.get("description", ""),
                "methodology": proposal.get("methodology", ""),
                "budget_required": budget_required,
                "researcher_id": researcher_id,
                "researcher_reputation": researcher_reputation,
                "tags": ", ".join(proposal.get("tags", [])),
                "expected_timeline": proposal.get("expected_timeline", "Not specified"),
                "agent_name": agent_doc["agent_name"],
                "research_interests": ", ".join(research_interests),
                "max_per_proposal": float(max_per_proposal),
                "daily_remaining": float(daily_remaining),
                "total_spent": float(total_spent),
                "min_reputation": min_reputation,
            }

            # Replace template variables
            prompt = prompt_template
            for key, value in template_vars.items():
                prompt = prompt.replace(f"{{{key}}}", str(value))

            logger.info(f"Sending proposal analysis request to Claude via Bedrock")

            # Call Claude 3.5 Sonnet via AWS Bedrock
            response = await self._call_bedrock(prompt)

            logger.info(f"Received analysis response from Claude")

            # Parse JSON response
            decision = self._parse_decision_response(response)

            # Validate decision
            if decision["should_fund"]:
                # Enforce reputation threshold
                if researcher_reputation < min_reputation:
                    logger.warning(
                        f"Researcher reputation ({researcher_reputation}) below threshold ({min_reputation})"
                    )
                    decision["should_fund"] = False
                    decision["funding_amount"] = 0.0
                    decision["reasoning"] = (
                        f"Overridden: Researcher reputation ({researcher_reputation}) "
                        f"below minimum threshold ({min_reputation}). " + decision["reasoning"]
                    )

                # Enforce spending limits
                funding_amount = Decimal(str(decision["funding_amount"]))
                if funding_amount > max_per_proposal:
                    logger.warning(
                        f"Funding amount ({funding_amount}) exceeds max per proposal ({max_per_proposal})"
                    )
                    funding_amount = max_per_proposal
                    decision["funding_amount"] = float(max_per_proposal)

                if funding_amount > daily_remaining:
                    logger.warning(
                        f"Funding amount ({funding_amount}) exceeds daily remaining ({daily_remaining})"
                    )
                    funding_amount = daily_remaining
                    decision["funding_amount"] = float(daily_remaining)

                # Execute funding if auto_fund is enabled
                if config["auto_fund"] and funding_amount > 0:
                    try:
                        await self._execute_funding(
                            agent_id=agent_id,
                            proposal_id=proposal["proposal_id"],
                            amount=funding_amount
                        )
                        logger.info(
                            f"Agent {agent_id} funded proposal {proposal['proposal_id']} "
                            f"with {funding_amount} USDC"
                        )
                    except Exception as funding_error:
                        logger.error(f"Failed to execute funding: {funding_error}")
                        decision["error"] = str(funding_error)
                        decision["should_fund"] = False
                        decision["funding_amount"] = 0.0

            # Return decision
            return {
                "agent_id": agent_id,
                "proposal_id": proposal["proposal_id"],
                "should_fund": decision["should_fund"],
                "funding_amount": Decimal(str(decision["funding_amount"])),
                "confidence": decision["confidence"],
                "reasoning": decision["reasoning"],
                "timestamp": datetime.now(timezone.utc),
            }

        except Exception as e:
            logger.error(f"Failed to analyze proposal: {e}")
            raise

    async def form_coalition(
        self,
        proposal_id: str,
        agent_ids: list[str]
    ) -> dict:
        """
        Form a coalition of agents to collaboratively fund a proposal.

        Uses Claude 3.5 Sonnet to determine optimal funding allocation strategy
        across multiple agents based on their confidence levels and budget capacity.

        Args:
            proposal_id: Proposal to fund
            agent_ids: List of agent IDs forming the coalition

        Returns:
            dict: Coalition summary containing:
                - proposal_id: Target proposal
                - strategy: Allocation strategy used
                - strategy_reasoning: Why this strategy was chosen
                - allocations: List of agent contributions
                - total_contribution: Sum of all contributions
                - coverage_percentage: Percentage of funding gap covered
                - proposal_will_be_funded: Whether threshold is met
                - coalition_strength: weak/moderate/strong

        Raises:
            ValueError: If proposal or agents not found
            Exception: If coalition formation or funding fails
        """
        logger.info(f"Forming coalition for proposal {proposal_id} with {len(agent_ids)} agents")
        try:
            # Load proposal from MongoDB
            proposal_doc = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
            if not proposal_doc:
                raise ValueError(f"Proposal not found: {proposal_id}")

            # Calculate funding gap
            budget_required = _decimal128_to_decimal(proposal_doc["budget_required"])
            budget_raised = _decimal128_to_decimal(proposal_doc["budget_raised"])
            funding_gap = budget_required - budget_raised

            logger.info(f"Proposal funding gap: {funding_gap} USDC")

            # Load all agents
            agent_docs = []
            for agent_id in agent_ids:
                agent_doc = await self.db.ai_agents.find_one({"agent_id": agent_id})
                if not agent_doc:
                    logger.warning(f"Agent not found: {agent_id}, skipping")
                    continue
                agent_docs.append(agent_doc)

            if not agent_docs:
                raise ValueError("No valid agents found in coalition")

            # Analyze proposal with each agent to get confidence levels
            agent_summaries = []
            total_available = Decimal("0")

            for agent_doc in agent_docs:
                agent_id = agent_doc["agent_id"]
                daily_remaining = await self._get_daily_remaining(agent_id)
                max_per_proposal = _decimal128_to_decimal(agent_doc["config"]["max_per_proposal"])

                # Calculate available for this proposal
                available = min(max_per_proposal, daily_remaining)
                total_available += available

                agent_summaries.append({
                    "agent_id": agent_id,
                    "agent_name": agent_doc["agent_name"],
                    "max_per_proposal": float(max_per_proposal),
                    "daily_remaining": float(daily_remaining),
                    "available_for_proposal": float(available),
                    "research_interests": agent_doc["config"]["research_interests"],
                })

            # Load prompt template
            prompt_path = os.path.join(self.prompts_dir, "coalition_formation.txt")
            with open(prompt_path, "r") as f:
                prompt_template = f.read()

            # Load researcher reputation
            researcher_doc = await self.db.worker_pricing.find_one(
                {"worker_id": proposal_doc["researcher_id"]}
            )
            researcher_reputation = researcher_doc["reputation_score"] if researcher_doc else 0.0

            # Format agent summaries for prompt
            agent_summaries_text = "\n".join([
                f"- {a['agent_name']} (ID: {a['agent_id']}): "
                f"Available: {a['available_for_proposal']} USDC, "
                f"Interests: {', '.join(a['research_interests'])}"
                for a in agent_summaries
            ])

            # Prepare template variables
            template_vars = {
                "proposal_id": proposal_id,
                "title": proposal_doc["title"],
                "description": proposal_doc["description"],
                "budget_required": float(budget_required),
                "budget_raised": float(budget_raised),
                "funding_gap": float(funding_gap),
                "researcher_reputation": researcher_reputation,
                "tags": ", ".join(proposal_doc.get("tags", [])),
                "agent_summaries": agent_summaries_text,
                "total_available": float(total_available),
            }

            # Replace template variables
            prompt = prompt_template
            for key, value in template_vars.items():
                prompt = prompt.replace(f"{{{key}}}", str(value))

            logger.info("Sending coalition formation request to Claude via Bedrock")

            # Call Claude 3.5 Sonnet via AWS Bedrock
            response = await self._call_bedrock(prompt)

            logger.info("Received coalition formation response from Claude")

            # Parse JSON response
            coalition_plan = self._parse_coalition_response(response)

            # Execute funding for each agent in allocation
            executed_allocations = []
            total_executed = Decimal("0")

            for allocation in coalition_plan["allocations"]:
                agent_id = allocation["agent_id"]
                contribution = Decimal(str(allocation["contribution"]))

                try:
                    await self._execute_funding(
                        agent_id=agent_id,
                        proposal_id=proposal_id,
                        amount=contribution
                    )
                    executed_allocations.append(allocation)
                    total_executed += contribution
                    logger.info(
                        f"Agent {agent_id} contributed {contribution} USDC to coalition"
                    )
                except Exception as funding_error:
                    logger.error(
                        f"Failed to execute funding for agent {agent_id}: {funding_error}"
                    )
                    allocation["error"] = str(funding_error)
                    allocation["contribution"] = 0.0

            # Return coalition summary
            return {
                "proposal_id": proposal_id,
                "strategy": coalition_plan["strategy"],
                "strategy_reasoning": coalition_plan["strategy_reasoning"],
                "allocations": executed_allocations,
                "total_contribution": total_executed,
                "coverage_percentage": float((total_executed / funding_gap) * 100) if funding_gap > 0 else 0,
                "proposal_will_be_funded": total_executed >= funding_gap,
                "coalition_strength": coalition_plan["coalition_strength"],
                "timestamp": datetime.now(timezone.utc),
            }

        except Exception as e:
            logger.error(f"Failed to form coalition: {e}")
            raise

    async def _execute_funding(
        self,
        agent_id: str,
        proposal_id: str,
        amount: Decimal
    ) -> None:
        """
        Execute funding transaction from agent to proposal.

        Enforces spending limits, updates agent spending history, and calls
        proposal service to process the funding.

        Args:
            agent_id: Agent funding the proposal
            proposal_id: Proposal receiving funding
            amount: Amount to fund in USDC

        Raises:
            ValueError: If spending limits exceeded
            Exception: If funding transaction fails
        """
        logger.info(f"Executing funding: agent {agent_id} -> proposal {proposal_id}, amount {amount}")
        try:
            # Load agent
            agent_doc = await self.db.ai_agents.find_one({"agent_id": agent_id})
            if not agent_doc:
                raise ValueError(f"Agent not found: {agent_id}")

            # Check spending limits
            max_per_proposal = _decimal128_to_decimal(agent_doc["config"]["max_per_proposal"])
            daily_remaining = await self._get_daily_remaining(agent_id)

            if amount > max_per_proposal:
                raise ValueError(
                    f"Funding amount ({amount}) exceeds max per proposal ({max_per_proposal})"
                )

            if amount > daily_remaining:
                raise ValueError(
                    f"Funding amount ({amount}) exceeds daily remaining budget ({daily_remaining})"
                )

            # Load proposal to get researcher wallet
            proposal_doc = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
            if not proposal_doc:
                raise ValueError(f"Proposal not found: {proposal_id}")

            # Execute USDC transfer via AgentKitService
            from services.agentkit_service import AgentKitService
            agentkit_service = AgentKitService()

            transfer_result = await agentkit_service.transfer_usdc(
                from_address=agent_doc["wallet_address"],
                to_address=proposal_doc["researcher_wallet"],
                amount=amount,
                metadata={
                    "type": "research_funding",
                    "proposal_id": proposal_id,
                    "agent_id": agent_id,
                }
            )

            logger.info(f"Funding transfer executed: {transfer_result['transaction_hash']}")

            # Update proposal funding
            new_budget_raised = _decimal128_to_decimal(proposal_doc["budget_raised"]) + amount
            await self.db.research_proposals.update_one(
                {"proposal_id": proposal_id},
                {
                    "$set": {
                        "budget_raised": _decimal_to_decimal128(new_budget_raised),
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$push": {
                        "funders": {
                            "funder_id": agent_id,
                            "wallet_address": agent_doc["wallet_address"],
                            "amount_usdc": _decimal_to_decimal128(amount),
                            "funded_at": datetime.now(timezone.utc),
                        }
                    }
                }
            )

            # Update agent spending history
            spending_record = {
                "timestamp": datetime.now(timezone.utc),
                "amount": _decimal_to_decimal128(amount),
                "purpose": f"Funded proposal {proposal_id}",
                "transaction_hash": transfer_result["transaction_hash"],
            }

            new_total_spent = _decimal128_to_decimal(agent_doc["total_spent"]) + amount

            await self.db.ai_agents.update_one(
                {"agent_id": agent_id},
                {
                    "$push": {"spending_history": spending_record},
                    "$set": {
                        "total_spent": _decimal_to_decimal128(new_total_spent),
                        "updated_at": datetime.now(timezone.utc),
                    }
                }
            )

            logger.info(f"Agent {agent_id} spending history updated, total spent: {new_total_spent}")

        except Exception as e:
            logger.error(f"Failed to execute funding: {e}")
            raise

    async def _get_daily_remaining(self, agent_id: str) -> Decimal:
        """
        Calculate remaining daily budget for an agent.

        Args:
            agent_id: Agent to check

        Returns:
            Decimal: Remaining budget for today

        Raises:
            ValueError: If agent not found
        """
        logger.debug(f"Calculating daily remaining budget for agent {agent_id}")
        try:
            # Load agent
            agent_doc = await self.db.ai_agents.find_one({"agent_id": agent_id})
            if not agent_doc:
                raise ValueError(f"Agent not found: {agent_id}")

            # Get daily budget
            daily_budget = _decimal128_to_decimal(agent_doc["config"]["daily_budget"])

            # Calculate today's spending
            today = date.today()
            today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)

            spending_history = agent_doc.get("spending_history", [])
            today_spending = Decimal("0")

            for record in spending_history:
                timestamp = record["timestamp"]
                # Ensure timestamp is timezone-aware
                if timestamp.tzinfo is None:
                    timestamp = timestamp.replace(tzinfo=timezone.utc)

                if timestamp >= today_start:
                    today_spending += _decimal128_to_decimal(record["amount"])

            remaining = daily_budget - today_spending
            logger.debug(
                f"Agent {agent_id} daily budget: {daily_budget}, "
                f"today's spending: {today_spending}, remaining: {remaining}"
            )

            return max(remaining, Decimal("0"))

        except Exception as e:
            logger.error(f"Failed to calculate daily remaining: {e}")
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

        logger.info(f"Chat using model: {self.bedrock_model_id}")
        try:
            response = self.bedrock.invoke_model(
                modelId=self.bedrock_model_id,
                body=json.dumps({
                    "anthropic_version": "bedrock-2023-05-31",
                    "max_tokens": 1024,
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

    def _parse_decision_response(self, response: str) -> dict:
        """
        Parse Claude's proposal analysis response.

        Args:
            response: Raw JSON response from Claude

        Returns:
            dict: Parsed decision with keys:
                - should_fund (bool)
                - funding_amount (float)
                - confidence (int)
                - reasoning (str)

        Raises:
            ValueError: If response is not valid JSON or missing required fields
        """
        try:
            # Try to parse JSON directly
            decision = json.loads(response)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            if "```json" in response:
                json_start = response.find("```json") + 7
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                decision = json.loads(json_str)
            elif "```" in response:
                json_start = response.find("```") + 3
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                decision = json.loads(json_str)
            else:
                raise ValueError(f"Response is not valid JSON: {response}")

        # Validate required fields
        required_fields = ["should_fund", "funding_amount", "confidence", "reasoning"]
        for field in required_fields:
            if field not in decision:
                raise ValueError(f"Missing required field in response: {field}")

        return decision

    def _parse_coalition_response(self, response: str) -> dict:
        """
        Parse Claude's coalition formation response.

        Args:
            response: Raw JSON response from Claude

        Returns:
            dict: Parsed coalition plan with keys:
                - strategy (str)
                - strategy_reasoning (str)
                - allocations (list)
                - total_contribution (float)
                - coverage_percentage (float)
                - proposal_will_be_funded (bool)
                - coalition_strength (str)

        Raises:
            ValueError: If response is not valid JSON or missing required fields
        """
        try:
            # Try to parse JSON directly
            plan = json.loads(response)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            if "```json" in response:
                json_start = response.find("```json") + 7
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                plan = json.loads(json_str)
            elif "```" in response:
                json_start = response.find("```") + 3
                json_end = response.find("```", json_start)
                json_str = response[json_start:json_end].strip()
                plan = json.loads(json_str)
            else:
                raise ValueError(f"Response is not valid JSON: {response}")

        # Validate required fields
        required_fields = [
            "strategy",
            "strategy_reasoning",
            "allocations",
            "total_contribution",
            "coverage_percentage",
            "proposal_will_be_funded",
            "coalition_strength"
        ]
        for field in required_fields:
            if field not in plan:
                raise ValueError(f"Missing required field in response: {field}")

        return plan

    async def chat(
        self,
        agent_id: str,
        agent_name: str,
        message: str,
        history: list[dict] | None = None,
        owner_id: str | None = None,
    ) -> str:
        """Autonomous chat powered by Claude + the platform MCP server.

        Claude receives MCP tool definitions for all platform operations
        (proposals, wallet, marketplace, agent stats, proposal creation) and
        calls them autonomously as needed to answer the user.

        Args:
            agent_id: Agent identifier
            agent_name: Human-readable agent name
            message: Latest user message
            history: Prior conversation turns
            owner_id: Authenticated user ID — scopes all tool calls

        Returns:
            str: Claude'''s final text reply
        """
        history = history or []

        # Resolve owner_id from agent doc if not provided
        resolved_owner_id = owner_id or ""
        research_interests: list[str] = []
        try:
            agent_doc = await self.db.ai_agents.find_one({"agent_id": agent_id})
            if agent_doc:
                config = agent_doc.get("config", {})
                research_interests = config.get("research_interests", [])
                if not resolved_owner_id:
                    resolved_owner_id = agent_doc.get("owner_id", "")
        except Exception as e:
            logger.warning("Could not load agent doc: %s", e)

        # Create MCP server scoped to this user
        from mcp_server.platform_mcp import create_platform_mcp
        mcp_server = create_platform_mcp(db=self.db, owner_id=resolved_owner_id)

        # Convert FastMCP tools to Claude tool definitions
        claude_tools: list[dict] = []
        mcp_tool_map: dict[str, object] = {}
        try:
            for tool in mcp_server._tool_manager._tools.values():
                claude_tools.append({
                    "name": tool.name,
                    "description": tool.description or "",
                    "input_schema": tool.parameters or {"type": "object", "properties": {}},
                })
                mcp_tool_map[tool.name] = tool
        except Exception as e:
            logger.warning("Could not load MCP tools: %s", e)

        expertise_line = ""
        if research_interests:
            expertise_line = "Your research expertise includes: %s. " % ", ".join(research_interests)

        system_prompt = (
            "You are %s, an autonomous AI research-funding agent on the QuantumNodes platform. " % agent_name
            + expertise_line
            + "You have access to MCP tools that connect you directly to the live platform database. "
            + "ALWAYS call the relevant tool(s) before answering any question about proposals, wallet, "
            + "marketplace, or agent stats — never guess or say you don'''t have access. "
            + "When creating a proposal, call create_proposal ONCE — never call it twice. If the tool returns a result (even with already_existed=true), report that result to the user immediately. "
            + "Be concise, specific, and action-oriented. Use exact values from tool results."
        )

        messages = [
            *[{"role": h["role"], "content": h["content"]} for h in history],
            {"role": "user", "content": message},
        ]

        if not self.bedrock:
            raise Exception("AWS Bedrock client not initialized")

        # Agentic tool-use loop — Claude calls MCP tools until it has everything it needs
        for _round in range(8):  # allow up to 8 tool-call rounds
            request_body: dict = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2048,
                "system": system_prompt,
                "messages": messages,
            }
            if claude_tools:
                request_body["tools"] = claude_tools

            response = self.bedrock.invoke_model(
                modelId=self.bedrock_model_id,
                body=json.dumps(request_body),
            )
            body = json.loads(response["body"].read())
            stop_reason = body.get("stop_reason", "")

            if stop_reason != "tool_use":
                # Final answer — return first text block
                for block in body.get("content", []):
                    if block.get("type") == "text":
                        return block["text"]
                return ""

            # Execute every tool Claude asked for (may be multiple in one round)
            tool_results: list[dict] = []
            for block in body.get("content", []):
                if block.get("type") != "tool_use":
                    continue
                tool_name: str = block["name"]
                tool_input: dict = block.get("input", {})
                tool_use_id: str = block["id"]
                logger.info("MCP tool call: %s(%s)", tool_name, tool_input)

                try:
                    # Call the FastMCP tool handler directly (in-process)
                    mcp_tool = mcp_tool_map.get(tool_name)
                    if mcp_tool is None:
                        tool_result = {"error": "Unknown tool: %s" % tool_name}
                    elif mcp_tool.is_async:
                        tool_result = await mcp_tool.run(arguments=tool_input)
                    else:
                        tool_result = mcp_tool.run(arguments=tool_input)
                except Exception as tool_err:
                    logger.error("Tool %s failed: %s", tool_name, tool_err)
                    tool_result = {"error": str(tool_err)}

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": json.dumps(tool_result),
                })

            # Add assistant turn + tool results, then loop
            messages.append({"role": "assistant", "content": body["content"]})
            messages.append({"role": "user", "content": tool_results})

        raise Exception("Chat exceeded maximum tool-call rounds")
