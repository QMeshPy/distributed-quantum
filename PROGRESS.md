# AgentKit Integration Implementation Progress

**Branch**: `feat/agentkit-integration`  
**Start Date**: 2026-05-20  
**Design Doc**: `/docs/superpowers/specs/2026-05-20-agentkit-crowdfunding-design.md`

---

## 📊 Overall Progress

- [ ] **Phase 1**: Payment Infrastructure (0/32 tasks)
- [ ] **Phase 2**: Worker Marketplace (0/18 tasks)
- [ ] **Phase 3**: AI Research Agents (0/22 tasks)
- [ ] **Phase 4**: Research Crowdfunding (0/35 tasks)

**Total Progress**: 0/107 tasks (0%)

---

## 🎯 Phase 1: Payment Infrastructure (A+B Foundation)

**Goal**: AgentKit SDK integration, wallet management, USDC payments on Base network

**Status**: 🔴 Not Started

### Setup & Dependencies (0/8)
- [ ] Install `coinbase-agentkit` Python SDK (`uv add coinbase-agentkit`)
- [ ] Create CDP account at https://portal.cdp.coinbase.com
- [ ] Generate CDP API keys (API Key Name + Private Key)
- [ ] Add CDP credentials to `.env` file
- [ ] Create platform wallet on Base Sepolia testnet
- [ ] Fund platform wallet with testnet ETH + USDC from faucet
- [ ] Set up Resend email account (https://resend.com)
- [ ] Add Resend API key to `.env`

### MongoDB Schema (0/6)
- [ ] Create `wallets` collection with indexes
- [ ] Create `payments` collection with indexes
- [ ] Create `worker_pricing` collection with indexes
- [ ] Create `notifications` collection with indexes
- [ ] Add payment fields to existing `jobs` collection
- [ ] Test MongoDB connection with new collections

### AgentKit Service (0/10)
- [ ] Create `backend/src/services/agentkit_service.py`
- [ ] Implement `create_wallet()` method
- [ ] Implement `get_balance()` method
- [ ] Implement `transfer_usdc()` method
- [ ] Implement `request_testnet_funds()` method
- [ ] Implement `aave_supply()` method (escrow)
- [ ] Implement `aave_withdraw()` method (release)
- [ ] Implement `_load_wallet()` helper
- [ ] Implement `_load_platform_wallet()` helper
- [ ] Write unit tests for all methods

### Wallet Management API (0/6)
- [ ] Create `backend/src/api/v1/wallet.py`
- [ ] Implement `POST /wallet/create` endpoint
- [ ] Implement `GET /wallet/balance` endpoint
- [ ] Implement `POST /wallet/transfer` endpoint
- [ ] Implement `POST /wallet/fund-testnet` endpoint
- [ ] Implement `GET /wallet/transactions` endpoint

### Payment Models (0/2)
- [ ] Create `backend/src/models/wallet.py` (Pydantic schemas)
- [ ] Create `backend/src/models/payment.py` (Pydantic schemas)

### Phase 1 Testing (0/8)
- [ ] Test wallet creation end-to-end
- [ ] Test USDC transfer between 2 test wallets
- [ ] Verify transaction appears on Basescan Sepolia
- [ ] Test balance queries
- [ ] Test faucet funding
- [ ] Test payment tracking in MongoDB
- [ ] Test error handling (insufficient funds, invalid address)
- [ ] Integration test: full payment flow

### Phase 1 Verification (0/2)
- [ ] All 5 services implemented and tested
- [ ] All 6 API endpoints functional and documented

---

## 🛍️ Phase 2: Worker Marketplace (A Completion)

**Goal**: Worker pricing, job routing, automatic payment distribution

**Status**: 🔴 Not Started

### Marketplace Service (0/8)
- [ ] Create `backend/src/services/marketplace_service.py`
- [ ] Implement `register_worker_pricing()` method
- [ ] Implement `estimate_job_cost()` method
- [ ] Implement `route_operations()` method (find cheapest workers)
- [ ] Implement `distribute_payment_to_workers()` method
- [ ] Implement `update_worker_reputation()` method
- [ ] Implement `_find_cheapest_worker()` helper
- [ ] Write unit tests for marketplace logic

### Marketplace API (0/4)
- [ ] Create `backend/src/api/v1/marketplace.py`
- [ ] Implement `POST /marketplace/register-pricing` endpoint
- [ ] Implement `GET /marketplace/workers` endpoint
- [ ] Implement `POST /marketplace/estimate-cost` endpoint

### Job Integration (0/4)
- [ ] Enhance `circuit_service.py` to estimate costs before submission
- [ ] Integrate marketplace routing into job submission
- [ ] Add payment escrow logic to job flow
- [ ] Add payment distribution on job completion

### Phase 2 Testing (0/6)
- [ ] Test worker pricing registration
- [ ] Test cost estimation for sample circuit
- [ ] Test worker routing (picks cheapest)
- [ ] Test payment distribution to multiple workers
- [ ] Test reputation score updates
- [ ] Integration test: job submission → payment → worker earnings

### Phase 2 Verification (0/2)
- [ ] Workers can register pricing and receive payments
- [ ] Jobs automatically route to cheapest workers

---

## 🤖 Phase 3: AI Research Agents (C)

**Goal**: Autonomous AI agents that analyze proposals and make funding decisions

**Status**: 🔴 Not Started

### AWS Bedrock Setup (0/4)
- [ ] Create AWS IAM user with Bedrock permissions
- [ ] Generate AWS access keys
- [ ] Add AWS credentials to `.env`
- [ ] Test Bedrock access with Claude 3.5 Sonnet model

### AI Prompts (Already Done! ✅)
- [x] Create `backend/prompts/` directory
- [x] Create `proposal_analysis.txt` prompt
- [x] Create `auto_fragmentation.txt` prompt
- [x] Create `coalition_formation.txt` prompt
- [x] Create `result_summarization.txt` prompt

### AI Agent Service (0/8)
- [ ] Create `backend/src/services/ai_agent_service.py`
- [ ] Implement prompt loading utility
- [ ] Implement `create_agent()` method
- [ ] Implement `analyze_proposal()` method (calls Bedrock)
- [ ] Implement `form_coalition()` method
- [ ] Implement `_execute_funding()` helper
- [ ] Implement `_get_daily_remaining()` helper
- [ ] Write unit tests with mocked Bedrock responses

### AI Agent API (0/6)
- [ ] Create `backend/src/api/v1/agents.py`
- [ ] Implement `POST /agents` endpoint (create agent)
- [ ] Implement `GET /agents` endpoint (list user's agents)
- [ ] Implement `GET /agents/:id` endpoint
- [ ] Implement `PUT /agents/:id/config` endpoint
- [ ] Implement `POST /agents/:id/analyze` endpoint (manual trigger)

### Agent Models (0/1)
- [ ] Create `backend/src/models/agent.py` (Pydantic schemas)

### Phase 3 Testing (0/6)
- [ ] Test agent creation with wallet
- [ ] Test proposal analysis (mock Bedrock response)
- [ ] Test autonomous funding decision
- [ ] Test spending limit enforcement
- [ ] Test daily budget tracking
- [ ] Integration test: agent analyzes proposal → funds it automatically

### Phase 3 Verification (0/2)
- [ ] Agents can analyze proposals using Claude 3.5 Sonnet
- [ ] Agents autonomously fund proposals within budget limits

---

## 🔬 Phase 4: Research Crowdfunding (D - Novel Feature!)

**Goal**: Proposal submission, crowdfunding, auto-fragmentation, multi-researcher claiming

**Status**: 🔴 Not Started

### IPFS Setup (0/3)
- [ ] Create Web3.Storage account (https://web3.storage)
- [ ] Generate Web3.Storage API key
- [ ] Add IPFS credentials to `.env`

### IPFS Utility (0/2)
- [ ] Create `backend/src/utils/ipfs.py`
- [ ] Implement `upload_json()` and `get_gateway_url()` methods

### Notification Service (0/6)
- [ ] Create `backend/src/services/notification_service.py`
- [ ] Implement `notify_new_proposal()` method
- [ ] Implement `notify_proposal_funded()` method
- [ ] Implement `notify_payment_received()` method
- [ ] Implement `send_bulk_email()` method (Resend integration)
- [ ] Implement email templates for all notification types

### Proposal Service (THE BIG ONE) (0/10)
- [ ] Create `backend/src/services/proposal_service.py`
- [ ] Implement `create_proposal()` method
- [ ] Implement `fund_proposal()` method (direct funding)
- [ ] Implement `claim_fragment()` method
- [ ] Implement `submit_results()` method (publish to IPFS)
- [ ] Implement `_auto_fragment_proposal()` method (Bedrock integration)
- [ ] Implement `_broadcast_new_proposal()` method (email + GossipSub + WebSocket)
- [ ] Implement `_pay_fragment_researcher()` helper
- [ ] Implement `_release_all_escrow()` helper
- [ ] Write unit tests for all methods

### Proposal API (0/8)
- [ ] Create `backend/src/api/v1/proposals.py`
- [ ] Implement `POST /proposals` endpoint (create)
- [ ] Implement `GET /proposals` endpoint (list with filters)
- [ ] Implement `GET /proposals/:id` endpoint
- [ ] Implement `POST /proposals/:id/fund` endpoint
- [ ] Implement `POST /proposals/:id/fragments/:fid/claim` endpoint
- [ ] Implement `POST /proposals/:id/results` endpoint
- [ ] Implement `POST /proposals/:id/fragments/generate` endpoint (auto-fragment)

### Notification API (0/4)
- [ ] Create `backend/src/api/v1/notifications.py`
- [ ] Implement `GET /notifications` endpoint
- [ ] Implement `PUT /notifications/:id/read` endpoint
- [ ] Implement `POST /notifications/preferences` endpoint

### Proposal Models (0/2)
- [ ] Create `backend/src/models/proposal.py` (Pydantic schemas)
- [ ] Create `backend/src/models/notification.py` (Pydantic schemas)

### Phase 4 Testing (0/12)
- [ ] Test proposal creation
- [ ] Test auto-fragmentation (mock Bedrock)
- [ ] Test direct funding (user → proposal)
- [ ] Test agent coalition funding (3 agents → proposal)
- [ ] Test email notifications sent to all users
- [ ] Test GossipSub broadcast to network
- [ ] Test WebSocket notifications to online users
- [ ] Test fragment claiming by multiple researchers
- [ ] Test result submission to IPFS
- [ ] Test Aave escrow supply/withdraw
- [ ] Test full crowdfunding flow end-to-end
- [ ] Integration test: proposal → funded → fragmented → executed → results published

### Phase 4 Verification (0/3)
- [ ] Proposals can be created and auto-fragmented
- [ ] Multiple funding sources work (users + agents)
- [ ] Results published to IPFS and accessible via gateway URL

---

## 🎨 Frontend Implementation (Optional - Not Blocking Demo)

**Note**: Backend can be demoed via Postman/curl. Frontend is nice-to-have.

### New Routes (0/7)
- [ ] `/wallet` - Wallet dashboard
- [ ] `/marketplace` - Browse workers
- [ ] `/proposals` - Browse proposals
- [ ] `/proposals/new` - Submit proposal
- [ ] `/proposals/[id]` - Proposal details
- [ ] `/agents` - Manage AI agents
- [ ] `/earnings` - Worker earnings

### Components (0/15)
- [ ] `<WalletHeader />` - Balance, address, QR code
- [ ] `<TransactionHistory />` - Payment list with Basescan links
- [ ] `<FundTestnetButton />` - Request faucet
- [ ] `<WorkerPricingCard />` - Worker info, pricing
- [ ] `<JobCostEstimator />` - Live cost calculation
- [ ] `<ProposalCard />` - Proposal summary
- [ ] `<FundingProgressBar />` - Funding status
- [ ] `<FragmentList />` - Sub-experiments
- [ ] `<FragmentClaimButton />` - Claim fragment
- [ ] `<FundersList />` - All funders
- [ ] `<AgentCard />` - Agent status
- [ ] `<AgentConfigForm />` - Configure agent
- [ ] `<SpendingChart />` - Agent spending visualization
- [ ] `<NotificationBell />` - Real-time notifications
- [ ] `<IPFSResultViewer />` - Display research results

---

## 🚀 Deployment Checklist

### Testnet Deployment (0/8)
- [ ] Deploy Phase 1 backend to staging
- [ ] Test all endpoints on staging
- [ ] Verify Basescan integration
- [ ] Test email notifications
- [ ] Test AWS Bedrock integration
- [ ] Load test with 100 concurrent requests
- [ ] Security audit (basic)
- [ ] Document all API endpoints

### Mainnet Deployment (0/6)
- [ ] Switch from Base Sepolia to Base Mainnet
- [ ] Update all environment variables
- [ ] Test with real USDC (small amounts)
- [ ] Monitor gas costs
- [ ] Set up error tracking (Sentry)
- [ ] Create production deployment runbook

---

## 📝 Documentation

### Technical Docs (0/5)
- [ ] API documentation (OpenAPI/Swagger)
- [ ] MongoDB schema documentation
- [ ] AgentKit integration guide
- [ ] AWS Bedrock prompt engineering guide
- [ ] Deployment guide

### User Docs (0/4)
- [ ] How to create a wallet
- [ ] How to submit a research proposal
- [ ] How to create an AI research agent
- [ ] How to claim fragments

---

## 🧪 Testing Summary

### Unit Tests (0/4)
- [ ] AgentKit service tests (10 tests)
- [ ] Marketplace service tests (8 tests)
- [ ] AI agent service tests (6 tests)
- [ ] Proposal service tests (12 tests)

### Integration Tests (0/5)
- [ ] Payment flow (user → worker)
- [ ] Marketplace routing
- [ ] Agent funding decision
- [ ] Proposal crowdfunding
- [ ] Fragment claiming

### End-to-End Tests (0/3)
- [ ] Full job payment flow
- [ ] Research crowdfunding with agents
- [ ] Multi-fragment research completion

---

## 🎯 Success Metrics

### Phase 1 Metrics
- [ ] 100% wallet creation success rate
- [ ] 0 failed USDC transfers
- [ ] <5 second transaction finality
- [ ] All transactions on Basescan

### Phase 2 Metrics
- [ ] 80%+ jobs use cheapest workers
- [ ] <1 minute payment distribution
- [ ] Reputation correlates with success

### Phase 3 Metrics
- [ ] <10 second proposal analysis
- [ ] 70%+ agent-funded proposals succeed
- [ ] 100% budget compliance

### Phase 4 Metrics
- [ ] 50%+ proposals reach funding threshold
- [ ] 90%+ auto-fragmentation success
- [ ] 100% email delivery
- [ ] <24 hour result publishing

---

## 🐛 Known Issues & Blockers

### Current Blockers
- None (just starting!)

### Future Risks
- [ ] AgentKit API rate limits
- [ ] AWS Bedrock throttling
- [ ] Resend email deliverability
- [ ] Base network congestion
- [ ] Aave protocol changes

---

## 📅 Milestones

### Phase 1 Complete
- [ ] Wallet + payments working
- [ ] Demo: USDC transfer visible on Basescan

### Phase 2 Complete
- [ ] Worker marketplace live
- [ ] Demo: Job automatically pays cheapest worker

### Phase 3 Complete
- [ ] AI agents operational
- [ ] Demo: Agent autonomously funds proposal

### Phase 4 Complete
- [ ] Crowdfunding + fragmentation
- [ ] Demo: Full research lifecycle (propose → fund → execute → publish)

### Production Ready
- [ ] All testing complete
- [ ] Production deployment
- [ ] Public launch! 🚀

---

## 🎉 Completed Tasks

_Nothing yet! Let's get started!_

---

## 📞 Support & References

- **Design Doc**: `/docs/superpowers/specs/2026-05-20-agentkit-crowdfunding-design.md`
- **Context Doc**: `/docs/superpowers/AGENTKIT_CONTEXT.md` ← For AI handoff
- **AgentKit Docs**: https://docs.cdp.coinbase.com/agentkit
- **Base Network**: https://docs.base.org
- **AWS Bedrock**: https://docs.aws.amazon.com/bedrock
- **Resend Docs**: https://resend.com/docs

---

**Last Updated**: 2026-05-20  
**Next Review**: After each phase completion  
**Maintained By**: Soham + Claude
