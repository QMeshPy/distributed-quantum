---
title: Crypto-Enabled Quantum Research Crowdfunding Platform
date: 2026-05-20
status: approved
branch: feature/agentkit-integration
author: Claude + Soham
version: 1.0
---

# Crypto-Enabled Quantum Research Crowdfunding Platform

## Executive Summary

Transform the distributed quantum compute platform into a **decentralized research marketplace** where:
- **Workers monetize compute** - quantum workers earn USDC for circuit execution
- **Users pay transparently** - fee-free stablecoin payments on Base network
- **AI agents fund research** - autonomous agents analyze and fund promising proposals
- **Researchers crowdfund experiments** - community funding with auto-fragmentation into smaller tasks

This is implemented as **additive features** - no modifications to existing quantum orchestration or frontend code.

---

## Problem Statement

Current platform challenges:
1. **No monetization** - workers provide compute for free, unsustainable
2. **No research funding** - researchers without capital can't run experiments
3. **Resource allocation** - no mechanism to prioritize high-value research
4. **Manual coordination** - researchers must manually split work across collaborators

---

## Solution Architecture

### Four-Phase Implementation

```
Phase 1: Payment Infrastructure (A+B foundation)
├─ AgentKit SDK integration
├─ Wallet management for users/workers/agents
├─ USDC payment execution (Base network)
├─ Email notification system (Resend)
└─ Worker marketplace with pricing

Phase 2: Worker Marketplace (A completion)
├─ Worker pricing registration
├─ Job cost estimation
├─ Automatic payment distribution
└─ Earnings dashboard

Phase 3: AI Research Agents (C)
├─ Agent wallet creation
├─ GPT-4 proposal analysis
├─ Autonomous funding decisions
└─ Spending limits & coalition formation

Phase 4: Research Crowdfunding (D - Novel Feature)
├─ Proposal submission & discovery
├─ Direct crowdfunding mechanism
├─ Agent coalition funding
├─ GPT-4 powered auto-fragmentation
├─ Multi-researcher fragment claiming
├─ Email/GossipSub/WebSocket notifications
├─ IPFS result publishing
└─ Aave-based escrow OR direct transfers
```

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│            Next.js Operator Console (Frontend)              │
│  NEW: /wallet, /marketplace, /proposals, /agents, /earnings │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              FastAPI Backend (Python 3.11)                   │
│                                                              │
│  NEW SERVICES (all net-new files):                          │
│  • agentkit_service.py    - Wallet ops, payments, escrow    │
│  • marketplace_service.py - Worker routing, pricing         │
│  • proposal_service.py    - Crowdfunding, fragmentation     │
│  • ai_agent_service.py    - Autonomous funding decisions    │
│  • notification_service.py - Email, WebSocket, GossipSub    │
│                                                              │
│  py-libp2p Runtime: GossipSub broadcasts proposals/pricing  │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ Worker Node  │ │ Worker Node  │ │ Worker Node  │
   │ + AgentKit   │ │ + AgentKit   │ │ + AgentKit   │
   │ Wallet       │ │ Wallet       │ │ Wallet       │
   └──────────────┘ └──────────────┘ └──────────────┘

