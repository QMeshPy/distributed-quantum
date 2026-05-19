# NotificationService Integration Guide

## Quick Start

This guide shows how to integrate NotificationService into your FastAPI routes and background tasks.

## Step 1: Import the Service

```python
from services.notification_service import NotificationService, get_notification_service
```

## Step 2: Initialize on App Startup

In your main FastAPI app (`main.py` or `app.py`):

```python
from fastapi import FastAPI
from services.notification_service import NotificationService, set_notification_service

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    # Initialize notification service
    notification_service = NotificationService()
    set_notification_service(notification_service)
    print("✅ NotificationService initialized")

@app.on_event("shutdown")
async def shutdown_event():
    # Cleanup notification service
    from services.notification_service import get_notification_service
    service = get_notification_service()
    await service.close()
    print("👋 NotificationService closed")
```

## Step 3: Use in API Routes

### Example 1: Create New Proposal

```python
from fastapi import APIRouter, Depends, BackgroundTasks
from services.notification_service import get_notification_service, NotificationService

router = APIRouter(prefix="/proposals", tags=["proposals"])

@router.post("/")
async def create_proposal(
    proposal_data: dict,
    background_tasks: BackgroundTasks,
    notification_service: NotificationService = Depends(get_notification_service)
):
    # Save proposal to database
    proposal = await db.research_proposals.insert_one({
        "proposal_id": generate_id(),
        "title": proposal_data["title"],
        "description": proposal_data["description"],
        # ... other fields
        "created_at": datetime.now(timezone.utc)
    })
    
    # Send notifications asynchronously
    background_tasks.add_task(
        notification_service.notify_new_proposal,
        proposal
    )
    
    return {"status": "success", "proposal_id": proposal["proposal_id"]}
```

### Example 2: Fund Proposal

```python
@router.post("/{proposal_id}/fund")
async def fund_proposal(
    proposal_id: str,
    funding_data: dict,
    background_tasks: BackgroundTasks,
    notification_service: NotificationService = Depends(get_notification_service)
):
    # Process funding transaction
    proposal = await db.research_proposals.find_one({"proposal_id": proposal_id})
    
    # Update proposal with new funding
    new_funder = {
        "funder_id": funding_data["funder_id"],
        "wallet_address": funding_data["wallet_address"],
        "amount_usdc": funding_data["amount"],
        "funded_at": datetime.now(timezone.utc)
    }
    
    await db.research_proposals.update_one(
        {"proposal_id": proposal_id},
        {
            "$push": {"funders": new_funder},
            "$inc": {"budget_raised": funding_data["amount"]}
        }
    )
    
    # Get updated proposal
    updated_proposal = await db.research_proposals.find_one({"proposal_id": proposal_id})
    
    # Send notifications
    background_tasks.add_task(
        notification_service.notify_proposal_funded,
        proposal_id=proposal_id,
        funder_name=funding_data["funder_name"],
        amount=str(funding_data["amount"]),
        total_raised=str(updated_proposal["budget_raised"])
    )
    
    return {"status": "success", "total_raised": updated_proposal["budget_raised"]}
```

### Example 3: Process Payment

```python
@router.post("/payments/callback")
async def payment_callback(
    payment_data: dict,
    background_tasks: BackgroundTasks,
    notification_service: NotificationService = Depends(get_notification_service)
):
    # Verify blockchain transaction
    transaction_hash = payment_data["transaction_hash"]
    basescan_url = f"https://sepolia.basescan.org/tx/{transaction_hash}"
    
    # Update payment record
    await db.payments.update_one(
        {"payment_id": payment_data["payment_id"]},
        {
            "$set": {
                "status": "confirmed",
                "transaction_hash": transaction_hash,
                "basescan_url": basescan_url,
                "completed_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Send notification
    background_tasks.add_task(
        notification_service.notify_payment_received,
        user_id=payment_data["to_user_id"],
        amount=str(payment_data["amount"]),
        job_id=payment_data["job_id"],
        transaction_hash=transaction_hash,
        basescan_url=basescan_url
    )
    
    return {"status": "confirmed"}
```

