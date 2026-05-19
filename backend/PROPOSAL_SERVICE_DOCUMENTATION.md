# ProposalService Implementation Documentation

## Overview

The **ProposalService** is the crown jewel of the research crowdfunding platform - the most innovative and complex service in the entire system. It orchestrates quantum research proposals, AI-powered auto-fragmentation, crowdfunding with Aave escrow, and decentralized result publishing via IPFS.

**File Location:** `backend/src/services/proposal_service.py`

---

## Architecture

### Core Technologies
- **AI Engine:** Claude 3.5 Sonnet via AWS Bedrock
- **Database:** MongoDB (research_proposals collection)
- **Blockchain:** Base Sepolia testnet
- **DeFi Integration:** Aave V3 protocol for yield-bearing escrow
- **Storage:** IPFS via Web3.Storage for research results
- **Currency:** USDC (ERC-20 stablecoin)

### Dependencies
```python
from services.agentkit_service import AgentKitService      # Blockchain operations
from services.ai_agent_service import AIAgentService       # AI agent coordination
from services.notification_service import NotificationService  # Multi-channel notifications
from utils.ipfs import get_ipfs_service                    # IPFS storage
from db.agentkit_collections import ResearchProposalDocument, PaymentDocument
```

---

## Methods

### 1. `create_proposal()`

**Purpose:** Create a new research proposal with optional AI auto-fragmentation.

**Signature:**
```python
async def create_proposal(
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
) -> dict
```

**Workflow:**
1. Load researcher wallet from MongoDB
2. Generate unique proposal_id (UUID)
3. Set funding threshold (default: 70% of budget)
4. If `auto_fragment=True`:
   - Call `_auto_fragment_proposal()` with Claude 3.5 Sonnet
   - Parse AI response into 3-5 independent sub-experiments
   - Validate budget allocation across fragments
5. Create `ResearchProposalDocument` with status="active"
6. Save to MongoDB research_proposals collection
7. Broadcast notification via `NotificationService.notify_new_proposal()`
8. Trigger AI agents to analyze proposal via `_broadcast_new_proposal()`

**Returns:**
```python
{
    "proposal_id": "uuid",
    "title": "Research Title",
    "researcher_id": "researcher_123",
    "researcher_wallet": "0x...",
    "budget_required": Decimal("100.0"),
    "funding_threshold": Decimal("70.0"),
    "deadline": datetime,
    "status": "active",
    "fragments": [...],  # If auto_fragment=True
    "escrow_setup": {
        "type": "aave_yield",
        "status": "pending_first_deposit"
    },
    "created_at": datetime
}
```

**Error Handling:**
- Validates researcher wallet exists
- Gracefully continues if auto-fragmentation fails (logs warning)
- Rolls back MongoDB insert if notification fails

---

### 2. `fund_proposal()`

**Purpose:** Fund a proposal with USDC through Aave escrow.

**Signature:**
```python
async def fund_proposal(
    proposal_id: str,
    funder_id: str,
    funder_type: Literal["user", "agent", "worker"],
    amount: Decimal
) -> dict
```

**Workflow:**
1. Load proposal from MongoDB
2. Validate proposal is active and deadline hasn't passed
3. Get funder wallet address
4. Call `AgentKitService.aave_supply()`:
   - Approve USDC spending by Aave pool
   - Deposit USDC to Aave V3 pool
   - Funds held in escrow, earning yield
   - aTokens credited to researcher wallet
5. Update proposal:
   - Increment `budget_raised`
   - Add funder record to `funders` array
   - Store transaction hash
6. Create `PaymentDocument` in payments collection
7. Check if funding threshold reached:
   - If yes: call `_mark_proposal_funded()`
   - Update status to "funded"
8. Notify via `NotificationService.notify_proposal_funded()`

**Returns:**
```python
{
    "proposal_id": "uuid",
    "funder_id": "funder_123",
    "amount": Decimal("50.0"),
    "transaction_hash": "0x...",
    "new_total_raised": Decimal("120.0"),
    "funding_percentage": 120.0,
    "fully_funded": True,
    "timestamp": datetime
}
```

**Error Handling:**
- Validates proposal exists and is active
- Checks deadline hasn't expired
- Verifies funder wallet exists
- Rolls back MongoDB updates if Aave transaction fails

---

### 3. `claim_fragment()`

**Purpose:** Allow a researcher to claim a specific fragment for execution.

**Signature:**
```python
async def claim_fragment(
    proposal_id: str,
    fragment_id: str,
    researcher_id: str
) -> dict
```

**Workflow:**
1. Load proposal from MongoDB
2. Validate proposal is "funded" or "in_progress"
3. Find fragment by `fragment_id` in fragments array
4. Check fragment is available (not claimed or completed)
5. Update fragment:
   - Set status="claimed"
   - Set claimed_by=researcher_id
   - Set claimed_at=current timestamp