Persistence: MongoDB (all data) + IPFS (research results)
Blockchain: Base Sepolia (testnet) → Base Mainnet (production)
```

---

## Technology Stack

### Blockchain Layer
- **Network**: Base (Coinbase L2)
  - Testnet: Base Sepolia (chainId: 84532)
  - Mainnet: Base Mainnet (chainId: 8453)
- **Why Base?**
  - Fee-free USDC transfers
  - 2-second finality
  - Built by Coinbase (tight AgentKit integration)
  - Ethereum-compatible

### Smart Contracts
**Decision: Use Aave V3 for escrow** (deployed on Base, battle-tested)

Alternative considered: Custom escrow contracts via OpenZeppelin
- Aave chosen for: no custom code, earns yield (3-5% APY), audited

### Wallet Management
- **SDK**: Coinbase AgentKit Python SDK
- **Custody Model**: Platform-managed wallets (MVP)
  - Platform holds encrypted wallet seeds
  - Users don't manage private keys
  - Future: Add self-custodial option
- **Actions Used** (from AgentKit's 50+ actions):
  - `create_wallet` - Create wallets
  - `get_balance` - Check USDC/ETH balances
  - `transfer` - Send USDC payments
  - `request_faucet_funds` - Testnet funding
  - `trade` - Token swaps (ETH ↔ USDC)
  - `aave_supply` - Escrow funds (earn yield)
  - `aave_withdraw` - Release escrow

### Email Notifications
- **Provider**: Resend
- **Why Resend?**
  - Modern API, great DX
  - Free tier: 3,000 emails/month
  - React Email templates
  - Alternative: SendGrid (more enterprise features)

### AI Decision Engine
- **Model**: Claude 3.5 Sonnet (AWS Bedrock)
- **Why Bedrock?**
  - No vendor lock-in (multi-model support)
  - AWS infrastructure integration
  - Lower latency (regional endpoints)
  - Better cost control
  - Claude 3.5 Sonnet > GPT-4 for reasoning
- **Use Cases**:
  - Analyze research proposals
  - Make autonomous funding decisions
  - Auto-fragment large research into sub-experiments
- **Integration**: Works with AgentKit for wallet operations

---

## Database Schema (MongoDB)

### New Collections

#### 1. Wallets
```javascript
{
  "_id": ObjectId,
  "entity_id": "user_123",              // Can be user/worker/agent
  "entity_type": "user",                // "user" | "worker" | "agent"
  "wallet_id": "wallet-uuid-from-agentkit",
  "default_address": "0xABC123...",     // Ethereum address
  "network": "base-sepolia",            // "base-sepolia" | "base-mainnet"
  "seed_encrypted": "enc_seed_data",    // Encrypted by AgentKit
  "balance_usdc": Decimal128(100.50),   // Cached balance
  "balance_eth": Decimal128(0.05),
  "created_at": ISODate("2026-05-20T10:00:00Z"),
  "updated_at": ISODate("2026-05-20T12:00:00Z")
}
```

**Indexes**:
- `entity_id` (unique)
- `default_address` (unique)
- `entity_type`

#### 2. Worker Pricing
```javascript
{
  "_id": ObjectId,
  "worker_id": "worker_xyz",            // References existing worker
  "wallet_address": "0xDEF456...",
  "pricing": {
    "hadamard": Decimal128(0.001),      // USDC per operation
    "cnot": Decimal128(0.002),
    "qft": Decimal128(0.01),
    "teleport": Decimal128(0.015),
    "custom": Decimal128(0.005)
  },
  "performance_tier": "fast",           // "fast" | "balanced" | "cheap"
  "reputation_score": 95.5,             // 0-100, starts at 50
  "total_earned": Decimal128(250.75),
  "jobs_completed": 42,
  "is_active": true,
  "published_at": ISODate,
  "updated_at": ISODate
}
```

**Indexes**:
- `worker_id` (unique)
- `is_active`
- `pricing.hadamard`, `pricing.cnot`, etc. (for cheapest-worker queries)
- `reputation_score` (descending)

#### 3. Research Proposals
```javascript
{
  "_id": ObjectId,
  "proposal_id": "prop_uuid",
  "title": "QAOA Scaling Study: 100-Asset Portfolios",
  "description": "Test whether QAOA maintains advantage at 100+ assets...",
  "researcher_id": "user_123",
  "researcher_wallet": "0xABC...",
  "researcher_reputation": 85.5,        // 0-100 score
  "methodology": "Run 500 trials with varying parameters...",
  "expected_results": "Expect quantum advantage at 80+ assets",
  "budget_required": Decimal128(50.0),  // Total USDC needed
  "budget_raised": Decimal128(25.0),    // Current funding
  "funding_threshold": Decimal128(30.0), // Min to start (60% of total)
  "deadline": ISODate("2026-06-20"),
  "status": "funding",                   // "open" | "funding" | "funded" | "executing" | "completed" | "cancelled"
  "tags": ["QAOA", "portfolio-optimization", "scaling"],
  
  // FRAGMENTATION (auto-generated by GPT-4)
  "fragments": [
    {
      "fragment_id": "frag_1",
      "title": "Test 40-asset portfolios",
      "methodology": "Run 100 trials on 40-asset portfolios",
      "budget": Decimal128(10.0),
      "status": "completed",
      "claimed_by": "user_456",
      "claimed_at": ISODate,
      "completed_at": ISODate,
      "results_ipfs": "QmXyz..."
    },
    {
      "fragment_id": "frag_2",
      "title": "Test 60-asset portfolios",
      "budget": Decimal128(10.0),
      "status": "executing",
      "claimed_by": "user_789",
      "claimed_at": ISODate
    },
    {
      "fragment_id": "frag_3",
      "title": "Test 80-asset portfolios",
      "budget": Decimal128(15.0),
      "status": "open",
      "claimed_by": null
    }
  ],
  
  // FUNDING (direct users + AI agents)
  "funders": [
    {
      "funder_id": "user_999",
      "funder_type": "user",
      "amount": Decimal128(10.0),
      "funded_at": ISODate,
      "transaction_hash": "0x789...",
      "basescan_url": "https://sepolia.basescan.org/tx/0x789..."
    },
    {
      "funder_id": "agent_ai1",
      "funder_type": "agent",
      "amount": Decimal128(15.0),
      "funded_at": ISODate,
      "transaction_hash": "0xABC..."
    }
  ],
  
  "escrow_type": "aave",                 // "aave" | "direct"
  "aave_pool_address": "0xESCROW...",    // If using Aave
  "results_ipfs_hash": null,             // Published when complete
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Indexes**:
- `proposal_id` (unique)
- `researcher_id`
- `status`
- `tags` (multikey)
- `deadline`
- `fragments.fragment_id`
- `fragments.status`

#### 4. AI Agents
```javascript
{
  "_id": ObjectId,
  "agent_id": "agent_uuid",
  "owner_id": "user_123",               // User who owns this agent
  "agent_name": "QAOA Research Agent",
  "wallet_id": "wallet_uuid",
  "wallet_address": "0xGHI...",
  "config": {
    "auto_fund": true,                  // Auto-analyze new proposals
    "max_per_proposal": Decimal128(10.0), // USDC limit per proposal
    "daily_budget": Decimal128(50.0),
    "research_interests": ["QAOA", "portfolio-optimization"],
    "min_reputation_threshold": 60.0    // Only fund researchers above this
  },
  "spending_history": [
    {
      "proposal_id": "prop_123",
      "amount": Decimal128(5.0),
      "funded_at": ISODate,
      "outcome": "success",             // "success" | "pending" | "cancelled"
      "reasoning": "Strong methodology, aligns with interests"
    }
  ],
  "total_spent": Decimal128(45.50),
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Indexes**:
- `agent_id` (unique)
- `owner_id`
- `config.auto_fund`
- `config.research_interests` (multikey)

#### 5. Payments
```javascript
{
  "_id": ObjectId,
  "payment_id": "pay_uuid",
  "type": "job_payment",                // "job_payment" | "proposal_funding" | "worker_earnings"
  "from_wallet": "0xABC...",
  "to_wallet": "0xDEF...",
  "amount": Decimal128(5.50),
  "currency": "USDC",                   // "USDC" | "ETH"
  "status": "completed",                // "pending" | "escrowed" | "completed" | "failed"
  "job_id": "job_123",                  // Optional: links to existing job
  "proposal_id": "prop_456",            // Optional: links to proposal
  "transaction_hash": "0x789...",
  "basescan_url": "https://sepolia.basescan.org/tx/0x789...",
  "block_number": 1234567,
  "gas_used": Decimal128(0.0001),
  "created_at": ISODate,
  "completed_at": ISODate,
  "error_message": null
}
```

**Indexes**:
- `payment_id` (unique)
- `from_wallet`
- `to_wallet`
- `job_id`
- `proposal_id`
- `status`
- `created_at` (descending)

#### 6. Notifications
```javascript
{
  "_id": ObjectId,
  "user_id": "user_123",
  "type": "new_proposal",               // "new_proposal" | "proposal_funded" | "payment_received" | "job_completed" | "fragment_claimed"
  "title": "New Research Proposal",
  "message": "QAOA Scaling Study needs $50 USDC",
  "data": {                             // Additional context
    "proposal_id": "prop_123",
    "budget": 50.0,
    "tags": ["QAOA"]
  },
  "read": false,
  "sent_email": true,
  "email_sent_at": ISODate,
  "created_at": ISODate
}
```

**Indexes**:
- `user_id`
- `read`
- `type`
- `created_at` (descending)

### Enhanced Existing Collections

#### Jobs Collection (add payment fields)
```javascript
{
  // ...existing fields...
  
  // NEW FIELDS:
  "payment_estimate": Decimal128(2.50),  // Estimated cost before submission
  "payment_status": "paid",              // "pending" | "escrowed" | "paid" | "failed"
  "payment_id": "pay_123",               // References payments collection
  "worker_payments": [                   // Breakdown per worker
    {
      "worker_id": "worker_1",
      "operations": ["hadamard", "cnot"],
      "amount": Decimal128(1.50),
      "payment_id": "pay_456"
    }
  ]
}
```

---

## Backend Implementation

### Directory Structure (New Files Only)

```
backend/src/
├── services/
│   ├── agentkit_service.py          ← NEW: AgentKit SDK wrapper
│   ├── marketplace_service.py       ← NEW: Worker routing, pricing
│   ├── proposal_service.py          ← NEW: Crowdfunding, fragmentation
│   ├── ai_agent_service.py          ← NEW: Autonomous agents
│   └── notification_service.py      ← NEW: Email, WebSocket, GossipSub
│
├── api/v1/
│   ├── wallet.py                    ← NEW: Wallet management
│   ├── marketplace.py               ← NEW: Worker pricing, job routing
│   ├── proposals.py                 ← NEW: Research crowdfunding
│   ├── agents.py                    ← NEW: AI agent management
│   └── notifications.py             ← NEW: Notification preferences
│
├── models/
│   ├── wallet.py                    ← NEW: Wallet Pydantic models
│   ├── payment.py                   ← NEW: Payment models
│   ├── proposal.py                  ← NEW: Proposal models
│   ├── agent.py                     ← NEW: Agent models
│   └── notification.py              ← NEW: Notification models
│
└── utils/
    ├── ipfs.py                      ← NEW: IPFS upload helper
    └── basescan.py                  ← NEW: Basescan URL formatter
```

---

## Core Service Implementations

### 1. AgentKit Service

**File**: `backend/src/services/agentkit_service.py`

**Responsibilities**:
- Wallet creation, import, management
- USDC/ETH transfers
- Balance queries
- Aave escrow operations
- Token swaps
- Faucet requests (testnet)

**Key Methods**:
```python
async def create_wallet(entity_id: str, entity_type: str) -> dict
async def get_balance(wallet_address: str) -> dict
async def transfer_usdc(from_addr: str, to_addr: str, amount: Decimal, metadata: dict) -> dict
async def aave_supply(wallet_addr: str, amount: Decimal, on_behalf_of: str) -> dict
async def aave_withdraw(wallet_addr: str, amount: Decimal, to: str) -> dict
async def request_testnet_funds(wallet_address: str) -> dict
```

**Dependencies**:
- `coinbase-agentkit` (Python SDK)
- MongoDB `wallets` collection
- MongoDB `payments` collection

### 2. Marketplace Service

**File**: `backend/src/services/marketplace_service.py`

**Responsibilities**:
- Worker pricing registration
- Job cost estimation
- Worker routing (find cheapest/fastest)
- Payment distribution to workers
- Reputation score updates

**Key Methods**:
```python
async def register_worker_pricing(worker_id: str, pricing: dict, tier: str)
async def estimate_job_cost(circuit: str) -> dict
async def route_operations(operations: dict) -> list[dict]
async def distribute_payment_to_workers(job_id: str, worker_payments: list)
async def update_worker_reputation(worker_id: str, job_success: bool)
```

**Algorithms**:
- **Worker routing**: Cheapest-first + reputation filter (min score 40)
- **Reputation**: Starts at 50, +2 per success, -5 per failure, bounded 0-100

### 3. Proposal Service (CROWN JEWEL)

**File**: `backend/src/services/proposal_service.py`

**Responsibilities**:
- Proposal submission & validation
- Direct crowdfunding
- Agent coalition funding
- Claude 3.5 Sonnet powered auto-fragmentation (AWS Bedrock)
- Fragment claiming by researchers
- Multi-channel notifications (email, GossipSub, WebSocket)
- IPFS result publishing
- Escrow management (Aave)

**Key Methods**:
```python
async def create_proposal(researcher_id: str, title: str, description: str, 
                          methodology: str, budget: Decimal, tags: list, 
                          auto_fragment: bool = False) -> dict

async def fund_proposal(proposal_id: str, funder_id: str, 
                        funder_type: str, amount: Decimal) -> dict

async def claim_fragment(proposal_id: str, fragment_id: str, 
                         researcher_id: str) -> dict

async def submit_results(proposal_id: str, fragment_id: str | None, 
                         researcher_id: str, results_data: dict) -> dict

async def _auto_fragment_proposal(title: str, methodology: str, 
                                   budget: Decimal) -> list[dict]

async def _broadcast_new_proposal(proposal: dict) -> None

async def _pay_fragment_researcher(proposal_id: str, fragment_id: str) -> None

async def _release_all_escrow(proposal_id: str) -> None
```

**AWS Bedrock Integration**:
```python
# Auto-fragmentation prompt
import boto3
import json

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

prompt = f"""Break this research proposal into 3-5 independent sub-experiments.

Original:
Title: {title}
Methodology: {methodology}
Budget: {budget} USDC

For each fragment, provide:
- title: Short descriptive title
- budget: Fair budget allocation (sum should equal original)
- methodology: What this fragment tests

Respond ONLY with valid JSON (no markdown):
{{
    "fragments": [
        {{"title": "...", "budget": 10.0, "methodology": "..."}},
        ...
    ]
}}"""

response = bedrock.invoke_model(
    modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
    body=json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}]
    })
)