### Example 4: Claim Research Fragment

```python
@router.post("/{proposal_id}/fragments/{fragment_id}/claim")
async def claim_fragment(
    proposal_id: str,
    fragment_id: str,
    researcher_id: str,
    background_tasks: BackgroundTasks,
    notification_service: NotificationService = Depends(get_notification_service)
):
    # Assign fragment to researcher
    await db.research_proposals.update_one(
        {"proposal_id": proposal_id},
        {"$push": {"claimed_fragments": {
            "fragment_id": fragment_id,
            "researcher_id": researcher_id,
            "claimed_at": datetime.now(timezone.utc)
        }}}
    )
    
    # Send notification
    background_tasks.add_task(
        notification_service.notify_fragment_claimed,
        proposal_id=proposal_id,
        fragment_id=fragment_id,
        researcher_id=researcher_id
    )
    
    return {"status": "claimed"}
```

### Example 5: Publish Research Results

```python
@router.post("/{proposal_id}/results/publish")
async def publish_results(
    proposal_id: str,
    results_data: dict,
    background_tasks: BackgroundTasks,
    notification_service: NotificationService = Depends(get_notification_service)
):
    # Upload results to IPFS
    ipfs_hash = await upload_to_ipfs(results_data["file"])
    
    # Update proposal with results
    await db.research_proposals.update_one(
        {"proposal_id": proposal_id},
        {
            "$set": {
                "results_ipfs_hash": ipfs_hash,
                "status": "completed",
                "completed_at": datetime.now(timezone.utc)
            }
        }
    )
    
    # Send notifications
    background_tasks.add_task(
        notification_service.notify_results_published,
        proposal_id=proposal_id,
        ipfs_hash=ipfs_hash
    )
    
    return {
        "status": "published",
        "ipfs_hash": ipfs_hash,
        "ipfs_url": f"https://ipfs.io/ipfs/{ipfs_hash}"
    }
```

## Step 4: Initialize with GossipSub (Optional)

If you want P2P network broadcasts:

```python
from quantum_backend_v2.libp2p.pubsub import create_gossipsub_pubsub
from services.notification_service import NotificationService, set_notification_service

@app.on_event("startup")
async def startup_event():
    # Create libp2p host (existing setup)
    host = await create_libp2p_host()
    
    # Create GossipSub pubsub
    gossipsub, pubsub = create_gossipsub_pubsub(host)
    
    # Start pubsub service
    await pubsub.start()
    
    # Initialize notification service with pubsub
    notification_service = NotificationService(pubsub_client=pubsub)
    set_notification_service(notification_service)
```

## Step 5: User Notification Preferences (Future)

When you add notification preferences to `PlatformUserDocument`:

```python
# In mongodb.py or models.py
class PlatformUserDocument(Document):
    # ... existing fields
    notification_preferences: dict[str, bool] = Field(default_factory=lambda: {
        "new_proposals": True,
        "proposal_funded": True,
        "payment_received": True,
        "fragment_claimed": True,
        "results_published": True,
        "email_enabled": True,
        "websocket_enabled": True
    })
```

Then update the service to check preferences:

```python
# In notification_service.py, notify_new_proposal method:
users_cursor = self.db.platform_users.find({
    "is_active": True,
    "notification_preferences.new_proposals": True,
    "notification_preferences.email_enabled": True
})
```

## Testing Notifications

### Local Testing

1. Set up Resend API key in `.env`:
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=onboarding@resend.dev
RESEND_TO_EMAIL=your-test-email@example.com
```

2. Run the example script:
```bash
cd backend/src
python -m services.notification_service_example
```

3. Check email in your inbox and Resend logs at https://resend.com/logs

### Integration Testing

```python
import pytest
from services.notification_service import NotificationService

