# NotificationService Documentation

## Overview

The `NotificationService` is a multi-channel notification system for the quantum research crowdfunding platform. It sends notifications across three channels:

1. **Email** (via Resend API)
2. **WebSocket** (real-time browser updates)
3. **GossipSub PubSub** (peer-to-peer network broadcasts)

All notifications are persisted to MongoDB for audit trail and user notification history.

## Features

- Multi-channel notification delivery
- HTML email templates with professional styling
- Bulk email sending (up to 100 recipients per batch)
- WebSocket broadcast to online users
- P2P network broadcasts via GossipSub
- MongoDB persistence for notification history
- Graceful error handling (logs failures, doesn't crash)
- Rate limit handling for Resend API

## Configuration

### Environment Variables

Required variables in `.env`:

```bash
# Resend API (Email Notifications)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=onboarding@resend.dev  # For dev; use verified domain for prod
RESEND_TO_EMAIL=your-email@example.com

# MongoDB (already configured)
QB2_MONGODB_LOCAL_URI=mongodb://127.0.0.1:27017
QB2_MONGODB_DATABASE=qds

# Platform URL (for email links)
PLATFORM_BASE_URL=http://localhost:3000
```

### Getting Resend API Key

1. Sign up at https://resend.com/signup
2. Navigate to "API Keys" in dashboard
3. Create new API key (starts with "re_")
4. Free tier: 100 emails/day, 3,000/month
5. For development: use `onboarding@resend.dev` (pre-verified sender)
6. For production: verify your own domain in Resend dashboard

## Usage

### Basic Initialization

```python
from services.notification_service import NotificationService

# Initialize service
service = NotificationService()

# Optional: Provide GossipSub client for P2P broadcasts
service = NotificationService(pubsub_client=my_pubsub_client)
```

### Notification Methods

#### 1. New Proposal Notification

Notifies all users about a new research proposal.

```python
await service.notify_new_proposal({
    "proposal_id": "prop_12345",
    "title": "Quantum Algorithm for Portfolio Optimization",
    "description": "Research exploring quantum annealing...",
    "researcher_id": "researcher_001",
    "researcher_wallet": "0x1234...",
    "budget_required": Decimal("5000.00"),
    "funding_threshold": Decimal("2500.00"),
    "deadline": datetime.now(timezone.utc) + timedelta(days=30)
})
```

**Channels:**
- Email to users with `notification_preferences.new_proposals = True`
- WebSocket broadcast to all connected users
- GossipSub broadcast on "proposals" topic

#### 2. Proposal Funded Notification

Notifies researcher and funders about funding contributions.

```python
await service.notify_proposal_funded(
    proposal_id="prop_12345",
    funder_name="Dr. Alice Smith",
    amount="1000.00",
    total_raised="3500.00"
)
```

**Recipients:**
- Proposal researcher
- All existing funders
- WebSocket broadcast

#### 3. Payment Received Notification

Notifies user about received payment.

```python
await service.notify_payment_received(
    user_id="user_001",
    amount="250.00",
    job_id="job_456",
    transaction_hash="0xabcdef...",
    basescan_url="https://sepolia.basescan.org/tx/0xabcdef..."
)
```

**Features:**
- Includes BaseScan URL for blockchain verification
- WebSocket notification if user is online

#### 4. Fragment Claimed Notification

Notifies proposal owner that a researcher claimed a fragment.

```python
await service.notify_fragment_claimed(
    proposal_id="prop_12345",
    fragment_id="fragment_789",
    researcher_id="researcher_002"
)
```

**Recipients:**
- Original proposal owner

#### 5. Results Published Notification

Notifies all stakeholders about published research results.

```python
await service.notify_results_published(
    proposal_id="prop_12345",
    ipfs_hash="QmT5NvUtoM5nWFfrQdVrFtvGfKFmG7AHE8P34isapyhCxX"
)
```

**Recipients:**
- Proposal researcher
- All funders
- WebSocket broadcast
- GossipSub broadcast

### Low-Level: Send Bulk Email

```python
recipients = [
    {"email": "user1@example.com", "name": "User One"},
    {"email": "user2@example.com", "name": "User Two"},
]

template_data = {
    "title": "Proposal Title",
    "amount": "1000.00",
    "proposal_url": "http://localhost:3000/proposals/prop_123"
}

success = await service.send_bulk_email(
    recipients=recipients,
    template_type="proposal_funded",
    data=template_data
)
```

### Cleanup

```python
# Close HTTP client and MongoDB connections
await service.close()
```

## Email Templates

Five professional HTML email templates are included:

1. **new_proposal**: New research proposal notification
2. **proposal_funded**: Funding contribution notification
3. **payment_received**: Payment received notification
4. **fragment_claimed**: Research fragment claimed notification
5. **results_published**: Research results published notification

Each template supports variable substitution using Python's `.format()` method.

### Template Variables

#### new_proposal
- `title`, `researcher_name`, `budget_required`, `funding_threshold`, `deadline`, `description`, `proposal_url`

#### proposal_funded
- `title`, `funder_name`, `amount`, `total_raised`, `proposal_url`

#### payment_received
- `amount`, `job_title`, `transaction_hash`, `basescan_url`

#### fragment_claimed
- `researcher_name`, `fragment_title`, `proposal_title`, `proposal_url`

#### results_published
- `title`, `ipfs_hash`, `ipfs_url`, `proposal_url`

## MongoDB Schema

### notifications Collection

```javascript
{
  "user_id": "user_001",
  "type": "payment_received",  // or: payment_sent, proposal_funded, proposal_milestone, job_completed, agent_action, wallet_low_balance, system_alert, other
  "title": "Payment Received: 250.00 USDC",
  "message": "💰 You received 250.00 USDC for job #456",
  "data": {
    "amount": "250.00",
    "job_id": "job_456",
    "transaction_hash": "0xabcdef...",
    "basescan_url": "https://..."
  },
  "read": false,
  "sent_email": true,
  "email_sent_at": ISODate("2026-05-20T12:00:00Z"),
  "created_at": ISODate("2026-05-20T12:00:00Z")
}
```

**Indexes:**
- `user_id`
- `user_id + read`
- `user_id + created_at` (descending)
- `type`
- `created_at` (descending)

## Integration Examples

### FastAPI Endpoint

```python
from fastapi import APIRouter, Depends
from services.notification_service import get_notification_service

router = APIRouter()

@router.post("/proposals/{proposal_id}/fund")
async def fund_proposal(
    proposal_id: str,
    amount: Decimal,
    notification_service: NotificationService = Depends(get_notification_service)
):
    # Process funding...
    
    # Send notification
    await notification_service.notify_proposal_funded(
        proposal_id=proposal_id,
        funder_name=current_user.display_name,
        amount=str(amount),
        total_raised=str(proposal.budget_raised)
    )
    
    return {"status": "success"}
```

### Background Task

```python
from fastapi import BackgroundTasks
from services.notification_service import get_notification_service

async def process_payment(payment_data: dict, background_tasks: BackgroundTasks):
    # Process payment...
    
    # Schedule notification as background task
    background_tasks.add_task(
        notify_payment,
        payment_data["user_id"],
        payment_data["amount"],
        payment_data["job_id"]
    )

async def notify_payment(user_id: str, amount: str, job_id: str):
    service = get_notification_service()
    await service.notify_payment_received(
        user_id=user_id,
        amount=amount,
        job_id=job_id,
        transaction_hash="0x...",
        basescan_url="https://..."
    )
```

### With GossipSub PubSub

```python
from quantum_backend_v2.libp2p.pubsub import create_gossipsub_pubsub
from services.notification_service import NotificationService

# Create GossipSub client
gossipsub, pubsub = create_gossipsub_pubsub(host)

# Initialize notification service with pubsub
service = NotificationService(pubsub_client=pubsub)

# Notifications will now broadcast via P2P network
await service.notify_new_proposal(proposal)
```

## Error Handling

The service handles errors gracefully:

- **Email failures**: Logged but don't crash the service
- **WebSocket failures**: Skips offline users
- **GossipSub failures**: Logged, continues with other channels
- **MongoDB failures**: Logged per notification document
- **Missing configuration**: Warnings logged, channels disabled

## Rate Limits

### Resend API

- **Free tier**: 100 emails/day, 3,000/month
- **Batch limit**: 100 emails per request
- **Rate limit**: The service automatically batches emails (first 100 recipients)

To handle larger batches:

```python
# Split recipients into chunks of 100
chunks = [recipients[i:i+100] for i in range(0, len(recipients), 100)]

for chunk in chunks:
    await service.send_bulk_email(
        recipients=chunk,
        template_type="new_proposal",
        data=template_data
    )
```

## Testing

Run the example script:

```bash
cd /path/to/backend/src
python -m services.notification_service_example
```

This will test all notification methods with sample data.

## Security Considerations

1. **Email validation**: Always validate user email addresses before sending
2. **API keys**: Store `RESEND_API_KEY` securely, never commit to git
3. **Rate limiting**: Monitor Resend API usage to avoid hitting limits
4. **PII handling**: Email addresses are personal data - handle per GDPR/privacy policies
5. **Template injection**: Template data is sanitized by Resend API

## Future Enhancements

Potential improvements:

1. **Email preferences**: Per-user notification preferences (stored in `PlatformUserDocument`)
2. **Email templates**: Add more templates for different event types
3. **Retry logic**: Implement exponential backoff for failed email sends
4. **Queue system**: Use Celery/RQ for async notification processing
5. **Analytics**: Track email open/click rates via Resend webhooks
6. **SMS notifications**: Add Twilio integration for SMS alerts
7. **Push notifications**: Add mobile push via Firebase Cloud Messaging

## Troubleshooting

### Emails not sending

1. Check `RESEND_API_KEY` is set correctly
2. Verify `RESEND_FROM_EMAIL` is verified in Resend dashboard (or use `onboarding@resend.dev` for dev)
3. Check Resend API logs at https://resend.com/logs
4. Verify recipient email format is valid
5. Check rate limits (100/day for free tier)

### WebSocket not working

1. Ensure `ConnectionManager` is initialized in your FastAPI app
2. Check WebSocket endpoint is properly configured
3. Verify user session IDs match between notification service and WebSocket connections

### GossipSub not broadcasting

1. Verify `pubsub_client` is passed to `NotificationService.__init__()`
2. Check GossipSub is properly initialized and started
3. Ensure topic "proposals" is subscribed by peers

## Support

For issues or questions:
- Check logs for error messages
- Verify environment variables are set
- Test with example script first
- Review Resend API docs: https://resend.com/docs