6. Update proposal status to "in_progress"
7. Save to MongoDB
8. Notify via `NotificationService.notify_fragment_claimed()`

**Returns:**
```python
{
    "proposal_id": "uuid",
    "fragment_id": "fragment_uuid",
    "researcher_id": "researcher_456",
    "fragment_title": "QAOA on 40-asset portfolios",
    "fragment_budget": 20.0,
    "claimed_at": datetime
}
```

**Error Handling:**
- Validates proposal and fragment exist
- Ensures fragment not already claimed
- Prevents claiming completed fragments

---

### 4. `submit_results()`

**Purpose:** Submit research results to IPFS and trigger payment release.

**Signature:**
```python
async def submit_results(
    proposal_id: str,
    researcher_id: str,
    results_data: dict,
    fragment_id: Optional[str] = None
) -> dict
```

**Workflow:**
1. Load proposal from MongoDB
2. Verify researcher is authorized (owns proposal or claimed fragment)
3. Upload results to IPFS via `IPFSService.upload_research_results()`:
   - Uploads JSON data to Web3.Storage
   - Returns Content Identifier (CID) and gateway URL
4. **If fragment submission:**
   - Update fragment: status="completed", results_ipfs_hash
   - Call `_pay_fragment_researcher()`:
     - Withdraw fragment budget from Aave
     - Transfer to fragment researcher wallet
   - Create PaymentDocument
5. **If full proposal submission:**
   - Update proposal: status="completed", results_ipfs_hash
   - Call `_release_all_escrow()`:
     - Withdraw all raised funds from Aave
     - Transfer to proposal researcher wallet
   - Create PaymentDocument
6. Notify via `NotificationService.notify_results_published()`

**Returns:**
```python
{
    "proposal_id": "uuid",
    "fragment_id": "fragment_uuid",  # Optional
    "ipfs_hash": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    "ipfs_url": "https://bafybeigdyrzt....ipfs.w3s.link",
    "payment_released": True,
    "payment_amount": Decimal("20.0"),
    "transaction_hash": "0x...",
    "submitted_at": datetime
}
```

**Error Handling:**
- Validates researcher authorization
- Handles IPFS upload failures gracefully
- Rolls back if payment release fails

---

### 5. `_auto_fragment_proposal()` (Private)

**Purpose:** Use Claude 3.5 Sonnet to break proposal into 3-5 independent sub-experiments.

**Signature:**
```python
async def _auto_fragment_proposal(
    title: str,
    description: str,
    methodology: str,
    budget: Decimal,
    timeline: str,
    tags: list[str]
) -> list[dict]
```

**Workflow:**
1. Load prompt template from `backend/prompts/auto_fragmentation.txt`
2. Replace template variables:
   - `{title}`, `{description}`, `{methodology}`, `{budget}`, `{timeline}`, `{tags}`
3. Call AWS Bedrock:
   - Model: `anthropic.claude-3-5-sonnet-20241022-v2:0`
   - Max tokens: 2048
   - Request JSON response
4. Parse JSON response via `_parse_fragmentation_response()`
5. Validate fragments:
   - Must have 3-5 fragments
   - Budget allocation must sum to total budget
   - Each fragment has required fields
6. Adjust budgets if mismatch detected (proportional allocation)
7. Add metadata to each fragment:
   - Generate fragment_id (UUID)
   - Set status="available"
   - Initialize claimed_by, claimed_at, completed_at, results_ipfs_hash

**Returns:**
```python
[
    {
        "fragment_id": "uuid",
        "title": "QAOA Performance on 40-Asset Portfolios",
        "budget": 20.0,
        "methodology": "Run 200 trials on randomly generated...",
        "deliverables": ["CSV dataset", "Statistical analysis", ...],
        "expected_duration_days": 5,
        "success_criteria": "Achieve >90% solution quality...",
        "status": "available",
        "claimed_by": None,
        "claimed_at": None,
        "completed_at": None,
        "results_ipfs_hash": None
    },
    ...
]
```

**AI Prompt Strategy:**
The AI considers multiple fragmentation dimensions:
- Parameter ranges (e.g., 20-asset, 40-asset, 60-asset portfolios)
- Algorithm variants (e.g., QAOA with different ansatzes)
- Hardware targets (e.g., different quantum backends)
- Data subsets (e.g., different industry sectors)
- Optimization methods (e.g., COBYLA vs Adam vs SPSA)

**Error Handling:**
- Validates AWS Bedrock client initialized
- Parses JSON from markdown code blocks if needed
- Adjusts budget allocation if sum doesn't match
- Raises ValueError if response format invalid

