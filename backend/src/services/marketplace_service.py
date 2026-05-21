"""
MarketplaceService - Worker Pricing and Job Routing

This service manages the quantum computing job marketplace:
- Worker pricing registration and reputation tracking
- Job cost estimation from OpenQASM circuits
- Operation routing to cheapest qualified workers
- Payment distribution to workers via AgentKit
- Reputation updates based on job outcomes
- GossipSub network broadcasting for price discovery

Architecture:
- MongoDB: worker_pricing, payments, notifications collections
- AgentKit: USDC transfers for worker payments
- GossipSub: Network-wide price broadcasts
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from motor.motor_asyncio import AsyncIOMotorClient

from db.agentkit_collections import (
    NotificationDocument,
    PaymentDocument,
    WorkerPricingDocument,
    _decimal_to_decimal128,
    _decimal128_to_decimal,
)
from services.agentkit_service import AgentKitService

logger = logging.getLogger(__name__)


def _safe_decimal(value: object) -> float:
    """Convert a stored total_earned value (Decimal128 or str) to float safely."""
    if value is None:
        return 0.0
    try:
        return float(_decimal128_to_decimal(value))  # type: ignore[arg-type]
    except (AttributeError, TypeError):
        return float(value)


def _utc_now() -> datetime:
    """Return current UTC timestamp."""
    return datetime.now(timezone.utc)


class MarketplaceService:
    """
    Service for managing worker pricing, job routing, and payments.

    Coordinates the quantum computing marketplace by matching jobs to
    workers based on pricing, reputation, and availability. Handles
    payment distribution and reputation tracking.
    """

    def __init__(
        self,
        agentkit_service: AgentKitService,
        mongodb_uri: str | None = None,
        mongodb_database: str | None = None,
        gossipsub_broadcast_callback: callable | None = None,
    ) -> None:
        """
        Initialize MarketplaceService with AgentKit and MongoDB connections.

        Args:
            agentkit_service: AgentKitService instance for USDC transfers
            mongodb_uri: MongoDB connection string (defaults to env var)
            mongodb_database: MongoDB database name (defaults to env var)
            gossipsub_broadcast_callback: Optional callback(topic, message) for GossipSub broadcasts
        """
        logger.info("Initializing MarketplaceService")

        self.agentkit = agentkit_service

        # Initialize MongoDB connection
        import os

        mongodb_uri = mongodb_uri or os.getenv("QB2_MONGODB_LOCAL_URI", "mongodb://127.0.0.1:27017")
        mongodb_database = mongodb_database or os.getenv("QB2_MONGODB_DATABASE", "qds")
        self.mongo_client = AsyncIOMotorClient(mongodb_uri)
        self.db = self.mongo_client[mongodb_database]

        # GossipSub broadcast callback for network-wide price discovery
        self._gossipsub_broadcast = gossipsub_broadcast_callback

        # Operation type mappings for circuit parsing
        self._operation_mappings = {
            "h": "hadamard",
            "x": "pauli_x",
            "y": "pauli_y",
            "z": "pauli_z",
            "cx": "cnot",
            "cnot": "cnot",
            "cz": "cz",
            "swap": "swap",
            "rx": "rotation_x",
            "ry": "rotation_y",
            "rz": "rotation_z",
            "t": "t_gate",
            "tdg": "t_dagger",
            "s": "s_gate",
            "sdg": "s_dagger",
            # Custom gates
            "qft": "qft",
            "teleport": "teleport",
            "custom": "custom",
        }

        logger.info("MarketplaceService initialized successfully")

    # ------------------------------------------------------------------
    # 1. Worker Pricing Registration
    # ------------------------------------------------------------------

    async def register_worker_pricing(
        self,
        worker_id: str,
        pricing: dict[str, float | Decimal],
        performance_tier: Literal["bronze", "silver", "gold", "platinum"] = "bronze",
    ) -> dict[str, Any]:
        """
        Register or update worker pricing in the marketplace.

        Args:
            worker_id: Unique worker identifier
            pricing: Price per operation type, e.g. {"hadamard": 0.001, "cnot": 0.002, ...}
            performance_tier: Worker performance category (bronze|silver|gold|platinum)

        Returns:
            dict: Registration confirmation with worker_id, pricing, reputation_score

        Raises:
            ValueError: If worker_id is empty or pricing is invalid
            Exception: If database operation or broadcast fails
        """
        logger.info(f"Registering pricing for worker {worker_id}, tier: {performance_tier}")

        try:
            # Validate inputs
            if not worker_id:
                raise ValueError("worker_id cannot be empty")
            if not pricing or not isinstance(pricing, dict):
                raise ValueError("pricing must be a non-empty dict")

            # Validate all prices are positive
            for op_type, price in pricing.items():
                if Decimal(str(price)) < 0:
                    raise ValueError(f"Price for {op_type} must be non-negative, got: {price}")

            # Get worker's wallet address
            wallet_doc = await self.db.wallets.find_one({"entity_id": worker_id})
            if not wallet_doc:
                raise ValueError(f"Worker {worker_id} does not have a wallet. Create wallet first.")
            wallet_address = wallet_doc["default_address"]

            # Check if worker pricing already exists
            existing = await self.db.worker_pricing.find_one({"worker_id": worker_id})

            timestamp = _utc_now()

            if existing:
                # Update existing pricing
                update_result = await self.db.worker_pricing.update_one(
                    {"worker_id": worker_id},
                    {
                        "$set": {
                            "pricing": pricing,
                            "performance_tier": performance_tier,
                            "wallet_address": wallet_address,
                            "updated_at": timestamp,
                        }
                    },
                )
                logger.info(f"Updated pricing for worker {worker_id}: {update_result.modified_count} docs")
                reputation_score = existing["reputation_score"]
            else:
                # Create new worker pricing document
                worker_pricing_doc = WorkerPricingDocument(
                    worker_id=worker_id,
                    wallet_address=wallet_address,
                    pricing=pricing,
                    performance_tier=performance_tier,
                    reputation_score=50.0,  # Initialize to middle of 0-100 scale
                    total_earned=_decimal_to_decimal128(Decimal("0")),
                    jobs_completed=0,
                    is_active=True,
                    published_at=timestamp,
                    updated_at=timestamp,
                )
                await self.db.worker_pricing.insert_one(worker_pricing_doc.model_dump())
                logger.info(f"Created new pricing entry for worker {worker_id}")
                reputation_score = 50.0

            # Broadcast pricing update to network via GossipSub
            if self._gossipsub_broadcast:
                try:
                    message = {
                        "type": "worker_pricing_update",
                        "worker_id": worker_id,
                        "wallet_address": wallet_address,
                        "pricing": pricing,
                        "performance_tier": performance_tier,
                        "reputation_score": reputation_score,
                        "timestamp": timestamp.isoformat(),
                    }
                    self._gossipsub_broadcast("marketplace/pricing", message)
                    logger.info(f"Broadcasted pricing update for worker {worker_id} to network")
                except Exception as broadcast_error:
                    logger.warning(f"Failed to broadcast pricing update: {broadcast_error}")

            return {
                "worker_id": worker_id,
                "wallet_address": wallet_address,
                "pricing": pricing,
                "performance_tier": performance_tier,
                "reputation_score": reputation_score,
                "is_active": True,
                "timestamp": timestamp,
            }

        except Exception as e:
            logger.error(f"Failed to register worker pricing: {e}")
            raise

    # ------------------------------------------------------------------
    # 2. Job Cost Estimation
    # ------------------------------------------------------------------

    async def estimate_job_cost(self, circuit: str) -> dict[str, Any]:
        """
        Estimate the total cost of executing a quantum circuit.

        Parses the OpenQASM circuit, counts operations, and calculates cost
        based on current cheapest worker pricing for each operation type.

        Args:
            circuit: OpenQASM circuit string

        Returns:
            dict: Cost estimate containing:
                - total_usdc: Total estimated cost in USDC
                - breakdown: List of per-operation costs with worker assignments
                - operation_counts: Dict of operation type -> count
                - workers_required: List of worker IDs needed

        Raises:
            ValueError: If circuit is empty or invalid
            Exception: If cost calculation fails
        """
        logger.info("Estimating job cost from circuit")

        try:
            # Validate circuit
            if not circuit or not isinstance(circuit, str):
                raise ValueError("circuit must be a non-empty string")

            # Parse circuit to count operations
            operation_counts = self._parse_circuit_operations(circuit)
            logger.debug(f"Parsed operation counts: {operation_counts}")

            if not operation_counts:
                logger.warning("Circuit contains no recognized operations")
                return {
                    "total_usdc": Decimal("0"),
                    "breakdown": [],
                    "operation_counts": {},
                    "workers_required": [],
                }

            # Calculate cost for each operation type
            breakdown = []
            total_cost = Decimal("0")
            workers_required = set()

            for op_type, count in operation_counts.items():
                # Find cheapest worker for this operation
                cheapest_worker = await self._find_cheapest_worker(op_type)

                if not cheapest_worker:
                    logger.warning(f"No active workers available for operation: {op_type}")
                    breakdown.append({
                        "operation": op_type,
                        "count": count,
                        "price_per_op": None,
                        "subtotal": None,
                        "worker_id": None,
                        "error": "No workers available",
                    })
                    continue

                # Calculate subtotal for this operation type
                price_per_op = Decimal(str(cheapest_worker["pricing"][op_type]))
                subtotal = price_per_op * count
                total_cost += subtotal
                workers_required.add(cheapest_worker["worker_id"])

                breakdown.append({
                    "operation": op_type,
                    "count": count,
                    "price_per_op": float(price_per_op),
                    "subtotal": float(subtotal),
                    "worker_id": cheapest_worker["worker_id"],
                    "worker_reputation": cheapest_worker["reputation_score"],
                })

            logger.info(f"Estimated job cost: {total_cost} USDC across {len(workers_required)} workers")

            return {
                "total_usdc": float(total_cost),
                "breakdown": breakdown,
                "operation_counts": operation_counts,
                "workers_required": list(workers_required),
            }

        except Exception as e:
            logger.error(f"Failed to estimate job cost: {e}")
            raise

    # ------------------------------------------------------------------
    # 3. Operation Routing
    # ------------------------------------------------------------------

    async def route_operations(self, operations: dict[str, int]) -> list[dict[str, Any]]:
        """
        Route operations to cheapest qualified workers.

        Args:
            operations: Dict of operation type -> count, e.g. {"hadamard": 5, "cnot": 3}

        Returns:
            list: List of routing assignments, each containing:
                - operation: Operation type
                - count: Number of operations
                - worker_id: Assigned worker
                - wallet_address: Worker wallet for payment
                - price_per_op: Price per operation
                - total_cost: Total cost for this assignment
                - reputation_score: Worker reputation

        Raises:
            ValueError: If operations dict is empty or invalid
            Exception: If routing fails
        """
        logger.info(f"Routing operations: {operations}")

        try:
            # Validate input
            if not operations or not isinstance(operations, dict):
                raise ValueError("operations must be a non-empty dict")

            routing_assignments = []

            for op_type, count in operations.items():
                if count <= 0:
                    logger.warning(f"Skipping operation {op_type} with non-positive count: {count}")
                    continue

                # Find cheapest worker for this operation
                cheapest_worker = await self._find_cheapest_worker(op_type)

                if not cheapest_worker:
                    logger.warning(f"No active workers available for operation: {op_type}")
                    routing_assignments.append({
                        "operation": op_type,
                        "count": count,
                        "worker_id": None,
                        "wallet_address": None,
                        "price_per_op": None,
                        "total_cost": None,
                        "reputation_score": None,
                        "error": "No workers available",
                    })
                    continue

                # Calculate cost
                price_per_op = Decimal(str(cheapest_worker["pricing"][op_type]))
                total_cost = price_per_op * count

                routing_assignments.append({
                    "operation": op_type,
                    "count": count,
                    "worker_id": cheapest_worker["worker_id"],
                    "wallet_address": cheapest_worker["wallet_address"],
                    "price_per_op": float(price_per_op),
                    "total_cost": float(total_cost),
                    "reputation_score": cheapest_worker["reputation_score"],
                    "performance_tier": cheapest_worker["performance_tier"],
                })

            logger.info(f"Routed {len(routing_assignments)} operation types to workers")

            return routing_assignments

        except Exception as e:
            logger.error(f"Failed to route operations: {e}")
            raise

    # ------------------------------------------------------------------
    # 4. Payment Distribution
    # ------------------------------------------------------------------

    async def distribute_payment_to_workers(
        self,
        job_id: str,
        worker_payments: list[dict[str, Any]],
        from_wallet_address: str,
    ) -> dict[str, Any]:
        """
        Distribute payments to workers for completed job.

        Args:
            job_id: Job identifier for tracking
            worker_payments: List of payment records, each with:
                - worker_id: Worker identifier
                - amount: Payment amount in USDC (as float or Decimal)
            from_wallet_address: Source wallet for payments (user or platform)

        Returns:
            dict: Payment distribution summary containing:
                - job_id: Job identifier
                - total_distributed: Total USDC distributed
                - successful_payments: Number of successful transfers
                - failed_payments: Number of failed transfers
                - payment_details: List of individual payment results

        Raises:
            ValueError: If inputs are invalid
            Exception: If payment distribution fails
        """
        logger.info(f"Distributing payment for job {job_id} to {len(worker_payments)} workers")

        try:
            # Validate inputs
            if not job_id:
                raise ValueError("job_id cannot be empty")
            if not worker_payments or not isinstance(worker_payments, list):
                raise ValueError("worker_payments must be a non-empty list")

            payment_results = []
            total_distributed = Decimal("0")
            successful_count = 0
            failed_count = 0

            for payment in worker_payments:
                worker_id = payment.get("worker_id")
                amount = Decimal(str(payment.get("amount", 0)))

                if not worker_id or amount <= 0:
                    logger.warning(f"Skipping invalid payment: {payment}")
                    failed_count += 1
                    continue

                try:
                    # Get worker wallet address
                    worker_doc = await self.db.worker_pricing.find_one({"worker_id": worker_id})
                    if not worker_doc:
                        logger.error(f"Worker not found in pricing registry: {worker_id}")
                        payment_results.append({
                            "worker_id": worker_id,
                            "amount": float(amount),
                            "status": "failed",
                            "error": "Worker not found",
                        })
                        failed_count += 1
                        continue

                    to_wallet_address = worker_doc["wallet_address"]

                    # Execute USDC transfer via AgentKit
                    transfer_result = await self.agentkit.transfer_usdc(
                        from_address=from_wallet_address,
                        to_address=to_wallet_address,
                        amount=amount,
                        metadata={
                            "type": "worker_payment",
                            "job_id": job_id,
                            "worker_id": worker_id,
                        },
                    )

                    logger.info(f"Payment sent to worker {worker_id}: {amount} USDC")

                    # Update worker earnings and job count
                    current_earned = Decimal(str(_safe_decimal(worker_doc.get("total_earned"))))
                    new_total_earned = current_earned + amount

                    await self.db.worker_pricing.update_one(
                        {"worker_id": worker_id},
                        {
                            "$set": {
                                "total_earned": _decimal_to_decimal128(new_total_earned),
                                "updated_at": _utc_now(),
                            },
                            "$inc": {"jobs_completed": 1},
                        },
                    )

                    # Create notification for worker
                    await self._create_notification(
                        user_id=worker_id,
                        notification_type="payment_received",
                        title="Payment Received",
                        message=f"Received {amount} USDC for job {job_id}",
                        data={
                            "job_id": job_id,
                            "amount": float(amount),
                            "transaction_hash": transfer_result["transaction_hash"],
                            "basescan_url": transfer_result["basescan_url"],
                        },
                    )

                    payment_results.append({
                        "worker_id": worker_id,
                        "amount": float(amount),
                        "status": "success",
                        "transaction_hash": transfer_result["transaction_hash"],
                        "basescan_url": transfer_result["basescan_url"],
                    })

                    total_distributed += amount
                    successful_count += 1

                except Exception as payment_error:
                    logger.error(f"Failed to pay worker {worker_id}: {payment_error}")
                    payment_results.append({
                        "worker_id": worker_id,
                        "amount": float(amount),
                        "status": "failed",
                        "error": str(payment_error),
                    })
                    failed_count += 1

            logger.info(
                f"Payment distribution complete for job {job_id}: "
                f"{successful_count} successful, {failed_count} failed, "
                f"total: {total_distributed} USDC"
            )

            return {
                "job_id": job_id,
                "total_distributed": float(total_distributed),
                "successful_payments": successful_count,
                "failed_payments": failed_count,
                "payment_details": payment_results,
            }

        except Exception as e:
            logger.error(f"Failed to distribute payment for job {job_id}: {e}")
            raise

    # ------------------------------------------------------------------
    # 5. Reputation Management
    # ------------------------------------------------------------------

    async def update_worker_reputation(
        self,
        worker_id: str,
        job_success: bool,
        adjustment_reason: str | None = None,
    ) -> dict[str, Any]:
        """
        Update worker reputation based on job outcome.

        Args:
            worker_id: Worker identifier
            job_success: True if job succeeded, False if failed
            adjustment_reason: Optional reason for reputation change

        Returns:
            dict: Updated reputation info containing:
                - worker_id: Worker identifier
                - old_reputation: Previous reputation score
                - new_reputation: Updated reputation score
                - change: Reputation change amount
                - job_success: Job success status

        Raises:
            ValueError: If worker_id is empty or worker not found
            Exception: If reputation update fails
        """
        logger.info(f"Updating reputation for worker {worker_id}, success: {job_success}")

        try:
            # Validate input
            if not worker_id:
                raise ValueError("worker_id cannot be empty")

            # Find worker
            worker_doc = await self.db.worker_pricing.find_one({"worker_id": worker_id})
            if not worker_doc:
                raise ValueError(f"Worker not found: {worker_id}")

            old_reputation = worker_doc["reputation_score"]

            # Calculate reputation change
            if job_success:
                reputation_change = 2.0  # +2 points for success
            else:
                reputation_change = -5.0  # -5 points for failure

            # Apply change with bounds [0, 100]
            new_reputation = max(0.0, min(100.0, old_reputation + reputation_change))

            # Update database
            await self.db.worker_pricing.update_one(
                {"worker_id": worker_id},
                {
                    "$set": {
                        "reputation_score": new_reputation,
                        "updated_at": _utc_now(),
                    }
                },
            )

            logger.info(
                f"Updated worker {worker_id} reputation: "
                f"{old_reputation:.1f} -> {new_reputation:.1f} "
                f"({reputation_change:+.1f})"
            )

            # Deactivate worker if reputation falls too low
            if new_reputation < 20.0 and worker_doc["is_active"]:
                await self.db.worker_pricing.update_one(
                    {"worker_id": worker_id},
                    {"$set": {"is_active": False}},
                )
                logger.warning(f"Deactivated worker {worker_id} due to low reputation: {new_reputation:.1f}")

                # Send notification to worker
                await self._create_notification(
                    user_id=worker_id,
                    notification_type="system_alert",
                    title="Worker Status: Inactive",
                    message=f"Your worker has been deactivated due to low reputation score: {new_reputation:.1f}/100",
                    data={
                        "reputation_score": new_reputation,
                        "reason": "Low reputation threshold reached",
                    },
                )

            return {
                "worker_id": worker_id,
                "old_reputation": old_reputation,
                "new_reputation": new_reputation,
                "change": reputation_change,
                "job_success": job_success,
                "adjustment_reason": adjustment_reason,
            }

        except Exception as e:
            logger.error(f"Failed to update worker reputation: {e}")
            raise

    # ------------------------------------------------------------------
    # Internal Helper Methods
    # ------------------------------------------------------------------

    async def _find_cheapest_worker(self, operation_type: str) -> dict[str, Any] | None:
        """
        Find the cheapest active worker for a specific operation type.

        Args:
            operation_type: Operation type (hadamard, cnot, qft, etc.)

        Returns:
            dict: Worker document with lowest price for operation, or None if no workers

        Filters:
            - is_active = True
            - has pricing for operation_type
            - reputation_score >= 40
        """
        logger.debug(f"Finding cheapest worker for operation: {operation_type}")

        try:
            # Query active workers with pricing for this operation and decent reputation
            cursor = self.db.worker_pricing.find({
                "is_active": True,
                f"pricing.{operation_type}": {"$exists": True},
                "reputation_score": {"$gte": 40.0},
            })

            # Find worker with lowest price
            cheapest_worker = None
            cheapest_price = None

            async for worker_doc in cursor:
                price = Decimal(str(worker_doc["pricing"][operation_type]))

                if cheapest_price is None or price < cheapest_price:
                    cheapest_price = price
                    cheapest_worker = worker_doc

            if cheapest_worker:
                logger.debug(
                    f"Cheapest worker for {operation_type}: "
                    f"{cheapest_worker['worker_id']} at {cheapest_price} USDC/op"
                )
            else:
                logger.debug(f"No active workers found for operation: {operation_type}")

            return cheapest_worker

        except Exception as e:
            logger.error(f"Error finding cheapest worker for {operation_type}: {e}")
            return None

    def _parse_circuit_operations(self, circuit: str) -> dict[str, int]:
        """
        Parse OpenQASM circuit to count operations.

        Args:
            circuit: OpenQASM circuit string

        Returns:
            dict: Operation type -> count mapping

        Examples:
            Input: "h q[0]; cx q[0],q[1]; h q[1];"
            Output: {"hadamard": 2, "cnot": 1}
        """
        logger.debug("Parsing circuit operations")

        operation_counts: dict[str, int] = {}

        try:
            # Remove comments and normalize whitespace
            circuit = re.sub(r"//.*", "", circuit)  # Remove single-line comments
            circuit = re.sub(r"/\*.*?\*/", "", circuit, flags=re.DOTALL)  # Remove multi-line comments
            circuit = circuit.lower()

            # Split into individual operations
            lines = circuit.split(";")

            for line in lines:
                line = line.strip()
                if not line or line.startswith("qreg") or line.startswith("creg") or line.startswith("openqasm"):
                    continue

                # Extract operation name (first token)
                tokens = line.split()
                if not tokens:
                    continue

                op_name = tokens[0].strip()

                # Map to canonical operation type
                canonical_op = self._operation_mappings.get(op_name)

                if canonical_op:
                    operation_counts[canonical_op] = operation_counts.get(canonical_op, 0) + 1
                else:
                    # Treat unknown operations as "custom"
                    operation_counts["custom"] = operation_counts.get("custom", 0) + 1
                    logger.debug(f"Unknown operation '{op_name}' classified as custom")

            logger.debug(f"Parsed circuit operation counts: {operation_counts}")

        except Exception as e:
            logger.error(f"Error parsing circuit: {e}")
            # Return empty dict on parse errors
            operation_counts = {}

        return operation_counts

    async def _create_notification(
        self,
        user_id: str,
        notification_type: str,
        title: str,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> None:
        """
        Create a notification for a user.

        Args:
            user_id: User/worker identifier
            notification_type: Notification type (payment_received, etc.)
            title: Notification title
            message: Notification message
            data: Optional additional data
        """
        try:
            notification = NotificationDocument(
                user_id=user_id,
                type=notification_type,
                title=title,
                message=message,
                data=data or {},
                read=False,
                sent_email=False,
                created_at=_utc_now(),
            )

            await self.db.notifications.insert_one(notification.model_dump())
            logger.debug(f"Created notification for user {user_id}: {title}")

        except Exception as e:
            logger.warning(f"Failed to create notification: {e}")
            # Don't raise - notifications are non-critical

    # ------------------------------------------------------------------
    # Additional Utility Methods
    # ------------------------------------------------------------------

    async def get_worker_stats(self, worker_id: str) -> dict[str, Any]:
        """
        Get comprehensive statistics for a worker.

        Args:
            worker_id: Worker identifier

        Returns:
            dict: Worker statistics including pricing, reputation, earnings, jobs

        Raises:
            ValueError: If worker not found
        """
        logger.info(f"Fetching stats for worker {worker_id}")

        try:
            worker_doc = await self.db.worker_pricing.find_one({"worker_id": worker_id})
            if not worker_doc:
                raise ValueError(f"Worker not found: {worker_id}")

            return {
                "worker_id": worker_doc["worker_id"],
                "wallet_address": worker_doc["wallet_address"],
                "pricing": worker_doc["pricing"],
                "performance_tier": worker_doc["performance_tier"],
                "reputation_score": worker_doc["reputation_score"],
                "total_earned": _safe_decimal(worker_doc.get("total_earned")),
                "jobs_completed": worker_doc["jobs_completed"],
                "is_active": worker_doc["is_active"],
                "published_at": worker_doc["published_at"],
                "updated_at": worker_doc["updated_at"],
            }

        except Exception as e:
            logger.error(f"Failed to get worker stats: {e}")
            raise

    async def list_active_workers(
        self,
        min_reputation: float = 40.0,
        performance_tier: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        List all active workers meeting criteria.

        Args:
            min_reputation: Minimum reputation score filter
            performance_tier: Optional performance tier filter

        Returns:
            list: List of worker documents meeting criteria
        """
        logger.info(f"Listing active workers (min_reputation={min_reputation}, tier={performance_tier})")

        try:
            query = {
                "is_active": True,
                "reputation_score": {"$gte": min_reputation},
            }

            if performance_tier:
                query["performance_tier"] = performance_tier

            cursor = self.db.worker_pricing.find(query).sort("reputation_score", -1)

            workers = []
            async for worker_doc in cursor:
                workers.append({
                    "worker_id": worker_doc["worker_id"],
                    "wallet_address": worker_doc["wallet_address"],
                    "pricing": worker_doc["pricing"],
                    "performance_tier": worker_doc["performance_tier"],
                    "reputation_score": worker_doc["reputation_score"],
                    "total_earned": float(_safe_decimal(worker_doc.get("total_earned"))),
                    "jobs_completed": worker_doc["jobs_completed"],
                    "agent_name": worker_doc.get("agent_name"),
                    "specialty": worker_doc.get("specialty"),
                    "description": worker_doc.get("description"),
                    "price_per_task": worker_doc.get("price_per_task"),
                })

            logger.info(f"Found {len(workers)} active workers meeting criteria")
            return workers

        except Exception as e:
            logger.error(f"Failed to list active workers: {e}")
            raise
