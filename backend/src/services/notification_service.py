"""
NotificationService - Multi-channel notification system for research platform

Supports three notification channels:
1. Email (via Resend API)
2. WebSocket (real-time updates to connected clients)
3. GossipSub PubSub (peer-to-peer network broadcasts)

All notifications are persisted to MongoDB for audit trail and user history.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

from db.agentkit_collections import NotificationDocument, ResearchProposalDocument
from quantum_backend_v2.agent.websocket import manager as websocket_manager

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    """Return current UTC timestamp."""
    return datetime.now(timezone.utc)


# Email templates for different notification types
EMAIL_TEMPLATES = {
    "new_proposal": {
        "subject": "🔬 New Research Proposal: {title}",
        "html": """
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2c3e50;">🔬 New Research Proposal</h2>
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #3498db;">{title}</h3>
                            <p style="margin: 10px 0;"><strong>Researcher:</strong> {researcher_name}</p>
                            <p style="margin: 10px 0;"><strong>Budget Required:</strong> {budget_required} USDC</p>
                            <p style="margin: 10px 0;"><strong>Funding Threshold:</strong> {funding_threshold} USDC</p>
                            <p style="margin: 10px 0;"><strong>Deadline:</strong> {deadline}</p>
                        </div>
                        <div style="background-color: #fff; padding: 15px; border-left: 4px solid #3498db;">
                            <h4 style="margin-top: 0;">Description</h4>
                            <p>{description}</p>
                        </div>
                        <div style="margin-top: 20px;">
                            <a href="{proposal_url}" style="background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View Proposal
                            </a>
                        </div>
                        <p style="color: #7f8c8d; font-size: 12px; margin-top: 30px;">
                            You received this notification because you have enabled "New Proposals" notifications in your preferences.
                        </p>
                    </div>
                </body>
            </html>
        """
    },
    "proposal_funded": {
        "subject": "✅ Proposal Fully Funded: {title}",
        "html": """
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #27ae60;">✅ Proposal Fully Funded!</h2>
                        <div style="background-color: #d5f4e6; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #27ae60;">{title}</h3>
                            <p style="margin: 10px 0; font-size: 18px;"><strong>Latest contribution:</strong></p>
                            <p style="margin: 10px 0;">{funder_name} contributed <strong>{amount} USDC</strong></p>
                            <p style="margin: 10px 0;"><strong>Total Raised:</strong> {total_raised} USDC</p>
                        </div>
                        <div style="background-color: #fff; padding: 15px; border-left: 4px solid #27ae60;">
                            <p style="margin: 0;">The proposal has reached its funding goal! Research can now begin.</p>
                        </div>
                        <div style="margin-top: 20px;">
                            <a href="{proposal_url}" style="background-color: #27ae60; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View Proposal
                            </a>
                        </div>
                    </div>
                </body>
            </html>
        """
    },
    "payment_received": {
        "subject": "💰 Payment Received: {amount} USDC",
        "html": """
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #f39c12;">💰 Payment Received</h2>
                        <div style="background-color: #fef5e7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 10px 0; font-size: 24px;"><strong>{amount} USDC</strong></p>
                            <p style="margin: 10px 0;"><strong>Job:</strong> {job_title}</p>
                            <p style="margin: 10px 0;"><strong>Transaction:</strong> {transaction_hash}</p>
                        </div>
                        <div style="background-color: #fff; padding: 15px; border-left: 4px solid #f39c12;">
                            <p style="margin: 0;">Your payment has been confirmed on the blockchain.</p>
                        </div>
                        <div style="margin-top: 20px;">
                            <a href="{basescan_url}" style="background-color: #f39c12; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View on BaseScan
                            </a>
                        </div>
                    </div>
                </body>
            </html>
        """
    },
    "fragment_claimed": {
        "subject": "🔬 Research Fragment Claimed",
        "html": """
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #9b59b6;">🔬 Fragment Claimed</h2>
                        <div style="background-color: #f4ecf7; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <p style="margin: 10px 0;"><strong>Researcher:</strong> {researcher_name}</p>
                            <p style="margin: 10px 0;"><strong>Fragment:</strong> {fragment_title}</p>
                            <p style="margin: 10px 0;"><strong>Proposal:</strong> {proposal_title}</p>
                        </div>
                        <div style="background-color: #fff; padding: 15px; border-left: 4px solid #9b59b6;">
                            <p style="margin: 0;">A researcher has claimed a fragment from your research proposal. Work is now in progress!</p>
                        </div>
                        <div style="margin-top: 20px;">
                            <a href="{proposal_url}" style="background-color: #9b59b6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View Progress
                            </a>
                        </div>
                    </div>
                </body>
            </html>
        """
    },
    "results_published": {
        "subject": "📊 Research Results Published",
        "html": """
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #16a085;">📊 Results Published</h2>
                        <div style="background-color: #d1f2eb; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #16a085;">{title}</h3>
                            <p style="margin: 10px 0;"><strong>IPFS Hash:</strong> <code style="background-color: #fff; padding: 2px 5px; border-radius: 3px;">{ipfs_hash}</code></p>
                        </div>
                        <div style="background-color: #fff; padding: 15px; border-left: 4px solid #16a085;">
                            <p style="margin: 0;">Research results have been published to IPFS and are now permanently available on the decentralized network.</p>
                        </div>
                        <div style="margin-top: 20px;">
                            <a href="{ipfs_url}" style="background-color: #16a085; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-right: 10px;">
                                View on IPFS
                            </a>
                            <a href="{proposal_url}" style="background-color: #7f8c8d; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                                View Proposal
                            </a>
                        </div>
                    </div>
                </body>
            </html>
        """
    }
}


class NotificationService:
    """
    Multi-channel notification service for the research platform.

    Manages notifications across:
    - Email (Resend API)
    - WebSocket (real-time browser updates)
    - GossipSub pubsub (peer-to-peer network)
    - MongoDB (persistent audit trail)
    """

    def __init__(self, pubsub_client: Optional[Any] = None) -> None:
        """
        Initialize notification service.

        Args:
            pubsub_client: Optional GossipSub Pubsub client for P2P broadcasts
        """
        logger.info("Initializing NotificationService")

        # Load Resend API credentials
        self.resend_api_key = os.getenv("RESEND_API_KEY")
        self.resend_from_email = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

        if not self.resend_api_key:
            logger.warning("RESEND_API_KEY not configured - email notifications will be disabled")

        # Base URL for the platform (used in email links)
        self.platform_base_url = os.getenv("PLATFORM_BASE_URL", "http://localhost:3000")

        # Initialize MongoDB connection
        mongodb_uri = os.getenv("QB2_MONGODB_LOCAL_URI", "mongodb://127.0.0.1:27017")
        mongodb_database = os.getenv("QB2_MONGODB_DATABASE", "qds")
        self.mongo_client = AsyncIOMotorClient(mongodb_uri)
        self.db = self.mongo_client[mongodb_database]

        # GossipSub pubsub client for P2P broadcasts (optional)
        self.pubsub_client = pubsub_client

        # Resend API base URL
        self.resend_api_url = "https://api.resend.com"

        # HTTP client for API calls
        self.http_client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "Authorization": f"Bearer {self.resend_api_key}",
                "Content-Type": "application/json"
            }
        )

        logger.info(
            f"NotificationService initialized - "
            f"Email: {'enabled' if self.resend_api_key else 'disabled'}, "
            f"WebSocket: enabled, "
            f"PubSub: {'enabled' if self.pubsub_client else 'disabled'}"
        )

    async def close(self) -> None:
        """Clean up resources."""
        await self.http_client.aclose()
        self.mongo_client.close()

    async def notify_new_proposal(self, proposal: dict[str, Any]) -> None:
        """
        Notify users about a new research proposal.

        Sends to:
        - All users with notification_preferences.new_proposals = True
        - Broadcasts via GossipSub topic "proposals"
        - WebSocket broadcast to online users

        Args:
            proposal: Research proposal document with fields:
                - proposal_id, title, description, researcher_id, researcher_wallet,
                  budget_required, funding_threshold, deadline
        """
        logger.info(f"Notifying new proposal: {proposal.get('title')}")

        # Get users who want new proposal notifications
        # Note: This assumes PlatformUserDocument has notification_preferences field
        # If not present, we'll send to all users or skip email notifications
        users_cursor = self.db.platform_users.find({
            "is_active": True,
            # "notification_preferences.new_proposals": True  # Uncomment when field exists
        })

        recipients = []
        user_ids = []

        async for user in users_cursor:
            if user.get("email"):
                recipients.append({
                    "email": user["email"],
                    "name": user.get("display_name", "User")
                })
                user_ids.append(user.get("id") or user.get("_id"))

        # Prepare email data
        template_data = {
            "title": proposal.get("title", "Untitled Proposal"),
            "researcher_name": proposal.get("researcher_id", "Unknown"),
            "budget_required": str(proposal.get("budget_required", "0")),
            "funding_threshold": str(proposal.get("funding_threshold", "0")),
            "deadline": str(proposal.get("deadline", "N/A")),
            "description": proposal.get("description", "No description provided"),
            "proposal_url": f"{self.platform_base_url}/proposals/{proposal.get('proposal_id')}"
        }

        # Send bulk email
        if recipients:
            await self.send_bulk_email(
                recipients=recipients,
                template_type="new_proposal",
                data=template_data
            )

        # Broadcast via WebSocket
        ws_message = {
            "type": "new_proposal",
            "proposal_id": proposal.get("proposal_id"),
            "title": proposal.get("title"),
            "researcher_id": proposal.get("researcher_id"),
            "budget_required": str(proposal.get("budget_required")),
            "deadline": str(proposal.get("deadline"))
        }

        # Broadcast to all active WebSocket sessions
        # Note: This broadcasts to all, you may want to filter by user preferences
        for session_id in list(websocket_manager.active_connections.keys()):
            try:
                await websocket_manager.send_message(session_id, ws_message)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message to {session_id}: {e}")

        # Broadcast via GossipSub
        if self.pubsub_client:
            try:
                pubsub_data = json.dumps({
                    "event": "new_proposal",
                    "data": ws_message
                }).encode("utf-8")
                await self.pubsub_client.publish("proposals", pubsub_data)
                logger.info(f"Broadcasted new proposal to GossipSub topic 'proposals'")
            except Exception as e:
                logger.error(f"Failed to broadcast to GossipSub: {e}")

        # Create notification documents for each user
        for user_id in user_ids:
            try:
                notification = {
                    "user_id": user_id,
                    "type": "other",
                    "title": f"New Research Proposal: {proposal.get('title')}",
                    "message": f"A new research proposal has been published: {proposal.get('title')}",
                    "data": {
                        "proposal_id": proposal.get("proposal_id"),
                        "budget_required": str(proposal.get("budget_required"))
                    },
                    "read": False,
                    "sent_email": True,
                    "email_sent_at": _utc_now(),
                    "created_at": _utc_now()
                }
                await self.db.notifications.insert_one(notification)
            except Exception as e:
                logger.error(f"Failed to create notification for user {user_id}: {e}")

    async def notify_proposal_funded(
        self,
        proposal_id: str,
        funder_name: str,
        amount: str,
        total_raised: str
    ) -> None:
        """
        Notify about proposal funding contribution.

        Sends to:
        - Proposal researcher
        - All existing funders
        - WebSocket broadcast

        Args:
            proposal_id: ID of the funded proposal
            funder_name: Name/ID of the contributor
            amount: Amount contributed (USDC)
            total_raised: Total amount raised so far
        """
        logger.info(f"Notifying proposal funded: {proposal_id}, amount: {amount}")

        # Get proposal details
        proposal = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
        if not proposal:
            logger.error(f"Proposal not found: {proposal_id}")
            return

        # Get researcher and funders
        recipients = []
        user_ids = []

        # Add researcher
        researcher = await self.db.platform_users.find_one({"id": proposal.get("researcher_id")})
        if researcher and researcher.get("email"):
            recipients.append({
                "email": researcher["email"],
                "name": researcher.get("display_name", "Researcher")
            })
            user_ids.append(researcher.get("id"))

        # Add funders
        for funder_record in proposal.get("funders", []):
            funder_user = await self.db.platform_users.find_one({"id": funder_record.get("funder_id")})
            if funder_user and funder_user.get("email"):
                recipients.append({
                    "email": funder_user["email"],
                    "name": funder_user.get("display_name", "Funder")
                })
                user_ids.append(funder_user.get("id"))

        # Prepare email data
        template_data = {
            "title": proposal.get("title", "Untitled Proposal"),
            "funder_name": funder_name,
            "amount": amount,
            "total_raised": total_raised,
            "proposal_url": f"{self.platform_base_url}/proposals/{proposal_id}"
        }

        # Send bulk email
        if recipients:
            await self.send_bulk_email(
                recipients=recipients,
                template_type="proposal_funded",
                data=template_data
            )

        # Broadcast via WebSocket
        ws_message = {
            "type": "proposal_funded",
            "proposal_id": proposal_id,
            "funder_name": funder_name,
            "amount": amount,
            "total_raised": total_raised,
            "title": proposal.get("title")
        }

        for session_id in list(websocket_manager.active_connections.keys()):
            try:
                await websocket_manager.send_message(session_id, ws_message)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message: {e}")

        # Create notification documents
        for user_id in set(user_ids):  # Remove duplicates
            try:
                notification = {
                    "user_id": user_id,
                    "type": "proposal_funded",
                    "title": f"Proposal Funded: {proposal.get('title')}",
                    "message": f"✅ {funder_name} contributed {amount} USDC",
                    "data": {
                        "proposal_id": proposal_id,
                        "amount": amount,
                        "total_raised": total_raised
                    },
                    "read": False,
                    "sent_email": True,
                    "email_sent_at": _utc_now(),
                    "created_at": _utc_now()
                }
                await self.db.notifications.insert_one(notification)
            except Exception as e:
                logger.error(f"Failed to create notification for user {user_id}: {e}")

    async def notify_payment_received(
        self,
        user_id: str,
        amount: str,
        job_id: str,
        transaction_hash: str,
        basescan_url: str
    ) -> None:
        """
        Notify user about received payment.

        Args:
            user_id: Recipient user ID
            amount: Payment amount in USDC
            job_id: Associated job ID
            transaction_hash: Blockchain transaction hash
            basescan_url: BaseScan explorer URL
        """
        logger.info(f"Notifying payment received: user={user_id}, amount={amount}")

        # Get user details
        user = await self.db.platform_users.find_one({"id": user_id})
        if not user:
            logger.error(f"User not found: {user_id}")
            return

        # Prepare email data
        template_data = {
            "amount": amount,
            "job_title": f"Job #{job_id}",
            "transaction_hash": transaction_hash,
            "basescan_url": basescan_url
        }

        # Send email
        if user.get("email"):
            await self.send_bulk_email(
                recipients=[{
                    "email": user["email"],
                    "name": user.get("display_name", "User")
                }],
                template_type="payment_received",
                data=template_data
            )

        # Send WebSocket notification if user is online
        ws_message = {
            "type": "payment_received",
            "amount": amount,
            "job_id": job_id,
            "transaction_hash": transaction_hash,
            "basescan_url": basescan_url
        }

        # Try to find user's WebSocket session
        # Note: This assumes session_id matches user_id or is stored elsewhere
        try:
            await websocket_manager.send_message(user_id, ws_message)
        except Exception as e:
            logger.debug(f"User {user_id} not connected via WebSocket: {e}")

        # Create notification document
        try:
            notification = {
                "user_id": user_id,
                "type": "payment_received",
                "title": f"Payment Received: {amount} USDC",
                "message": f"💰 You received {amount} USDC for job #{job_id}",
                "data": {
                    "amount": amount,
                    "job_id": job_id,
                    "transaction_hash": transaction_hash,
                    "basescan_url": basescan_url
                },
                "read": False,
                "sent_email": True,
                "email_sent_at": _utc_now(),
                "created_at": _utc_now()
            }
            await self.db.notifications.insert_one(notification)
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")

    async def notify_fragment_claimed(
        self,
        proposal_id: str,
        fragment_id: str,
        researcher_id: str
    ) -> None:
        """
        Notify proposal owner about fragment being claimed.

        Args:
            proposal_id: ID of the research proposal
            fragment_id: ID of the claimed fragment
            researcher_id: ID of researcher who claimed it
        """
        logger.info(f"Notifying fragment claimed: proposal={proposal_id}, fragment={fragment_id}")

        # Get proposal details
        proposal = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
        if not proposal:
            logger.error(f"Proposal not found: {proposal_id}")
            return

        # Get proposal owner
        owner = await self.db.platform_users.find_one({"id": proposal.get("researcher_id")})
        if not owner:
            logger.error(f"Proposal owner not found: {proposal.get('researcher_id')}")
            return

        # Get researcher who claimed the fragment
        researcher = await self.db.platform_users.find_one({"id": researcher_id})
        researcher_name = researcher.get("display_name", researcher_id) if researcher else researcher_id

        # Prepare email data
        template_data = {
            "researcher_name": researcher_name,
            "fragment_title": f"Fragment {fragment_id}",
            "proposal_title": proposal.get("title", "Untitled Proposal"),
            "proposal_url": f"{self.platform_base_url}/proposals/{proposal_id}"
        }

        # Send email
        if owner.get("email"):
            await self.send_bulk_email(
                recipients=[{
                    "email": owner["email"],
                    "name": owner.get("display_name", "User")
                }],
                template_type="fragment_claimed",
                data=template_data
            )

        # Send WebSocket notification
        ws_message = {
            "type": "fragment_claimed",
            "proposal_id": proposal_id,
            "fragment_id": fragment_id,
            "researcher_id": researcher_id,
            "researcher_name": researcher_name
        }

        try:
            await websocket_manager.send_message(owner.get("id"), ws_message)
        except Exception as e:
            logger.debug(f"Owner not connected via WebSocket: {e}")

        # Create notification document
        try:
            notification = {
                "user_id": owner.get("id"),
                "type": "other",
                "title": "Research Fragment Claimed",
                "message": f"🔬 {researcher_name} claimed fragment: {fragment_id}",
                "data": {
                    "proposal_id": proposal_id,
                    "fragment_id": fragment_id,
                    "researcher_id": researcher_id
                },
                "read": False,
                "sent_email": True,
                "email_sent_at": _utc_now(),
                "created_at": _utc_now()
            }
            await self.db.notifications.insert_one(notification)
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")

    async def notify_results_published(
        self,
        proposal_id: str,
        ipfs_hash: str
    ) -> None:
        """
        Notify all stakeholders about published research results.

        Sends to:
        - Proposal researcher
        - All funders

        Args:
            proposal_id: ID of the research proposal
            ipfs_hash: IPFS hash of published results
        """
        logger.info(f"Notifying results published: proposal={proposal_id}, ipfs={ipfs_hash}")

        # Get proposal details
        proposal = await self.db.research_proposals.find_one({"proposal_id": proposal_id})
        if not proposal:
            logger.error(f"Proposal not found: {proposal_id}")
            return

        # Get researcher and funders
        recipients = []
        user_ids = []

        # Add researcher
        researcher = await self.db.platform_users.find_one({"id": proposal.get("researcher_id")})
        if researcher and researcher.get("email"):
            recipients.append({
                "email": researcher["email"],
                "name": researcher.get("display_name", "Researcher")
            })
            user_ids.append(researcher.get("id"))

        # Add funders
        for funder_record in proposal.get("funders", []):
            funder_user = await self.db.platform_users.find_one({"id": funder_record.get("funder_id")})
            if funder_user and funder_user.get("email"):
                recipients.append({
                    "email": funder_user["email"],
                    "name": funder_user.get("display_name", "Funder")
                })
                user_ids.append(funder_user.get("id"))

        # Prepare email data
        ipfs_url = f"https://ipfs.io/ipfs/{ipfs_hash}"
        template_data = {
            "title": proposal.get("title", "Untitled Proposal"),
            "ipfs_hash": ipfs_hash,
            "ipfs_url": ipfs_url,
            "proposal_url": f"{self.platform_base_url}/proposals/{proposal_id}"
        }

        # Send bulk email
        if recipients:
            await self.send_bulk_email(
                recipients=recipients,
                template_type="results_published",
                data=template_data
            )

        # Broadcast via WebSocket
        ws_message = {
            "type": "results_published",
            "proposal_id": proposal_id,
            "ipfs_hash": ipfs_hash,
            "ipfs_url": ipfs_url,
            "title": proposal.get("title")
        }

        for session_id in list(websocket_manager.active_connections.keys()):
            try:
                await websocket_manager.send_message(session_id, ws_message)
            except Exception as e:
                logger.warning(f"Failed to send WebSocket message: {e}")

        # Broadcast via GossipSub
        if self.pubsub_client:
            try:
                pubsub_data = json.dumps({
                    "event": "results_published",
                    "data": ws_message
                }).encode("utf-8")
                await self.pubsub_client.publish("proposals", pubsub_data)
                logger.info(f"Broadcasted results published to GossipSub")
            except Exception as e:
                logger.error(f"Failed to broadcast to GossipSub: {e}")

        # Create notification documents
        for user_id in set(user_ids):
            try:
                notification = {
                    "user_id": user_id,
                    "type": "other",
                    "title": f"Results Published: {proposal.get('title')}",
                    "message": f"📊 Results published to IPFS: {ipfs_hash}",
                    "data": {
                        "proposal_id": proposal_id,
                        "ipfs_hash": ipfs_hash,
                        "ipfs_url": ipfs_url
                    },
                    "read": False,
                    "sent_email": True,
                    "email_sent_at": _utc_now(),
                    "created_at": _utc_now()
                }
                await self.db.notifications.insert_one(notification)
            except Exception as e:
                logger.error(f"Failed to create notification for user {user_id}: {e}")

    async def send_bulk_email(
        self,
        recipients: list[dict[str, str]],
        template_type: str,
        data: dict[str, Any]
    ) -> bool:
        """
        Send bulk emails using Resend API.

        Args:
            recipients: List of dicts with 'email' and 'name' keys
            template_type: Template key from EMAIL_TEMPLATES
            data: Template variable substitution data

        Returns:
            True if emails sent successfully, False otherwise
        """
        if not self.resend_api_key:
            logger.warning("Email sending disabled - RESEND_API_KEY not configured")
            return False

        if not recipients:
            logger.warning("No recipients provided for bulk email")
            return False

        template = EMAIL_TEMPLATES.get(template_type)
        if not template:
            logger.error(f"Unknown template type: {template_type}")
            return False

        try:
            # Format subject and HTML with provided data
            subject = template["subject"].format(**data)
            html_content = template["html"].format(**data)

            # Prepare batch email payload
            # Resend batch API: https://resend.com/docs/api-reference/emails/send-batch-email
            emails = []
            for recipient in recipients[:100]:  # Batch limit of 100
                emails.append({
                    "from": self.resend_from_email,
                    "to": [recipient["email"]],
                    "subject": subject,
                    "html": html_content
                })

            # Send batch request
            response = await self.http_client.post(
                f"{self.resend_api_url}/emails/batch",
                json=emails
            )

            if response.status_code == 200:
                result = response.json()
                logger.info(
                    f"Sent {len(recipients)} emails successfully via Resend - "
                    f"Template: {template_type}"
                )
                return True
            else:
                logger.error(
                    f"Failed to send emails - Status: {response.status_code}, "
                    f"Response: {response.text}"
                )
                return False

        except httpx.HTTPError as e:
            logger.error(f"HTTP error while sending emails: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending emails: {e}", exc_info=True)
            return False


# Global service instance (to be initialized by application)
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get the global notification service instance."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service


def set_notification_service(service: NotificationService) -> None:
    """Set the global notification service instance."""
    global _notification_service
    _notification_service = service
