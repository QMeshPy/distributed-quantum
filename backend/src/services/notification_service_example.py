"""
Example usage of NotificationService

This script demonstrates how to use the NotificationService to send
notifications across multiple channels (email, WebSocket, GossipSub).

Run this script to test the notification system:
    python -m services.notification_service_example
"""

import asyncio
import logging
from decimal import Decimal
from datetime import datetime, timezone, timedelta

from services.notification_service import NotificationService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)


async def example_new_proposal():
    """Example: Notify about a new research proposal"""
    service = NotificationService()

    # Sample proposal data
    proposal = {
        "proposal_id": "prop_12345",
        "title": "Quantum Algorithm for Portfolio Optimization",
        "description": "This research explores quantum annealing algorithms for real-time portfolio optimization in financial markets.",
        "researcher_id": "researcher_001",
        "researcher_wallet": "0x1234567890123456789012345678901234567890",
        "budget_required": Decimal("5000.00"),
        "funding_threshold": Decimal("2500.00"),
        "deadline": datetime.now(timezone.utc) + timedelta(days=30)
    }

    await service.notify_new_proposal(proposal)
    logger.info("✅ New proposal notification sent")

    await service.close()


async def example_proposal_funded():
    """Example: Notify about proposal funding"""
    service = NotificationService()

    await service.notify_proposal_funded(
        proposal_id="prop_12345",
        funder_name="Dr. Alice Smith",
        amount="1000.00",
        total_raised="3500.00"
    )
    logger.info("✅ Proposal funded notification sent")

    await service.close()


async def example_payment_received():
    """Example: Notify about payment received"""
    service = NotificationService()

    await service.notify_payment_received(
        user_id="user_001",
        amount="250.00",
        job_id="job_456",
        transaction_hash="0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
        basescan_url="https://sepolia.basescan.org/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    )
    logger.info("✅ Payment received notification sent")

    await service.close()


async def example_fragment_claimed():
    """Example: Notify about research fragment being claimed"""
    service = NotificationService()

    await service.notify_fragment_claimed(
        proposal_id="prop_12345",
        fragment_id="fragment_789",
        researcher_id="researcher_002"
    )
    logger.info("✅ Fragment claimed notification sent")

    await service.close()


async def example_results_published():
    """Example: Notify about research results publication"""
    service = NotificationService()

    await service.notify_results_published(
        proposal_id="prop_12345",
        ipfs_hash="QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX"
    )
    logger.info("✅ Results published notification sent")

    await service.close()


async def example_bulk_email():
    """Example: Send bulk email using Resend API"""
    service = NotificationService()

    recipients = [
        {"email": "researcher@example.com", "name": "Dr. Jane Doe"},
        {"email": "funder@example.com", "name": "John Investor"},
    ]

    template_data = {
        "title": "Quantum Algorithm for Portfolio Optimization",
        "funder_name": "Dr. Alice Smith",
        "amount": "1000.00",
        "total_raised": "3500.00",
        "proposal_url": "http://localhost:3000/proposals/prop_12345"
    }

    success = await service.send_bulk_email(
        recipients=recipients,
        template_type="proposal_funded",
        data=template_data
    )

    if success:
        logger.info("✅ Bulk email sent successfully")
    else:
        logger.error("❌ Failed to send bulk email")

    await service.close()


async def main():
    """Run all examples"""
    logger.info("=" * 60)
    logger.info("NotificationService Examples")
    logger.info("=" * 60)

    # Run each example
    examples = [
        ("New Proposal", example_new_proposal),
        ("Proposal Funded", example_proposal_funded),
        ("Payment Received", example_payment_received),
        ("Fragment Claimed", example_fragment_claimed),
        ("Results Published", example_results_published),
        ("Bulk Email", example_bulk_email),
    ]

    for name, example_func in examples:
        logger.info(f"\n--- Running: {name} ---")
        try:
            await example_func()
        except Exception as e:
            logger.error(f"❌ Error in {name}: {e}", exc_info=True)

    logger.info("\n" + "=" * 60)
    logger.info("All examples completed!")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