fragments = json.loads(json.loads(response['body'].read())['content'][0]['text'])
```

### 4. AI Agent Service

**File**: `backend/src/services/ai_agent_service.py`

**Responsibilities**:
- Agent creation with wallet
- Claude 3.5 Sonnet proposal analysis (AWS Bedrock)
- Autonomous funding decisions
- Coalition formation with other agents
- Budget management & spending limits

**Key Methods**:
```python
async def create_agent(owner_id: str, agent_name: str, config: dict) -> dict
async def analyze_proposal(agent_id: str, proposal: dict) -> dict
async def form_coalition(proposal_id: str, agent_ids: list) -> dict
async def _execute_funding(agent_id: str, proposal_id: str, amount: Decimal)
async def _get_daily_remaining(agent_id: str) -> Decimal
```

**AWS Bedrock Integration**:
```python
# Proposal analysis prompt
import boto3
import json

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

prompt = f"""You are an AI research agent analyzing a quantum computing research proposal.

Proposal:
Title: {proposal['title']}
Description: {proposal['description']}
Budget: {proposal['budget_required']} USDC
Researcher Reputation: {proposal['researcher_reputation']}
Tags: {proposal['tags']}

Your interests: {agent['config']['research_interests']}
Your budget limits:
- Max per proposal: {agent['config']['max_per_proposal']} USDC
- Daily remaining: {daily_remaining} USDC

Analyze this proposal and decide:
1. Does it align with your research interests?
2. Is the budget reasonable for the scope?
3. Is the researcher reputable enough?
4. Should you fund it? If yes, how much?

Respond ONLY with valid JSON (no markdown, no explanation):
{{
    "should_fund": true/false,
    "funding_amount": 0-10,
    "confidence": 0-100,
    "reasoning": "explanation"
}}"""

