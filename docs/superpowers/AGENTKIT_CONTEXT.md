# AgentKit Integration Context - Complete Project Brief

**READ THIS FIRST** when starting a new chat about this project in any IDE (Claude Code, Cursor, etc.)

---

## 🎯 What We're Building

**Name**: Crypto-Enabled Quantum Research Crowdfunding Platform

**In One Sentence**: Transform the distributed quantum compute platform into a decentralized research marketplace where workers earn USDC, users pay transparently, AI agents fund research, and researchers crowdfund experiments with auto-fragmentation.

---

## 📍 Current State

### Project Info
- **Repository**: `/Users/soham-bhoir/Desktop/code/projects/py-libp2p_quantum-computing/nodes-quantum-gates`
- **Branch**: `feat/agentkit-integration`
- **Base Branch**: `main`
- **Started**: 2026-05-20

### Existing Platform (DO NOT MODIFY)
- **Backend**: Python 3.11, FastAPI, py-libp2p (Trio), Qiskit, MongoDB (Beanie)
- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui
- **Orchestration**: Coordinator + worker nodes via libp2p streams, GossipSub pubsub
- **Research**: QAOA portfolio optimization demonstrating quantum advantage

**CRITICAL**: All new features are **ADDITIVE**. We're adding 5 new services, NOT modifying existing quantum orchestration code.

---

## 🏗️ Architecture Overview

### Four Features Being Added

**A) Worker Marketplace** - Workers earn USDC for quantum compute  
**B) Payment Infrastructure** - Fee-free stablecoin payments via Base network  
**C) AI Research Agents** - Autonomous agents analyze & fund research  
**D) Research Crowdfunding** - Community funds experiments with auto-fragmentation *(NOVEL FEATURE)*

### Technology Stack

#### Blockchain
- **Network**: Base (Coinbase L2)
  - Testnet: Base Sepolia (chainId: 84532)
  - Mainnet: Base Mainnet (chainId: 8453)
- **Why Base**: Fee-free USDC transfers, 2-second finality, Ethereum-compatible
- **Block Explorer**: https://sepolia.basescan.org (testnet), https://basescan.org (mainnet)

#### Wallet & Payments
- **SDK**: Coinbase AgentKit Python (`coinbase-agentkit`)
- **Custody**: Platform-managed wallets (encrypted seeds via AgentKit)
- **Escrow**: Aave V3 (supply/withdraw USDC, earns 3-5% APY)
- **Currency**: USDC (primary), ETH (gas)

#### AI & Automation
- **Model**: Claude 3.5 Sonnet (`anthropic.claude-3-5-sonnet-20241022-v2:0`)
- **Platform**: AWS Bedrock (NOT OpenAI)
- **Use Cases**:
  - Proposal analysis (should agent fund this?)
  - Auto-fragmentation (break large research into 3-5 sub-experiments)
  - Coalition formation (coordinate multiple agents)
  - Result summarization (executive summaries)

#### Notifications
- **Email**: Resend (3,000 free emails/month)
- **Real-time**: WebSocket
- **P2P**: GossipSub (existing libp2p infrastructure)

#### Storage
- **Database**: MongoDB (existing, all new collections added here)
- **Research Results**: IPFS via Web3.Storage

---

## 📂 Repository Structure

### New Files Being Added