@pytest.fixture
async def notification_service():
    service = NotificationService()
    yield service
    await service.close()

@pytest.mark.asyncio
async def test_notify_new_proposal(notification_service):
    proposal = {
        "proposal_id": "test_123",
        "title": "Test Proposal",
        "description": "Test description",
        "researcher_id": "researcher_test",
        "budget_required": Decimal("1000.00"),
        "funding_threshold": Decimal("500.00"),
        "deadline": datetime.now() + timedelta(days=7)
    }
    
    # Should not raise exception
    await notification_service.notify_new_proposal(proposal)
    
    # Check notification was created in MongoDB
    notification = await db.notifications.find_one({"data.proposal_id": "test_123"})
    assert notification is not None
    assert notification["type"] == "other"
```

## Common Patterns

### Pattern 1: Fire-and-Forget (Background Task)

Use FastAPI's `BackgroundTasks` for non-critical notifications:

```python
background_tasks.add_task(
    notification_service.notify_new_proposal,
    proposal
)
```

### Pattern 2: Await Notification (Synchronous)

For critical notifications where you need to know if they were sent:

```python
success = await notification_service.send_bulk_email(
    recipients=recipients,
    template_type="payment_received",
    data=template_data
)

if not success:
    logger.error("Failed to send payment notification email")
    # Maybe retry or alert admin
```

### Pattern 3: Batch Notifications

For sending to many users:

```python
# Get all users who need notification
users = await db.platform_users.find({
    "is_active": True,
    "notification_preferences.new_proposals": True
}).to_list(length=1000)

# Split into batches of 100 (Resend limit)
for i in range(0, len(users), 100):
    batch = users[i:i+100]
    recipients = [{"email": u["email"], "name": u["display_name"]} for u in batch]
    
    await notification_service.send_bulk_email(
        recipients=recipients,
        template_type="new_proposal",
        data=template_data
    )
```

## Troubleshooting

### Issue: Emails not sending

**Check:**
1. `RESEND_API_KEY` is set in `.env`
2. Email is valid format
3. Rate limits not exceeded (100/day free tier)
4. Check Resend logs: https://resend.com/logs

**Solution:**
```bash
# Verify API key
curl https://api.resend.com/emails/batch \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '[{"from":"onboarding@resend.dev","to":["your-email@example.com"],"subject":"Test","html":"<p>Test</p>"}]'
```

### Issue: WebSocket not receiving notifications

**Check:**
1. WebSocket connection is established
2. Session ID matches between connection and notification
3. `ConnectionManager` is initialized

**Solution:**
```python
# Check active WebSocket connections
from quantum_backend_v2.agent.websocket import manager
print(f"Active connections: {manager.active_connections}")
```

### Issue: GossipSub not broadcasting

**Check:**
1. `pubsub_client` is passed to NotificationService
2. GossipSub is started
3. Topic "proposals" is subscribed

**Solution:**
```python
# Verify pubsub is working
topics = await pubsub.get_subscribed_topics()
print(f"Subscribed topics: {topics}")
```

## Environment Variables Checklist

```bash
# Required
✅ RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
✅ QB2_MONGODB_LOCAL_URI=mongodb://127.0.0.1:27017
✅ QB2_MONGODB_DATABASE=qds

# Optional but recommended
✅ RESEND_FROM_EMAIL=onboarding@resend.dev
✅ PLATFORM_BASE_URL=http://localhost:3000
```

## Next Steps

1. ✅ Import NotificationService in your API routes
2. ✅ Add `Depends(get_notification_service)` to endpoints
3. ✅ Use `BackgroundTasks` for async notifications
4. ✅ Configure Resend API key in `.env`
5. ✅ Test with example script
6. ✅ Deploy and monitor Resend logs

## Support

- Resend Docs: https://resend.com/docs
- Resend Logs: https://resend.com/logs
- NotificationService README: `/backend/src/services/README_NOTIFICATION_SERVICE.md`