response = bedrock.invoke_model(
    modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
    body=json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}]
    })
)

decision = json.loads(json.loads(response['body'].read())['content'][0]['text'])
```

### 5. Notification Service

**File**: `backend/src/services/notification_service.py`

**Responsibilities**:
- Email notifications (Resend API)
- WebSocket real-time notifications
- GossipSub p2p broadcasts
- Notification preferences management

**Key Methods**:
```python
async def notify_new_proposal(proposal: dict)
async def notify_proposal_funded(proposal_id: str, funder_name: str, amount: float)
async def notify_payment_received(user_id: str, amount: float, job_id: str)
async def notify_fragment_claimed(proposal_id: str, fragment_id: str, researcher_id: str)
async def notify_results_published(proposal_id: str, ipfs_hash: str)
async def send_bulk_email(recipients: list, template: str, data: dict)
```

**Email Templates** (Resend):
```python
templates = {
    "new_proposal": {
        "subject": "🔬 New Research: {title}",
        "html": """
        <h2>New Research Proposal on Quantum Network</h2>
        <h3>{title}</h3>
        <p><strong>Budget Needed:</strong> {budget} USDC</p>
        <p><strong>Tags:</strong> {tags}</p>
        <a href="{url}">View Proposal & Fund →</a>
        """
    },
    "proposal_funded": {
        "subject": "✅ Proposal Funded: {title}",
        "html": """
        <h2>Research Proposal Reached Funding Goal!</h2>
        <p>{funder_name} contributed {amount} USDC</p>
        <p>Total raised: {total_raised} / {budget_required} USDC</p>
        <p>Research will begin shortly.</p>
        """
    },
    "payment_received": {
        "subject": "💰 Payment Received: {amount} USDC",
        "html": """
        <h2>You received a payment!</h2>
        <p><strong>Amount:</strong> {amount} USDC</p>
        <p><strong>From:</strong> Job #{job_id}</p>
        <p><strong>Transaction:</strong> <a href="{basescan_url}">View on Basescan</a></p>
        """
    }
}
```

---

## API Endpoints

### Wallet Management (`/api/v1/wallet`)

```python
POST   /wallet/create              # Create wallet for current user
GET    /wallet/balance             # Get wallet balance (USDC + ETH)
POST   /wallet/transfer            # Send USDC to another wallet
POST   /wallet/fund-testnet        # Request testnet faucet funds
GET    /wallet/transactions        # Transaction history
POST   /wallet/export              # Export wallet seed (encrypted)
```

### Marketplace (`/api/v1/marketplace`)

```python
POST   /marketplace/register-pricing       # Worker publishes pricing
GET    /marketplace/workers                # List all workers with pricing
POST   /marketplace/estimate-cost          # Estimate job cost
GET    /marketplace/worker/:id/earnings    # Worker earnings history
```

### Research Proposals (`/api/v1/proposals`)

```python
POST   /proposals                          # Create research proposal
GET    /proposals                          # List all proposals (with filters)
GET    /proposals/:id                      # Get proposal details
POST   /proposals/:id/fund                 # Fund a proposal
POST   /proposals/:id/fragments/:fid/claim # Claim a fragment
POST   /proposals/:id/results              # Submit research results
GET    /proposals/:id/funders              # List proposal funders
POST   /proposals/:id/fragments/generate   # GPT-4 auto-fragment
```

### AI Agents (`/api/v1/agents`)

```python
POST   /agents                    # Create AI agent
GET    /agents                    # List user's agents
GET    /agents/:id                # Get agent details
PUT    /agents/:id/config         # Update agent config
POST   /agents/:id/analyze        # Manually trigger proposal analysis
GET    /agents/:id/spending       # Agent spending history
POST   /agents/:id/coalition      # Form coalition with other agents
```

### Notifications (`/api/v1/notifications`)

```python
GET    /notifications             # Get user notifications
PUT    /notifications/:id/read    # Mark as read
POST   /notifications/preferences # Update email preferences
DELETE /notifications/:id         # Delete notification
```

---

## Frontend Implementation (New Routes Only)

### New Routes

```
/wallet                    → Wallet dashboard, balance, transactions
/marketplace               → Browse workers, see pricing, performance
/proposals                 → Browse research proposals
/proposals/new             → Submit new proposal
/proposals/[id]            → Proposal details, fund, claim fragments
/agents                    → Manage AI research agents
/agents/new                → Create new agent
/agents/[id]               → Agent dashboard, spending history
/earnings                  → Worker earnings dashboard
/notifications             → Notification center
```

### Key Components

```tsx
// Wallet Components
<WalletHeader />           // Balance, address, QR code
<TransactionHistory />     // List of payments with Basescan links
<FundTestnetButton />      // Request faucet funds