```
backend/
├── src/
│   ├── services/
│   │   ├── agentkit_service.py          ← NEW: Wallet ops, payments, Aave escrow
│   │   ├── marketplace_service.py       ← NEW: Worker routing, pricing
│   │   ├── proposal_service.py          ← NEW: Crowdfunding, fragmentation
│   │   ├── ai_agent_service.py          ← NEW: Autonomous agents (Bedrock)
│   │   └── notification_service.py      ← NEW: Email, WebSocket, GossipSub
│   │
│   ├── api/v1/
│   │   ├── wallet.py                    ← NEW: 6 wallet endpoints
│   │   ├── marketplace.py               ← NEW: 4 marketplace endpoints
│   │   ├── proposals.py                 ← NEW: 8 proposal endpoints
│   │   ├── agents.py                    ← NEW: 6 agent endpoints
│   │   └── notifications.py             ← NEW: 4 notification endpoints
│   │
│   ├── models/
│   │   ├── wallet.py                    ← NEW: Pydantic schemas
│   │   ├── payment.py                   ← NEW: Pydantic schemas
│   │   ├── proposal.py                  ← NEW: Pydantic schemas
│   │   ├── agent.py                     ← NEW: Pydantic schemas
│   │   └── notification.py              ← NEW: Pydantic schemas
│   │
│   └── utils/
│       ├── ipfs.py                      ← NEW: IPFS upload helper
│       └── basescan.py                  ← NEW: URL formatter
│
├── prompts/                             ← NEW DIRECTORY
│   ├── README.md                        ← Usage guidelines
│   ├── proposal_analysis.txt            ← Agent funding decisions
│   ├── auto_fragmentation.txt           ← Research splitting
│   ├── coalition_formation.txt          ← Multi-agent coordination
│   └── result_summarization.txt         ← Result summaries
│
└── tests/
    ├── services/
    │   ├── test_agentkit_service.py     ← NEW
    │   ├── test_marketplace_service.py  ← NEW
    │   ├── test_ai_agent_service.py     ← NEW
    │   └── test_proposal_service.py     ← NEW
    └── integration/
        └── test_payment_flows.py        ← NEW

docs/
└── superpowers/
    ├── specs/
    │   └── 2026-05-20-agentkit-crowdfunding-design.md  ← FULL SPEC (read this!)
    └── AGENTKIT_CONTEXT.md              ← THIS FILE

PROGRESS.md                               ← TASK TRACKER (update as you go!)
```

### Existing Files (Enhanced, Not Rewritten)

```
backend/src/
├── services/
│   ├── circuit_service.py               ← ADD: cost estimation, payment escrow
│   └── job_service.py                   ← ADD: payment tracking fields
│
└── models/
    └── job.py                            ← ADD: payment_estimate, payment_status fields
```

---

## 🗄️ MongoDB Schema

### New Collections

#### 1. `wallets`
Stores AgentKit wallets for users, workers, and AI agents.