---

### 6. `_broadcast_new_proposal()` (Private)

**Purpose:** Notify AI agents about new proposal for automated analysis.

**Signature:**
```python
async def _broadcast_new_proposal(proposal: dict) -> dict
```

**Workflow:**
1. Import `AIAgentService`
2. Query MongoDB for agents with `config.auto_fund=True`
3. For each active agent:
   - Trigger `AIAgentService.analyze_proposal()` asynchronously
   - Fire-and-forget (don't await) to prevent blocking
   - Each agent independently decides whether to fund
4. Return summary of agents notified

**Returns:**
```python
{
    "proposal_id": "uuid",
    "agents_notified": 5,
    "timestamp": datetime
}
```

**Integration with AI Agents:**
- AI agents analyze proposal against research interests
- Agents check reputation thresholds and spending limits
- Agents can autonomously fund proposals if criteria met
- Agents can form coalitions for collaborative funding

---

### 7. `_pay_fragment_researcher()` (Private)

**Purpose:** Release payment for completed fragment from Aave escrow.

**Signature:**
```python
async def _pay_fragment_researcher(
    proposal_id: str,
    fragment_id: str
) -> dict
```

**Workflow:**
1. Load proposal and find fragment
2. Get fragment budget allocation
3. Get researcher wallet who claimed fragment
4. Call `AgentKitService.aave_withdraw()`:
   - Withdraw fragment budget from Aave pool
   - Transfer USDC to researcher wallet
5. Create `PaymentDocument` with type="escrow_release"
6. Return payment confirmation

**Returns:**
```python
{
    "amount": Decimal("20.0"),
    "transaction_hash": "0x...",
    "researcher_wallet": "0x...",
    "timestamp": datetime
}
```

---

### 8. `_release_all_escrow()` (Private)

**Purpose:** Release all escrowed funds to proposal researcher.

**Signature:**
```python
async def _release_all_escrow(proposal_id: str) -> dict
```

**Workflow:**
1. Load proposal from MongoDB
2. Get total raised amount
3. Call `AgentKitService.aave_withdraw()`:
   - Withdraw all funds from Aave pool
   - Transfer to proposal researcher wallet
   - Includes earned yield from Aave
4. Create `PaymentDocument` with type="escrow_release"
5. Return payment confirmation

**Returns:**
```python
{
    "amount": Decimal("100.0"),  # Includes earned yield
    "transaction_hash": "0x...",
    "researcher_wallet": "0x...",
    "timestamp": datetime
}
```

---

## MongoDB Schema

### ResearchProposalDocument
```python
{
    "proposal_id": str,                    # UUID
    "title": str,
    "description": str,
    "researcher_id": str,
    "researcher_wallet": str,              # Ethereum address
    "methodology": str,
    "budget_required": Decimal128,
    "budget_raised": Decimal128,
    "funding_threshold": Decimal128,
    "deadline": datetime,
    "status": Literal["draft", "active", "funded", "in_progress", "completed", "expired", "cancelled"],
    "tags": list[str],
    "fragments": list[dict],               # Fragment objects
    "funders": list[dict],                 # FunderRecord objects
    "escrow_type": Literal["simple", "aave_yield"],
    "aave_pool_address": str | None,
    "results_ipfs_hash": str | None,
    "created_at": datetime,
    "updated_at": datetime
}
```

### Fragment Object Structure
```python
{
    "fragment_id": str,                    # UUID
    "title": str,
    "budget": float,
    "methodology": str,
    "deliverables": list[str],
    "expected_duration_days": int,
    "success_criteria": str,
    "status": Literal["available", "claimed", "completed"],
    "claimed_by": str | None,
    "claimed_at": datetime | None,
    "completed_at": datetime | None,
    "results_ipfs_hash": str | None
}
```

### Funder Record Structure
```python
{
    "funder_id": str,
    "funder_type": Literal["user", "agent", "worker"],
    "wallet_address": str,
    "amount_usdc": Decimal128,
    "funded_at": datetime,
    "transaction_hash": str
}
```

---

## Integration Points

### AgentKitService Integration
```python
# Aave escrow operations
await agentkit_service.aave_supply(wallet_address, amount, on_behalf_of)
await agentkit_service.aave_withdraw(wallet_address, amount, to)
```

### NotificationService Integration
```python
# Multi-channel notifications (email, WebSocket, GossipSub)
await notification_service.notify_new_proposal(proposal)
await notification_service.notify_proposal_funded(proposal_id, funder_name, amount, total_raised, fully_funded)
await notification_service.notify_fragment_claimed(proposal_id, fragment_id, researcher_id, fragment_title)
await notification_service.notify_results_published(proposal_id, researcher_id, ipfs_url)
```

### AIAgentService Integration
```python
# Trigger autonomous agent analysis
await ai_agent_service.analyze_proposal(agent_id, proposal)
```

### IPFSService Integration
```python
# Decentralized storage
ipfs_service = get_ipfs_service()
result = await ipfs_service.upload_research_results(results_data)
# Returns: {"cid": "bafybeig...", "url": "https://..."}
```

---

## Configuration

### Environment Variables
```bash
# AWS Bedrock (for Claude 3.5 Sonnet)
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

# MongoDB
QB2_MONGODB_LOCAL_URI=mongodb://127.0.0.1:27017
QB2_MONGODB_DATABASE=qds

# IPFS (Web3.Storage)
WEB3_STORAGE_API_KEY=your_api_key

# Blockchain
NETWORK=base-sepolia
CDP_API_KEY_NAME=your_coinbase_api_key_name
CDP_API_KEY_PRIVATE_KEY=your_coinbase_api_key
```

---

## Error Handling Strategy

### Comprehensive Try-Catch Blocks
Every public method has comprehensive error handling:
1. Input validation (ValueError)
2. Database query errors
3. Blockchain transaction failures
4. AI API failures (graceful degradation)
5. IPFS upload failures

### Logging
All critical operations logged with appropriate levels:
- `logger.info()` - Normal operations
- `logger.warning()` - Recoverable issues (e.g., AI fragmentation failure)
- `logger.error()` - Critical failures with full traceback

### Transactional Integrity
- MongoDB operations rolled back if blockchain transactions fail
- Payment records created only after successful blockchain confirmation
- Fragment status updates atomic with payment releases

---

## Testing Recommendations

### Unit Tests
```python
# Test proposal creation
async def test_create_proposal():
    service = ProposalService()
    result = await service.create_proposal(
        researcher_id="test_researcher",
        title="Test Proposal",
        description="Test description",
        methodology="Test methodology",
        budget_required=Decimal("100.0"),
        tags=["quantum", "optimization"]
    )
    assert result["status"] == "active"
    assert result["budget_required"] == Decimal("100.0")
```

### Integration Tests
```python
# Test full funding flow
async def test_funding_flow():
    # 1. Create proposal
    proposal = await service.create_proposal(...)
    
    # 2. Fund proposal
    funding = await service.fund_proposal(
        proposal_id=proposal["proposal_id"],
        funder_id="test_funder",
        funder_type="user",
        amount=Decimal("80.0")
    )
    assert funding["fully_funded"] == True
    
    # 3. Claim fragment
    claim = await service.claim_fragment(...)
    
    # 4. Submit results
    results = await service.submit_results(...)
    assert results["payment_released"] == True
```

---

## Performance Considerations

### Async Operations
- All MongoDB queries use Motor async driver
- Blockchain operations are async (don't block event loop)
- AI agent notifications fire-and-forget (non-blocking)

### Caching
- Consider caching active proposals in Redis
- Cache AI agent configurations for quick lookup
- Cache IPFS gateway URLs

### Batch Operations
- Proposal queries can be batched for AI agent analysis
- Multiple fragment claims can be processed in parallel

---

## Security Considerations

### Wallet Security
- Researcher wallets validated before operations
- Funder authorization checked for all funding operations
- Fragment researchers verified before payment release

### Escrow Safety
- Aave V3 protocol audited by Trail of Bits
- Funds locked until results submitted
- Multi-signature support for high-value proposals (future)

### IPFS Integrity
- Content-addressable storage ensures data immutability
- CIDs cryptographically verify content
- Results can't be tampered after publication

---

## Future Enhancements

### Milestone-Based Funding
- Support progressive funding based on milestone completion
- Partial escrow releases for long-running research

### Reputation System
- Track researcher completion rates
- Weight AI agent decisions by researcher history
- Fragment success rate metrics

### Advanced Fragmentation
- Multi-level fragmentation (fragments of fragments)
- Dependency graphs between fragments
- Parallel execution optimization

### Governance
- Community voting on proposal approvals
- Dispute resolution mechanisms
- Treasury management for platform fees

---

## Summary

The **ProposalService** is a sophisticated orchestration layer that combines:
- 🤖 **AI Intelligence** - Claude 3.5 Sonnet for automated research fragmentation
- 💰 **DeFi Integration** - Aave V3 yield-bearing escrow
- 🔗 **Blockchain Security** - USDC payments on Base Sepolia
- 📦 **Decentralized Storage** - IPFS for research results
- 🔔 **Multi-Channel Notifications** - Email, WebSocket, PubSub
- 🤝 **Agent Coordination** - Autonomous AI funding and coalitions

This creates a complete, production-ready research crowdfunding platform that's unlike anything else in the quantum computing space!