// Marketplace Components
<WorkerPricingCard />      // Worker info, pricing, reputation
<JobCostEstimator />       // Live cost calculation

// Proposal Components
<ProposalCard />           // Proposal summary, funding progress
<FundingProgressBar />     // Visual funding status
<FragmentList />           // List of sub-experiments
<FragmentClaimButton />    // Claim a fragment
<FundersList />            // Show all funders (users + agents)

// Agent Components
<AgentCard />              // Agent status, spending, config
<AgentConfigForm />        // Set interests, budgets, thresholds
<SpendingChart />          // Visualize agent spending over time
```

---

## Payment Flows

### 1. Job Payment Flow (Worker Earnings)

```
User submits circuit
    ↓
Backend estimates cost (MarketplaceService)
    ↓
User approves cost
    ↓
Backend escrows payment (transfer to platform wallet)
    ↓
Workers execute circuit fragments
    ↓
Job completes successfully
    ↓
Backend distributes payment to workers (AgentKitService)
    ↓
Workers receive USDC
    ↓
Notification sent (email + WebSocket)
    ↓
Transaction visible on Basescan
```

### 2. Direct Proposal Funding Flow

```
Researcher creates proposal
    ↓
Notification broadcast (email + GossipSub + WebSocket)
    ↓
User decides to fund
    ↓
User sends USDC to Aave pool (on behalf of proposal wallet)
    ↓
Proposal wallet receives aUSDC (yield-bearing)
    ↓
Funding progress updates
    ↓
Threshold reached → status changes to "funded"
    ↓
Researcher executes research
    ↓
Researcher submits results to IPFS
    ↓
Platform withdraws from Aave, sends to researcher
    ↓
Researcher receives original amount + yield earned
```

### 3. AI Agent Coalition Funding Flow

```
Researcher creates proposal
    ↓
Notification broadcast
    ↓
3 AI agents analyze proposal (GPT-4)
    ↓
All 3 decide to fund (confidence > 80%)
    ↓
Agents form coalition (equal split)
    ↓
Each agent transfers to Aave pool
    ↓
Proposal reaches threshold
    ↓
Research executes
    ↓
Results published
    ↓
Agents update outcome: "success"
    ↓
Agents learn: proposals like this are worth funding
```

### 4. Fragment Claiming Flow

```
Proposal created with 4 fragments
    ↓
Researcher A claims fragment 1 (40-asset test)
    ↓
Researcher B claims fragment 2 (60-asset test)
    ↓
Both execute their fragments independently
    ↓
Researcher A submits results to IPFS
    ↓
Fragment 1 marked "completed"
    ↓
Platform releases fragment 1 budget to Researcher A
    ↓
Researcher B submits results
    ↓
Fragment 2 paid out
    ↓
Original proposer aggregates all fragment results
    ↓