```javascript
{
  "_id": ObjectId,
  "entity_id": "user_123",              // user/worker/agent ID
  "entity_type": "user",                // "user" | "worker" | "agent"
  "wallet_id": "wallet-uuid",           // AgentKit wallet ID
  "default_address": "0xABC...",        // Ethereum address
  "network": "base-sepolia",
  "seed_encrypted": "...",              // Encrypted by AgentKit
  "balance_usdc": Decimal128(100.50),
  "balance_eth": Decimal128(0.05),
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Indexes**: `entity_id` (unique), `default_address` (unique), `entity_type`

#### 2. `worker_pricing`
Worker compute pricing and reputation.

```javascript
{
  "_id": ObjectId,
  "worker_id": "worker_xyz",
  "wallet_address": "0xDEF...",
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

**Indexes**: `worker_id` (unique), `is_active`, `pricing.*`, `reputation_score`

#### 3. `research_proposals`
Research proposals with crowdfunding and fragmentation.

```javascript
{
  "_id": ObjectId,
  "proposal_id": "prop_uuid",
  "title": "QAOA Scaling Study: 100-Asset Portfolios",
  "description": "...",
  "researcher_id": "user_123",
  "researcher_wallet": "0xABC...",
  "researcher_reputation": 85.5,
  "methodology": "...",
  "budget_required": Decimal128(50.0),
  "budget_raised": Decimal128(25.0),
  "funding_threshold": Decimal128(30.0),  // 60% to start
  "deadline": ISODate,
  "status": "funding",                    // "open" | "funding" | "funded" | "executing" | "completed"
  "tags": ["QAOA", "portfolio-optimization"],
  
  "fragments": [                          // AUTO-GENERATED BY CLAUDE 3.5
    {
      "fragment_id": "frag_1",
      "title": "Test 40-asset portfolios",
      "methodology": "...",
      "budget": Decimal128(10.0),
      "status": "completed",
      "claimed_by": "user_456",
      "claimed_at": ISODate,
      "completed_at": ISODate,
      "results_ipfs": "QmXyz..."
    }
  ],
  
  "funders": [                            // USERS + AI AGENTS
    {
      "funder_id": "user_999",
      "funder_type": "user",
      "amount": Decimal128(10.0),
      "funded_at": ISODate,
      "transaction_hash": "0x...",
      "basescan_url": "https://sepolia.basescan.org/tx/0x..."
    }
  ],
  
  "escrow_type": "aave",
  "aave_pool_address": "0xESCROW...",
  "results_ipfs_hash": null,
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Indexes**: `proposal_id` (unique), `researcher_id`, `status`, `tags`, `fragments.fragment_id`, `fragments.status`

#### 4. `ai_agents`
Autonomous AI agents with wallets and budgets.

```javascript
{
  "_id": ObjectId,
  "agent_id": "agent_uuid",
  "owner_id": "user_123",
  "agent_name": "QAOA Research Agent",
  "wallet_id": "wallet_uuid",
  "wallet_address": "0xGHI...",
  "config": {
    "auto_fund": true,
    "max_per_proposal": Decimal128(10.0),
    "daily_budget": Decimal128(50.0),
    "research_interests": ["QAOA"],
    "min_reputation_threshold": 60.0
  },
  "spending_history": [
    {
      "proposal_id": "prop_123",
      "amount": Decimal128(5.0),
      "funded_at": ISODate,
      "outcome": "success",
      "reasoning": "Strong methodology..."
    }
  ],
  "total_spent": Decimal128(45.50),
  "created_at": ISODate,
  "updated_at": ISODate
}
```

**Indexes**: `agent_id` (unique), `owner_id`, `config.auto_fund`, `config.research_interests`

#### 5. `payments`
All payment transactions.

```javascript
{
  "_id": ObjectId,
  "payment_id": "pay_uuid",
  "type": "job_payment",                 // "job_payment" | "proposal_funding" | "worker_earnings"
  "from_wallet": "0xABC...",
  "to_wallet": "0xDEF...",
  "amount": Decimal128(5.50),
  "currency": "USDC",
  "status": "completed",
  "job_id": "job_123",                   // Optional
  "proposal_id": "prop_456",             // Optional
  "transaction_hash": "0x...",
  "basescan_url": "https://...",
  "block_number": 1234567,
  "gas_used": Decimal128(0.0001),
  "created_at": ISODate,
  "completed_at": ISODate,
  "error_message": null
}
```

**Indexes**: `payment_id` (unique), `from_wallet`, `to_wallet`, `job_id`, `proposal_id`, `status`, `created_at`

#### 6. `notifications`
User notifications.

```javascript
{
  "_id": ObjectId,
  "user_id": "user_123",
  "type": "new_proposal",                // "new_proposal" | "proposal_funded" | "payment_received" | "job_completed"
  "title": "New Research Proposal",
  "message": "QAOA Scaling Study needs $50 USDC",
  "data": { "proposal_id": "prop_123" },
  "read": false,
  "sent_email": true,
  "email_sent_at": ISODate,
  "created_at": ISODate
}
```

**Indexes**: `user_id`, `read`, `type`, `created_at`

---

## 🔑 Environment Variables

### Required New Variables

```bash
# AgentKit / CDP
CDP_API_KEY_NAME=your_cdp_key_name
CDP_API_KEY_PRIVATE_KEY=your_cdp_private_key
PLATFORM_WALLET_ADDRESS=0x...
PLATFORM_WALLET_SEED=encrypted_seed

# Email Notifications
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

### Where to Get Keys

1. **CDP API Keys**: https://portal.cdp.coinbase.com (create account, generate API key)
2. **Resend**: https://resend.com (sign up, get API key from dashboard)
3. **AWS Bedrock**: AWS Console → IAM → Create user with Bedrock permissions
4. **Web3.Storage**: https://web3.storage (sign up, generate token)

---

## 🚀 Implementation Phases

### Phase 1: Payment Infrastructure
**Goal**: Wallet creation, USDC transfers, Basescan verification

**Key Deliverables**:
- AgentKit service with 7 methods
- Wallet API with 6 endpoints
- Payment tracking in MongoDB
- Transactions visible on Basescan

**Success Criteria**:
- Create wallet → fund with testnet → transfer USDC → see on Basescan

### Phase 2: Worker Marketplace
**Goal**: Workers register pricing, jobs auto-route to cheapest, payments distributed

**Key Deliverables**:
- Marketplace service with 6 methods
- Marketplace API with 4 endpoints
- Job cost estimation integrated
- Worker reputation system

**Success Criteria**:
- Worker registers $0.001/hadamard → job submits → routes to worker → worker gets paid

### Phase 3: AI Research Agents
**Goal**: Autonomous AI agents analyze proposals, make funding decisions

**Key Deliverables**:
- AI agent service with 6 methods
- AWS Bedrock integration (Claude 3.5 Sonnet)
- Agent API with 6 endpoints
- Spending limits enforced

**Success Criteria**:
- Agent created → proposal submitted → agent analyzes (Bedrock) → agent funds if interested

### Phase 4: Research Crowdfunding
**Goal**: Proposal submission, auto-fragmentation, multi-researcher claiming, IPFS publishing

**Key Deliverables**:
- Proposal service with 10 methods
- Notification service (email + WebSocket + GossipSub)
- IPFS integration
- Aave escrow

**Success Criteria**:
- Proposal created → auto-fragmented (Bedrock) → funded by users+agents → researchers claim fragments → results published to IPFS

---

## 💡 Key Design Decisions

### 1. Why Platform-Managed Wallets?
- **Simplicity**: Users don't manage private keys
- **UX**: Instant onboarding
- **Trade-off**: Platform is custodian (acceptable for MVP)
- **Future**: Add self-custodial option in Phase 5

### 2. Why Aave for Escrow?
- **No custom contracts**: Aave V3 deployed on Base, audited
- **Earns yield**: 3-5% APY while funds locked
- **Instant withdrawals**: No timelock delays
- **Alternative**: If Aave has issues, fall back to direct transfers + MongoDB tracking

### 3. Why AWS Bedrock (Not OpenAI)?
- **Cost**: 50% cheaper than GPT-4
- **Quality**: Claude 3.5 Sonnet > GPT-4 for reasoning
- **Latency**: Regional endpoints (faster)
- **Flexibility**: Multi-model support (not locked to OpenAI)

### 4. Why Base Network?
- **Fee-free USDC**: No transaction fees for USDC transfers
- **Fast**: 2-second finality
- **Ethereum-compatible**: Same tooling, audits
- **Coinbase-native**: Tight AgentKit integration

---

## 🧪 Testing Strategy

### Unit Tests
- Each service has 6-12 tests
- Mock external dependencies (Bedrock, Aave, Basescan)
- Test error handling extensively

### Integration Tests
- Full payment flow (user → worker)
- Marketplace routing logic
- Agent funding decision
- Proposal crowdfunding

### End-to-End Tests
- Job submission → payment → worker earnings
- Proposal creation → funding → fragmentation → execution → results

### Manual Testing Checklist
- [ ] Create wallet via API
- [ ] Request testnet funds
- [ ] Transfer USDC between wallets
- [ ] Verify transaction on Basescan
- [ ] Submit proposal
- [ ] Auto-fragment with Bedrock
- [ ] Agent analyzes and funds
- [ ] Claim fragment
- [ ] Submit results to IPFS

---

## 📊 Progress Tracking

**Primary Tracker**: `/PROGRESS.md` (107 tasks across 4 phases)

**How to Use**:
1. Open `PROGRESS.md`
2. Find current phase
3. Check off tasks as you complete them
4. Update "Last Updated" timestamp
5. Add any blockers to "Known Issues" section

**When to Update**:
- After completing any task
- When hitting a blocker
- At end of each work session
- Before switching contexts (to another IDE, etc.)

---

## 🔍 How to Start Working

### First Time Setup
1. Checkout branch: `git checkout feat/agentkit-integration`
2. Read design spec: `docs/superpowers/specs/2026-05-20-agentkit-crowdfunding-design.md`
3. Open progress tracker: `PROGRESS.md`
4. Start with Phase 1, Task 1: "Install coinbase-agentkit"

### Resuming Work
1. Read this file (AGENTKIT_CONTEXT.md)
2. Check `PROGRESS.md` for last completed task
3. Review design spec if needed for specific details
4. Continue from next unchecked task

### When Switching IDEs/Chats
1. **Before leaving**: Update `PROGRESS.md` with completed tasks
2. **On return**: Read this context file, check progress tracker
3. **If confused**: Read design spec section for current phase

---

## 🎯 Success Metrics

### Phase 1
- [ ] 100% wallet creation success
- [ ] 0 failed transfers
- [ ] <5 sec transaction finality
- [ ] All txns visible on Basescan

### Phase 2
- [ ] 80%+ jobs use cheapest workers
- [ ] <1 min payment distribution
- [ ] Reputation scores correlate with success

### Phase 3
- [ ] <10 sec proposal analysis
- [ ] 70%+ agent-funded proposals succeed
- [ ] 100% budget compliance

### Phase 4
- [ ] 50%+ proposals reach funding threshold
- [ ] 90%+ auto-fragmentation success
- [ ] 100% email delivery
- [ ] <24 hr result publishing to IPFS

---

## 🐛 Common Issues & Solutions

### Issue: "Operation not permitted" in shell
**Solution**: Terminal permissions issue. Try `cd` to repo first, then retry command.

### Issue: AgentKit wallet creation fails
**Solution**: Check CDP API keys in `.env`, verify testnet is `base-sepolia` not `base-mainnet`.

### Issue: Bedrock returns 403 Forbidden
**Solution**: Check IAM permissions for Bedrock model access. Model ID must be exact: `anthropic.claude-3-5-sonnet-20241022-v2:0`

### Issue: Email notifications not sending
**Solution**: Verify Resend API key, check sender email is verified in Resend dashboard.

### Issue: Transaction not showing on Basescan
**Solution**: Wait 10-20 seconds for block confirmation. Verify network is Base Sepolia (`chainId: 84532`).

---

## 📚 Key Resources

### Documentation
- **Full Design Spec**: `/docs/superpowers/specs/2026-05-20-agentkit-crowdfunding-design.md` (comprehensive technical spec)
- **Progress Tracker**: `/PROGRESS.md` (task-by-task checklist)
- **This Context File**: `/docs/superpowers/AGENTKIT_CONTEXT.md` (you're reading it!)

### External Docs
- **AgentKit**: https://docs.cdp.coinbase.com/agentkit/docs/welcome
- **Base Network**: https://docs.base.org
- **AWS Bedrock**: https://docs.aws.amazon.com/bedrock/latest/userguide/
- **Aave V3**: https://docs.aave.com/developers/getting-started/readme
- **Resend**: https://resend.com/docs
- **Web3.Storage**: https://web3.storage/docs

### Tools
- **Basescan Sepolia**: https://sepolia.basescan.org (testnet explorer)
- **Basescan Mainnet**: https://basescan.org (production explorer)
- **CDP Portal**: https://portal.cdp.coinbase.com (wallet management)
- **Resend Dashboard**: https://resend.com/emails (email logs)
- **AWS Console**: https://console.aws.amazon.com/bedrock (model access)

---

## 🤝 Communication Protocol

### Working with This System

**When you (AI assistant) start a new chat**:
1. Read this context file FIRST
2. Check `PROGRESS.md` for current status
3. Ask user: "I see we're on Phase X, Task Y. Should I continue from there?"
4. Proceed based on user confirmation

**When user switches IDEs/assistants**:
- User will provide this file path: `/docs/superpowers/AGENTKIT_CONTEXT.md`
- You load it and immediately understand full context
- No need for user to re-explain project

**When completing tasks**:
- Update `PROGRESS.md` immediately
- Mark task with `[x]` checkbox
- Add timestamp to "Last Updated"
- Note any blockers in "Known Issues"

---

## 🎉 What Makes This Special

**Novel Combination**: No existing platform combines:
1. Blockchain payments for scientific compute
2. AI agents with autonomous funding decisions
3. GPT-powered auto-fragmentation of research
4. Multi-researcher crowdfunding with escrow

**This is a FIRST** in the intersection of:
- Quantum computing
- Decentralized science (DeSci)
- AI-powered research allocation
- Blockchain finance

---

## 🚨 Important Reminders

1. **DO NOT MODIFY EXISTING QUANTUM CODE** - All features are additive
2. **ALWAYS UPDATE PROGRESS.MD** - It's our source of truth
3. **TEST ON BASESCAN** - Every payment should be verifiable on-chain
4. **USE AWS BEDROCK, NOT OPENAI** - Cheaper and better
5. **BASE NETWORK, NOT ETHEREUM** - Fee-free USDC transfers
6. **PLATFORM-MANAGED WALLETS** - No user key management (for now)
7. **MONGODB, NOT POSTGRES** - All new data goes to MongoDB
8. **AAVE FOR ESCROW** - Don't write custom contracts

---

**Last Updated**: 2026-05-20  
**Maintained By**: Soham + Claude  
**Version**: 1.0

---

## 📝 Quick Command Reference

```bash
# Switch to feature branch
git checkout feat/agentkit-integration

# Install AgentKit
cd backend
uv add coinbase-agentkit

# Add AWS SDK for Bedrock
uv add boto3

# Check MongoDB collections
# (Use MongoDB Compass or CLI to verify collections exist)

# Run backend tests
cd backend
uv run pytest

# Check transaction on Basescan
# Visit: https://sepolia.basescan.org/tx/{transaction_hash}

# View progress
cat PROGRESS.md | grep "\[ \]" | head -10  # Next 10 uncompleted tasks
```

---

**YOU'RE READY TO BUILD! 🚀**

Start with Phase 1, Task 1 in `PROGRESS.md` and let's ship this!