Meta-analysis published
```

---

## Escrow Mechanism: Aave V3

### Why Aave?

1. **No custom contracts** - deployed on Base, audited
2. **Earns yield** - 3-5% APY on USDC while in escrow
3. **Instant withdrawals** - no timelock delays
4. **AgentKit integration** - built-in actions

### How It Works

```python
# 1. Fund proposal (user → Aave on behalf of proposal wallet)
await agentkit.aave_supply(
    wallet_address=funder_wallet,
    asset="USDC",
    amount="10.0",
    on_behalf_of=proposal_wallet  # Proposal gets aUSDC
)

# 2. Research completes
await agentkit.aave_withdraw(
    wallet_address=proposal_wallet,
    asset="USDC",
    amount="-1",  # -1 = withdraw all
    to=researcher_wallet
)

# Researcher receives original + yield!
```

### Aave Deployment Addresses (Base)

**Base Sepolia (Testnet)**:
- Pool: `0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b`
- USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

**Base Mainnet**:
- Pool: `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

### Alternative: Direct Transfers

If Aave integration has issues:

```python
# Escrow = platform wallet
PLATFORM_ESCROW_WALLET = os.getenv("PLATFORM_WALLET_ADDRESS")

# Fund proposal
await agentkit.transfer_usdc(
    from_address=funder_wallet,
    to_address=PLATFORM_ESCROW_WALLET,
    amount="10.0"
)

# Track in MongoDB
await payments_collection.insert_one({
    "status": "escrowed",
    "proposal_id": proposal_id,
    "amount": Decimal("10.0"),
    "locked_until": "research_complete"
})

# Release escrow
await agentkit.transfer_usdc(
    from_address=PLATFORM_ESCROW_WALLET,
    to_address=researcher_wallet,
    amount="10.0"
)
```

---

## Notification System

### Multi-Channel Strategy

**1. Email (Resend)**
- New proposals created
- Proposals reach funding threshold
- Payments received
- Fragments claimed
- Results published

**2. WebSocket (Real-time)**
- Online users get instant notifications
- Live funding progress updates
- Job completion alerts

**3. GossipSub (P2P Network)**
- All nodes notified of new proposals
- Worker pricing updates broadcast
- Decentralized discovery

### User Preferences

```javascript
// notification_preferences collection
{
  "user_id": "user_123",
  "email_enabled": true,
  "preferences": {
    "new_proposals": true,
    "proposals_funded": true,
    "payments_received": true,
    "fragments_claimed": false,
    "weekly_digest": true
  }
}
```

---

## IPFS Integration

### Result Publishing

```python
# backend/src/utils/ipfs.py

import httpx

class IPFSService:
    """Upload research results to IPFS via Web3.Storage or Pinata"""
    
    def __init__(self):
        self.api_key = os.getenv("WEB3_STORAGE_API_KEY")
        self.base_url = "https://api.web3.storage"
    
    async def upload_json(self, data: dict) -> str:
        """Upload JSON data, return IPFS hash"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/upload",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=data
            )
            return response.json()["cid"]  # Content ID (IPFS hash)
    
    def get_gateway_url(self, ipfs_hash: str) -> str:
        """Get public gateway URL"""
        return f"https://{ipfs_hash}.ipfs.w3s.link"
```

### Research Result Schema

```javascript
// Stored on IPFS
{
  "proposal_id": "prop_123",
  "fragment_id": "frag_1" | null,
  "researcher_id": "user_456",
  "title": "QAOA 40-Asset Portfolio Test",
  "methodology": "...",
  "results": {
    "trials_completed": 100,
    "quantum_advantage": true,
    "avg_runtime_ms": 1800,
    "accuracy": 0.95,
    "raw_data_url": "https://..."
  },
  "conclusions": "Quantum advantage confirmed at 40+ assets",
  "submitted_at": "2026-05-21T10:00:00Z"
}
```

---

## Security Considerations

### Wallet Security
- ✅ Seeds encrypted by AgentKit (industry-standard)
- ✅ Platform-managed wallets (no user key management)
- ✅ Future: Add self-custodial option (user manages keys)
- ⚠️ Platform compromise = all wallets at risk (mitigated by encryption)

### Payment Security
- ✅ All transactions on-chain (transparent, auditable)
- ✅ Basescan verification
- ✅ Aave escrow (battle-tested)
- ✅ No off-chain payment processing

### API Security
- ✅ JWT authentication (existing)
- ✅ Rate limiting on wallet operations
- ✅ Spending limits per agent (config.max_per_proposal)
- ✅ Approval workflows for large transfers (future)

### Smart Contract Security
- ✅ Aave V3 audited by Trail of Bits, OpenZeppelin, ABDK
- ✅ No custom contracts = no custom vulnerabilities
- ⚠️ Aave risk: protocol-level bugs (low probability)

---

## Testing Strategy

### Unit Tests
```python
# backend/tests/services/test_agentkit_service.py
async def test_create_wallet():
    service = AgentKitService()
    wallet = await service.create_wallet("user_1", "user")
    assert wallet["default_address"].startswith("0x")

# backend/tests/services/test_marketplace_service.py
async def test_estimate_job_cost():
    service = MarketplaceService()
    cost = await service.estimate_job_cost("OPENQASM 2.0; qreg q[2]; h q[0]; cx q[0],q[1];")
    assert cost["total_usdc"] > 0
```

### Integration Tests
```python
# backend/tests/integration/test_payment_flow.py
async def test_full_payment_flow():
    # Create wallets
    user = await agentkit.create_wallet("user", "user")
    worker = await agentkit.create_wallet("worker", "worker")
    
    # Fund user
    await agentkit.fund_testnet_wallet(user["address"])
    await asyncio.sleep(30)  # Wait for faucet
    
    # Submit job
    job = await submit_job(circuit, user_id)
    
    # Wait for completion
    await wait_for_job_completion(job["id"])
    
    # Verify worker received payment
    balance = await agentkit.get_balance(worker["address"])
    assert balance["usdc"] > 0
```

### End-to-End Tests
```python
# backend/tests/e2e/test_research_crowdfunding.py
async def test_proposal_crowdfunding_flow():
    # Create proposal
    proposal = await proposal_service.create_proposal(...)
    
    # 2 users fund it
    await proposal_service.fund_proposal(proposal_id, user1, "user", 10.0)
    await proposal_service.fund_proposal(proposal_id, user2, "user", 15.0)
    
    # Verify funding threshold reached
    updated = await get_proposal(proposal_id)
    assert updated["status"] == "funded"
    
    # Submit results
    await proposal_service.submit_results(proposal_id, None, researcher_id, results)
    
    # Verify researcher received funds
    balance = await agentkit.get_balance(researcher_wallet)
    assert balance["usdc"] >= 25.0  # Original + yield
```

---

## Deployment Strategy

### Environment Variables

```bash
# .env
# Existing vars...

# NEW: AgentKit / CDP
CDP_API_KEY_NAME=your_cdp_key_name
CDP_API_KEY_PRIVATE_KEY=your_cdp_private_key
PLATFORM_WALLET_ADDRESS=0x...  # Platform's main wallet
PLATFORM_WALLET_SEED=encrypted_seed

# Email
RESEND_API_KEY=re_...

# AI (AWS Bedrock)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0

# IPFS
WEB3_STORAGE_API_KEY=eyJ...

# Network
NETWORK=base-sepolia  # or base-mainnet
```

### Branch Strategy

```bash
main
  └─ feature/agentkit-integration
       ├─ phase-1-payment-infrastructure
       ├─ phase-2-marketplace
       ├─ phase-3-ai-agents
       └─ phase-4-crowdfunding
```

### Deployment Checklist

**Phase 1 (Payment Infrastructure)**:
1. ✅ Get CDP API keys from https://portal.cdp.coinbase.com
2. ✅ Install `coinbase-agentkit` via `uv add`
3. ✅ Create platform wallet (testnet)
4. ✅ Fund platform wallet via faucet
5. ✅ Set up Resend account, get API key
6. ✅ Test wallet creation
7. ✅ Test USDC transfers
8. ✅ Verify transactions on Basescan
9. ✅ Deploy to staging
10. ✅ Mainnet deployment (after testnet validation)

**Phase 2 (Marketplace)**:
1. ✅ Create worker test wallets
2. ✅ Register worker pricing
3. ✅ Test job cost estimation
4. ✅ Test payment distribution
5. ✅ Deploy worker earnings dashboard

**Phase 3 (AI Agents)**:
1. ✅ Set up AWS Bedrock access (IAM permissions)
2. ✅ Create test agent
3. ✅ Test Claude 3.5 Sonnet proposal analysis
4. ✅ Test autonomous funding
5. ✅ Set up spending limits

**Phase 4 (Crowdfunding)**:
1. ✅ Test proposal creation
2. ✅ Test auto-fragmentation (Claude 3.5 Sonnet via Bedrock)
3. ✅ Test email notifications
4. ✅ Test GossipSub broadcasts
5. ✅ Get Web3.Storage API key
6. ✅ Test IPFS uploads
7. ✅ Test Aave escrow (or direct transfers)
8. ✅ Full end-to-end demo

---

## Cost Analysis

### Gas Costs (Base Sepolia → Mainnet)

| Operation | Testnet | Mainnet | Notes |
|-----------|---------|---------|-------|
| USDC Transfer | $0.01 | $0.01 | Fee-free on Base! |
| Aave Supply | $0.02 | $0.02 | Smart contract call |
| Aave Withdraw | $0.02 | $0.02 | Smart contract call |
| Wallet Creation | $0 | $0 | Off-chain |

**Total per proposal**:
- 5 funders × $0.02 = $0.10
- 1 escrow release × $0.02 = $0.02
- **Total: $0.12** in gas fees

### Operational Costs

| Service | Free Tier | Paid |
|---------|-----------|------|
| AgentKit/CDP | Free | Free (just gas) |
| Resend Email | 3,000/month | $20/month (50k emails) |
| AWS Bedrock (Claude 3.5) | Pay-per-use | ~$0.015 per analysis (50% cheaper than GPT-4) |
| Web3.Storage | 5GB free | $1/month per 100GB |
| MongoDB Atlas | 512MB free | $9/month (2GB) |

**Estimated monthly cost** (100 proposals/month):
- Emails: $0 (under free tier)
- AWS Bedrock: 100 × $0.015 = $1.50
- IPFS: $0 (under free tier)
- MongoDB: $9
- **Total: ~$10.50/month** (15% cheaper with Bedrock)

### Revenue Model (Future)

- **Platform fee**: 2% of proposal budgets
- **Premium agents**: $10/month for advanced agents
- **Worker fees**: 1% of earnings

---

## Success Metrics

### Phase 1 (Payment Infrastructure)
- ✅ 100% of wallets created successfully
- ✅ 0 failed USDC transfers
- ✅ <5 second transaction finality
- ✅ All transactions visible on Basescan

### Phase 2 (Marketplace)
- ✅ 80%+ of jobs use cheapest workers
- ✅ Workers receive payment within 1 minute of job completion
- ✅ Reputation scores correlate with job success rate

### Phase 3 (AI Agents)
- ✅ Agents analyze proposals in <10 seconds
- ✅ 70%+ of agent-funded proposals complete successfully
- ✅ Agents stay within spending limits (100% compliance)

### Phase 4 (Crowdfunding)
- ✅ 50%+ of proposals reach funding threshold
- ✅ Auto-fragmentation works for 90%+ of proposals
- ✅ 100% of email notifications delivered
- ✅ Results published to IPFS within 24 hours of completion

---

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| AgentKit API downtime | High | Low | Fallback to direct Web3.py |
| Base network outage | High | Very Low | Multi-chain support (future) |
| Aave protocol bug | Medium | Very Low | Regular audits, insurance fund |
| GPT-4 API rate limits | Medium | Medium | Queue system, backoff |
| Email deliverability | Low | Medium | Use Resend + SendGrid as backup |
| MongoDB Atlas outage | High | Low | Regular backups, multi-region |
| Insufficient testnet funds | Low | High | Multiple faucet sources |

---

## Future Enhancements

### Phase 5: Advanced Features
- ✅ Multi-signature wallets for large proposals
- ✅ Reputation NFTs for researchers
- ✅ Proposal voting (governance)
- ✅ Cross-chain support (Ethereum, Arbitrum)
- ✅ Self-custodial wallet option
- ✅ Agent coalitions with voting
- ✅ Proposal milestones (staged funding)

### Phase 6: Scaling
- ✅ Regional backend clusters (US, EU, Asia)
- ✅ Cluster synchronization via GossipSub
- ✅ Global worker pool discovery
- ✅ Sharded MongoDB for scale

---

## Conclusion

This design transforms the quantum compute platform into a **decentralized research marketplace** with:

1. **Worker monetization** - sustainable compute economy
2. **Transparent payments** - on-chain, verifiable via Basescan
3. **AI-powered funding** - autonomous agents allocate capital efficiently
4. **Community crowdfunding** - anyone can fund breakthrough research
5. **Auto-fragmentation** - large research splits into manageable tasks
6. **Multi-researcher collaboration** - fragments claimed independently

**Key Innovation**: The crowdfunding + fragmentation + AI agent system is **novel** - no existing platform combines these three elements for scientific research funding.

**Timeline**: 
- Phase 1-2: 2 weeks
- Phase 3: 1 week
- Phase 4: 2 weeks
- **Total: 5 weeks to full deployment**

**Demo Tomorrow**: Build Phase 1 payment flow + simple crowdfunding MVP (16 hours of focused work)

---

## Appendix A: API Request/Response Examples

### Create Wallet
```bash
POST /api/v1/wallet/create
Authorization: Bearer <jwt>

Response:
{
  "wallet_id": "wallet-uuid",
  "address": "0xABC123...",
  "network": "base-sepolia"
}
```

### Fund Proposal
```bash
POST /api/v1/proposals/prop_123/fund
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "amount": 10.5
}

Response:
{
  "payment_id": "pay_456",
  "transaction_hash": "0x789...",
  "basescan_url": "https://sepolia.basescan.org/tx/0x789...",
  "status": "completed"
}
```

### Create Proposal
```bash
POST /api/v1/proposals
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "title": "QAOA Scaling Study",
  "description": "Test quantum advantage at 100+ assets",
  "methodology": "Run 500 trials...",
  "budget_required": 50.0,
  "tags": ["QAOA", "portfolio-optimization"],
  "auto_fragment": true
}

Response:
{
  "proposal_id": "prop_789",
  "title": "QAOA Scaling Study",
  "status": "open",
  "budget_required": 50.0,
  "budget_raised": 0.0,
  "funding_threshold": 30.0,
  "fragments": [
    {
      "fragment_id": "frag_1",
      "title": "Test 40-asset portfolios",
      "budget": 10.0,
      "status": "open"
    },
    ...
  ],
  "escrow_type": "aave",
  "aave_pool_address": "0xESCROW..."
}
```

---

## Appendix B: MongoDB Query Patterns

### Find Cheapest Worker for Operation
```javascript
db.worker_pricing.find({
  is_active: true,
  "pricing.hadamard": { $exists: true }
}).sort({ "pricing.hadamard": 1 }).limit(1)
```

### Get User's Unfunded Proposals
```javascript
db.research_proposals.find({
  researcher_id: "user_123",
  status: { $in: ["open", "funding"] },
  budget_raised: { $lt: "$budget_required" }
})
```

### Find Proposals Matching Agent Interests
```javascript
db.research_proposals.find({
  status: "open",
  tags: { $in: agent.config.research_interests },
  researcher_reputation: { $gte: agent.config.min_reputation_threshold }
})
```

---

## Appendix C: Basescan Integration

### Transaction URL Formatter
```python
# backend/src/utils/basescan.py

def get_transaction_url(tx_hash: str, network: str = "base-sepolia") -> str:
    base_urls = {
        "base-sepolia": "https://sepolia.basescan.org",
        "base-mainnet": "https://basescan.org"
    }
    return f"{base_urls[network]}/tx/{tx_hash}"

def get_address_url(address: str, network: str = "base-sepolia") -> str:
    base_urls = {
        "base-sepolia": "https://sepolia.basescan.org",
        "base-mainnet": "https://basescan.org"
    }
    return f"{base_urls[network]}/address/{address}"
```

---

**End of Design Document**
