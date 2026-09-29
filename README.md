<div align="center">

# QMeshPy — Distributed Quantum Services with Algorand x402

**Quantum computation as discoverable, machine-payable peer-to-peer services — powered by py-libp2p, Qiskit, and Algorand x402.**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Qiskit](https://img.shields.io/badge/Qiskit-1.x-6929C4?logo=ibm&logoColor=white)](https://qiskit.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/Winter-Soren/distributed-quantum-services?color=brightgreen)](https://github.com/Winter-Soren/distributed-quantum-services/commits/main)
[![Hits](https://hits.sh/github.com/Winter-Soren/distributed-quantum-services.svg?label=visitors&color=6929C4)](https://hits.sh/github.com/Winter-Soren/distributed-quantum-services/)

</div>

---

## What This Is

A research platform with two connected tracks:

**Track 1 - Distributed Quantum Orchestration.** A coordinator node (FastAPI + py-libp2p) discovers worker nodes via GossipSub pubsub, compiles OpenQASM circuits into distributed execution plans, routes fragments to workers over libp2p streams, and assembles full quantum results using Qiskit statevector simulation. A Next.js operator console gives real-time visibility into the peer network, job lifecycle, and quantum analysis output.

**Track 2 - QAOA Portfolio Optimization.** The same infrastructure drives a QAOA-based portfolio optimizer that runs rigorous empirical comparisons against classical baselines (Simulated Annealing) to characterize exactly where, and why, quantum computing gains a scaling advantage.

---

## ⚡ Algorand x402: Machine-Payable Quantum Computing

> **QMeshPy is a decentralized quantum-computing service network where developers and autonomous agents can discover quantum workloads, pay seamlessly with Algorand USDC through x402, and trigger real distributed quantum circuit and quantum-finance computations across a libp2p mesh.**

QMeshPy turns distributed quantum computing into **discoverable, programmable, and pay-per-use network services**. The platform combines **FastAPI, Qiskit, py-libp2p, and Algorand x402** so that quantum capabilities can be exposed as services rather than requiring every developer, researcher, or application to operate its own quantum-computing infrastructure.

The Algorand x402 integration adds the missing **machine-to-machine payment layer**: a software client can discover a quantum service, determine the payment requirement, make an on-chain USDC payment, and invoke the computation programmatically.

### Why Algorand x402?

The problem QMeshPy addresses is twofold:

1. **Access to specialized quantum computation is difficult.** Developers, researchers, financial applications, and other software increasingly need specialized quantum workloads without necessarily operating their own quantum infrastructure.
2. **Distributed compute needs native machine payments.** A decentralized compute network needs a way for software clients and autonomous agents to discover a service, understand its price, pay programmatically, and receive the resulting computation without manual payment or account-management workflows.

Algorand x402 provides a natural payment rail for this model. HTTP requests can communicate the payment requirement through the standard `402 Payment Required` flow, while **Algorand USDC provides on-chain settlement** before the corresponding QMeshPy computation proceeds.

### What QMeshPy exposes

For the Algorand x402 integration, QMeshPy currently exposes two paid services:

| Service | Description | Payment flow | Execution |
|---|---|---|---|
| **Quantum Circuit Execution** | Submit quantum circuits for distributed execution | Algorand USDC via x402 | Distributed across the QMeshPy libp2p mesh |
| **QAE Options Pricing** | Run quantum-amplitude-estimation-based options pricing | Algorand USDC via x402 | QMeshPy quantum-finance execution pipeline |

The underlying platform separates circuit, finance, discovery, and enrollment services and connects them to distributed worker peers through py-libp2p.

### How the x402 request flow works

```text
┌───────────────────────┐
│ Developer / Agent     │
│ / Application         │
└──────────┬────────────┘
           │
           │ 1. Request quantum service
           ▼
┌─────────────────────────────────────┐
│ QMeshPy x402 Endpoint               │
│ POST /api/x402/quantum/runs         │
└──────────┬──────────────────────────┘
           │
           │ 2. No payment supplied
           ▼
      HTTP 402 Payment
        Required
           │
           │ 3. Client supplies x402 payment
           ▼
┌─────────────────────────────────────┐
│ GoPlausible x402 Facilitator         │
│ Bazaar discovery + route metadata    │
└──────────┬──────────────────────────┘
           │
           │ 4. Algorand USDC settlement
           ▼
┌─────────────────────────────────────┐
│ Algorand TestNet / MainNet           │
│ On-chain payment settlement          │
└──────────┬──────────────────────────┘
           │
           │ 5. Payment verified
           ▼
┌─────────────────────────────────────┐
│ QMeshPy Quantum Service              │
│ Circuit execution / QAE pricing      │
└──────────┬──────────────────────────┘
           │
           │ 6. Distributed execution
           ▼
┌─────────────────────────────────────┐
│ py-libp2p Worker Mesh                │
│ GossipSub + libp2p streams           │
└──────────┬──────────────────────────┘
           │
           │ 7. Result returned
           ▼
┌───────────────────────┐
│ Developer / Agent     │
│ receives computation  │
└───────────────────────┘
```

This creates a complete **request → payment → settlement → computation → result** lifecycle where payment is handled programmatically rather than through a manual checkout workflow.

### x402 integration details

The QMeshPy Algorand integration has the following characteristics:

- **Two paid endpoints:** quantum circuit execution and QAE options pricing.
- **GoPlausible facilitator:** both routes use the GoPlausible x402 facilitator.
- **Bazaar discovery:** x402 Bazaar discovery is enabled for the routes.
- **Global challenge metadata:** the `x402-global-challenge` tag is set in the route metadata.
- **HTTP 402 flow:** unpaid requests return a proper `402 Payment Required` response with the payment requirement.
- **Real Algorand USDC:** paid TestNet requests use real Algorand USDC rather than a mocked payment implementation.
- **On-chain settlement:** successful payments settle on-chain and increase the service receiver's balance.
- **Computation after payment:** once payment is settled, QMeshPy creates the corresponding quantum job and executes it.
- **Distributed execution:** quantum circuit jobs are dispatched through the QMeshPy py-libp2p mesh.
- **Real result:** the QAE options-pricing endpoint has completed successfully and returned a real computation result.

### Algorand TestNet configuration

The current integration is configured for Algorand TestNet.

The x402 endpoint is:

```text
POST /api/x402/quantum/runs
```

The platform acts as the **seller/service provider**. The seller only needs a public Algorand receiver address; private keys and mnemonics are not required by the QMeshPy repository.

The current TestNet configuration uses:

```dotenv
X402_ENABLED=true
X402_NETWORK=testnet
X402_AVM_ADDRESS=<Algorand receiver address>
X402_FACILITATOR_URL=https://facilitator.goplausible.xyz
X402_QUANTUM_RUN_PRICE=$0.01
```

The QMeshPy TestNet flow uses the Algorand USDC ASA:

```text
10458941
```

A complete setup and verification procedure is available in:

**[docs/algorand-x402-runbook.md](docs/algorand-x402-runbook.md)**

The runbook covers receiver setup, TestNet funding, USDC opt-in, payer setup, environment variables, unpaid 402 verification, paid requests, and the MainNet transition.

---

## ✅ Algorand x402 TestNet Verification

The integration has been tested end-to-end against **Algorand TestNet** using real Algorand USDC.

The verification covered the complete payment and computation lifecycle:

1. Send an unpaid request.
2. Receive the expected HTTP `402 Payment Required`.
3. Provide the required x402 payment.
4. Settle the payment using Algorand USDC.
5. Verify the on-chain transaction.
6. Confirm that the service receiver balance increased.
7. Create the corresponding QMeshPy job.
8. Execute the workload through the QMeshPy execution infrastructure.
9. Return the computation result.

### Verified behavior

**Quantum circuit execution**

The paid circuit endpoint has been exercised against the QMeshPy distributed execution layer. Circuit jobs are routed through the py-libp2p mesh, where worker peers participate in the computation.

Two early test transactions exposed issues in the sample circuit itself rather than the payment flow. After correcting the circuit, the paid request completed successfully.

**QAE options pricing**

The paid options-pricing endpoint completed successfully after Algorand USDC settlement and returned a real computation result.

This is important because the TestNet verification is not only checking that an Algorand transaction exists: it verifies that **payment enables an actual downstream computation**.

### TestNet transaction evidence

#### 1. Quantum circuits — first paid call

The first paid circuit request successfully exercised the payment flow, but the resulting job failed because the submitted sample circuit was invalid.

**Transaction:**  
https://lora.algokit.io/testnet/transaction/XKHMXGIXMN3AWDZHXR2SNMTOLFXC2YUWNVCO5I4DLIWIHAT622RQ

**Result:** Payment flow exercised successfully; computation failed because of the sample circuit.

#### 2. QAE options pricing — successful

The options-pricing request completed successfully and returned a real result after payment settlement.

**Transaction:**  
https://lora.algokit.io/testnet/transaction/CRKLH5GMLK3WESENWBUO22VA7N6WFASUW2C6A5GYHCN7GYDMNVEQ

**Result:** Payment settled and QAE options-pricing job completed successfully.

#### 3. Quantum circuits — second paid call

A second circuit request was submitted after the initial test. The job reached execution but failed on the `measure q -> c` line in the submitted circuit.

**Transaction:**  
https://lora.algokit.io/testnet/transaction/NRWBXMIC6R5HZ6BKBL2C4ATYZC5ADM37SSAPZWIT3MEQ6KI2QIMQ

**Result:** Payment flow exercised successfully; computation failed on the circuit's measurement instruction.

#### 4. Quantum circuits — fixed circuit, successful

The circuit was corrected and submitted again. This time the paid request completed successfully and the job ran through the QMeshPy execution infrastructure.

**Transaction:**  
https://lora.algokit.io/testnet/transaction/M3EJCHKT6BZIDVBVQSVOK3S2AVMW367FKQDNK2LWHT6XBYSOC7IA

**Result:** Payment settled and the distributed quantum circuit job completed successfully.

### Test payer account

The Algorand TestNet payer account used for the paid integration tests is:

https://lora.algokit.io/testnet/account/YFBKZ4PSSKSOJNHUGXOK3GOBO5J7R2GXR57FPQLYKUJOTLIAWB7S7JY724

### What the TestNet results demonstrate

The successful tests demonstrate that QMeshPy can connect the following components into one machine-driven workflow:

```text
HTTP request
    ↓
x402 payment requirement
    ↓
Algorand USDC payment
    ↓
On-chain settlement
    ↓
Payment verification
    ↓
QMeshPy job creation
    ↓
libp2p distributed execution
    ↓
Quantum / quantum-finance result
```

The important distinction is that the Algorand transaction is not an isolated payment demonstration. The payment is directly connected to access to a computational service.

---

## 🔎 Discovery + Payment + Computation

QMeshPy is designed around a broader service-network model.

A future application or autonomous agent should not need to know which machine owns the quantum hardware or simulator. Instead, it should be able to:

1. **Discover** a quantum-capable service.
2. **Inspect** the service capability and payment requirement.
3. **Request** computation.
4. **Receive an HTTP 402** when payment is required.
5. **Pay programmatically** using Algorand USDC through x402.
6. **Wait for settlement and authorization.**
7. **Submit or trigger the quantum workload.**
8. **Receive the resulting computation.**

This makes quantum computation behave more like a programmable network resource.

The role of each layer is deliberately separated:

| Layer | Responsibility |
|---|---|
| **x402** | Standard payment-required interaction between client and service |
| **Algorand** | On-chain USDC payment and settlement |
| **GoPlausible** | x402 payment facilitation |
| **Bazaar** | Service discovery within the x402 ecosystem |
| **FastAPI** | QMeshPy service/API layer |
| **py-libp2p** | Peer discovery, communication, and distributed execution |
| **Qiskit** | Quantum circuit and quantum-finance computation |
| **Worker peers** | Distributed computation providers |

This separation allows QMeshPy to keep its decentralized execution model while adding a standardized economic interface for machine-to-machine computation.

---

## 🤖 Machine-to-Machine Quantum Services

One of the longer-term goals of QMeshPy is to make specialized computation accessible to **software rather than only human operators**.

For example, an autonomous financial agent could discover a QAE options-pricing service, determine that the service costs a specified amount of USDC, make the required Algorand payment through x402, and receive the resulting computation.

Likewise, a quantum application could discover a circuit-execution service, pay for execution, and submit a workload without manually managing a quantum-computing backend.

This creates a model where:

```text
Autonomous Agent
      │
      ├── Discover service
      │
      ├── Determine price
      │
      ├── Pay with Algorand USDC
      │
      ├── Invoke computation
      │
      └── Consume result
             │
             ▼
       QMeshPy Service
             │
             ▼
       libp2p Worker Mesh
```

Algorand x402 therefore provides an important economic primitive for QMeshPy: **machine-payable access to distributed computation**.

---

## 🌐 Vision: An Open Marketplace for Quantum Services

The long-term vision is an open network where independent compute providers can contribute quantum-capable worker nodes and applications can dynamically discover and pay for specialized quantum capabilities.

QMeshPy's architecture already moves in this direction through:

- distributed worker discovery;
- capability advertisements;
- peer-to-peer communication;
- distributed circuit execution;
- quantum-finance services;
- service-oriented APIs;
- and a roadmap toward an open node network and autonomous workloads.

The existing roadmap includes:

| Milestone | Theme |
|---|---|
| **M1** | Production SDK & Platform |
| **M2** | Bring Your Own Node Network |
| **M3** | Autonomous Research & Drug Discovery Platform |
| **M4** | Torrent-Native Service Network |
| **M5** | Hydra Self-Healing Network |

Within this architecture, **Algorand x402 provides the economic layer** that allows computational services to be consumed programmatically.

The goal is not simply to attach payments to a quantum API. The goal is to combine:

**discovery + capability + payment + distributed execution + results**

into a composable network primitive for quantum computing.

---

## 🏗️ Platform Architecture

QMeshPy combines a service/API layer with a decentralized execution layer:

```text
                         ┌───────────────────────────────┐
                         │ Developer / AI Agent / App    │
                         └───────────────┬───────────────┘
                                         │
                              x402 payment request
                                         │
                                         ▼
                         ┌───────────────────────────────┐
                         │       QMeshPy API Layer       │
                         │                               │
                         │  Circuit Execution            │
                         │  QAE Options Pricing          │
                         │  Discovery / Enrollment       │
                         └───────────────┬───────────────┘
                                         │
                              payment verified
                                         │
                         ┌───────────────▼───────────────┐
                         │      FastAPI Coordinator       │
                         │                               │
                         │  Circuit Jobs │ Finance       │
                         └───────────────┬───────────────┘
                                         │
                              py-libp2p / GossipSub
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
             ┌────────────┐      ┌────────────┐      ┌────────────┐
             │ Worker     │      │ Worker     │      │ Worker     │
             │ Peer       │      │ Peer       │      │ Peer       │
             └────────────┘      └────────────┘      └────────────┘
                    │                    │                    │
                    └────────────────────┼────────────────────┘
                                         │
                                         ▼
                              Quantum computation
                                         │
                                         ▼
                                  Result / Job
```

Algorand x402 is intentionally positioned at the service boundary. The payment layer does not replace the decentralized networking layer; it authorizes access to services that are then executed across the QMeshPy peer-to-peer infrastructure.

---

## 🔗 Algorand x402 Resources

- **QMeshPy Algorand x402 implementation:**  
  https://github.com/QMeshPy/distributed-quantum/tree/feat/algorand-x402

- **Algorand TestNet transaction — successful QAE options pricing:**  
  https://lora.algokit.io/testnet/transaction/CRKLH5GMLK3WESENWBUO22VA7N6WFASUW2C6A5GYHCN7GYDMNVEQ

- **Algorand TestNet transaction — successful fixed circuit:**  
  https://lora.algokit.io/testnet/transaction/M3EJCHKT6BZIDVBVQSVOK3S2AVMW367FKQDNK2LWHT6XBYSOC7IA

- **Algorand TestNet payer account:**  
  https://lora.algokit.io/testnet/account/YFBKZ4PSSKSOJNHUGXOK3GOBO5J7R2GXR57FPQLYKUJOTLIAWB7S7JY724

- **Complete x402 TestNet runbook:**  
  [docs/algorand-x402-runbook.md](docs/algorand-x402-runbook.md)


---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Operator Console                      │
│   /dashboard  ·  /runs  ·  /runs/new  ·  /finance               │
│   3D peer graph · circuit builder · quantum analysis · QAOA      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ BFF proxy (REST polling)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Coordinator                            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Circuit Jobs │  │   Finance    │  │  Enrollment &        │  │
│  │   Service    │  │  (QAOA)      │  │  Discovery           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              py-libp2p Runtime (Trio)                    │   │
│  │   Ed25519 host · GossipSub pubsub · Stream RPC           │   │
│  └──────────────────────────┬─────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │ libp2p streams
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
   │  Worker Peer  │  │  Worker Peer  │  │  Worker Peer  │
   │  hadamard/cnot│  │  qft/teleport │  │  programmable │
   └───────────────┘  └───────────────┘  └───────────────┘

Persistence:  Postgres (event-sourced)  ·  MongoDB (projections)  ·  JSONL (peer log)
```

---

## Key Research Finding

**97% of quantum runtime is classical COBYLA parameter search** — not the quantum circuit.

```
Quantum runtime breakdown:
  Parameter search (COBYLA):  ████████████████████████████████████  97%
  Circuit execution:          █                                       2%
  Overhead:                   ▌                                       1%
```

**Implication (Amdahl's Law):** adding more quantum nodes yields at most **1.03× speedup**. Quantum advantage comes from *scaling behavior*, not raw speed:

| Portfolio Size | Classical (SA) | Quantum (QAOA) | Winner |
|---|---|---|---|
| 10 assets | **20 ms** | 1,500 ms | Classical 75× faster |
| 20 assets | **600 ms** | 1,700 ms | Classical 2.8× faster |
| 40 assets | 6,000 ms | **1,900 ms** | **Quantum 3.2× faster** |
| 60 assets | 20,000 ms | **2,100 ms** | **Quantum 9.5× faster** |

---

## Quick Start

### Prerequisites

- Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- Node.js 20+ with npm
- Docker (for full-stack deployment)

### Run the Backend

```bash
cd backend
make install     # uv sync --extra dev
make run         # FastAPI on http://localhost:8081
```

Swagger docs at `http://localhost:8081/docs`. To restart with a clean runtime state: `make run-clean`.

### Run the Frontend

```bash
cd frontend
npm install
npm run dev      # Next.js on http://localhost:3000
```

Create `frontend/.env`:

```dotenv
NEXT_PUBLIC_BACKEND_URL=http://localhost:8081
NEXT_PUBLIC_TRIAL_DISABLED=true
```

### Configure Algorand x402 (TestNet)

The x402 endpoint is `POST /api/x402/quantum/runs`. The platform is the
seller: it needs only a public Algorand receiver address. Never place a
mnemonic or private key in this repository.

1. Create a dedicated Algorand TestNet receiver in Pera, Defly, Lute, or an
   approved custody system.
2. Fund it with TestNet ALGO at
   [Lora](https://lora.algokit.io/testnet/fund), then opt it into TestNet USDC
   ASA `10458941`. The account needs at least 0.2 ALGO for its base and
   asset-opt-in minimum balances, plus transaction fees.
3. Optional for receiver testing: request TestNet USDC from the
   [Circle faucet](https://faucet.circle.com/). A paid test also needs a
   separate payer account with ALGO, the same USDC opt-in, and TestNet USDC.
4. Generate one gateway secret with `openssl rand -hex 32`. Set the same
   value as `QB2_X402_GATEWAY_SECRET` in `.env` and `backend/.env`, and as
   `X402_GATEWAY_SECRET` in `frontend/.env`.
5. Set `X402_AVM_ADDRESS` in `frontend/.env` to the receiver's public
   address, then change `X402_ENABLED=true`.

`frontend/.env` should contain:

```dotenv
NEXT_PUBLIC_BACKEND_URL=http://localhost:8081
X402_ENABLED=true
X402_NETWORK=testnet
X402_AVM_ADDRESS=<58-character Algorand receiver address>
X402_FACILITATOR_URL=https://facilitator.goplausible.xyz
X402_QUANTUM_RUN_PRICE=$0.01
X402_GATEWAY_SECRET=<same 64-character secret>
```

The hosted facilitator and default AlgoNode endpoints require no API key.
MetaMask is not compatible with Algorand AVM payments. AWS Bedrock and
Coinbase CDP keys configure the existing agent features, not this x402 route.
See [the complete TestNet runbook](docs/algorand-x402-runbook.md) for unpaid
and paid verification commands and the MainNet switch.

If `next dev` reports `EMFILE` on macOS, use the production server for the
local check:

```bash
cd frontend
pnpm run build
pnpm run start
```

### Full Stack with Docker

```bash
cp .env.example .env   # fill in Neon Postgres + Atlas MongoDB credentials
docker compose up --build
```

Frontend → `localhost:3000` · Backend API → `localhost:8081` · Swagger → `localhost:8081/docs`

---

## Documentation

> **Apple-style navigation** — pick your goal, go directly there. No guessing needed.

### 🎓 I'm a researcher or academic

**→ Start here: [docs/research/RESEARCH_PAPER_DRAFT.md](docs/research/RESEARCH_PAPER_DRAFT.md)**

~15,000 words · 9 sections · publication-ready draft. All experiments, benchmarks, and findings from bottleneck analysis through scaling characterization.

Then read:
- **[docs/research/MATHEMATICAL_APPENDIX.md](docs/research/MATHEMATICAL_APPENDIX.md)** — rigorous proofs: QUBO→Ising conversion, parameter-shift rule, Amdahl's Law, complexity comparisons
- **[docs/research/QUANTUM_SCALING_STRATEGY.md](docs/research/QUANTUM_SCALING_STRATEGY.md)** — why we pivoted from speed to scaling, crossover predictions, success criteria
- **[docs/research/ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md](docs/research/ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md)** — option pricing QAE (proven 100× speedup) as backup

---

### 🔧 I'm a developer contributing to the platform

**→ Start here: [CONTEXT.md](CONTEXT.md)**

Deep contributor context — package layout, critical caveats (Trio/asyncio bridge, auth model, embedded dev swarm), and entry points for every type of change.

Then read:
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — full system architecture: control/execution/data planes, every component, state machines, Mermaid diagrams
- **[docs/design.md](docs/design.md)** — design rationale, cost model, failure model, protocol contracts
- **[docs/requirements.md](docs/requirements.md)** — FR-001–FR-014 with implementation status

---

### 🖥️ I want to understand the operator console (frontend)

**→ Start here: [frontend/DESIGN.md](frontend/DESIGN.md)**

The Clay design system — oklch colors, component patterns, shadcn/ui conventions used throughout the UI.

Then read:
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** §Frontend — BFF proxy pattern, Zustand stores, polling hooks
- `/runs/new` — visual circuit builder with drag-and-drop gate palette + OpenQASM editor
- `/runs/[id]` — full quantum analysis: Bloch spheres, fragment DAG, entanglement entropy, density matrices

---

### 📊 I want to replicate or extend the benchmarks

**→ Start here: [docs/technical/IMPLEMENTATION_NOTES.md](docs/technical/IMPLEMENTATION_NOTES.md)**

Complete technical timeline from initial 600× slowdown through three optimization phases to the final scaling result.

Then read:
- **[docs/technical/BENCHMARK.md](docs/technical/BENCHMARK.md)** — original bottleneck discovery (77% → 97% parameter search)
- **[docs/technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md](docs/technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md)** — honest analysis of why parameter-shift gradients made it 2–3× *slower*
- **[docs/technical/QAOA_OPTIMIZATION_RESEARCH.md](docs/technical/QAOA_OPTIMIZATION_RESEARCH.md)** — literature survey of 10+ QAOA optimization papers (2024–2025)
- `backend/scripts/` — benchmark scripts used to produce all results

---

### 🚀 I want to deploy the platform

**→ Start here: [DEPLOYMENT-MANUAL.md](DEPLOYMENT-MANUAL.md)**

Full production runbook: frontend on Vercel, backend on AWS Lightsail, Neon Postgres, MongoDB Atlas, Caddy HTTPS. ~$40/month all-in.

Then read:
- **[docs/LIGHTSAIL-DEPLOYMENT.md](docs/LIGHTSAIL-DEPLOYMENT.md)** — Lightsail-specific setup with cost breakdown
- **[.env.example](.env.example)** — all environment variables with descriptions

---

### 💰 I want to understand the finance/quantum use case

**→ Start here: [docs/FINANCIAL_MODELING_FOUNDATIONS.md](docs/FINANCIAL_MODELING_FOUNDATIONS.md)**

What "financial modeling" actually means, Track A (corporate finance) vs Track B (quantum-finance optimization), and why portfolio optimization maps naturally to QAOA.

Then read:
- **[docs/research/RESEARCH_PAPER_DRAFT.md](docs/research/RESEARCH_PAPER_DRAFT.md)** §1 — the computational crisis in modern financial modeling
- **[docs/research/ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md](docs/research/ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md)** — option pricing, credit risk, yield curves

---

### 🗺️ I want the long-term product vision

**→ Start here: [docs/FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md)**

Five-milestone evolution: SDK platform → open node network → autonomous research engine → torrent-native service swarm → self-healing distributed organism.

Then read:
- **[docs/future-roadmap/](docs/future-roadmap/)** — per-milestone detail docs (M1–M5)
- **[docs/IPFS_INTEGRATION_STRATEGIC_VISION.md](docs/IPFS_INTEGRATION_STRATEGIC_VISION.md)** — VAULT: browser-native Helia nodes for peer-to-peer circuit sharing (Phase 1 planned)

---

### ⚡ I'm new and want the fastest possible orientation

**→ [docs/START_HERE.md](docs/START_HERE.md)** — the full documentation navigator in one page

---

## Research: Optimization Phases

| Phase | Approach | Result |
|---|---|---|
| **Baseline** | Default COBYLA (150 iters × 12 starts) | 10,000 ms · 77% parameter search |
| **Phase 1** ✅ | Reduced iterations + parameter caching | 1,400 ms · 97% parameter search — Amdahl limit hit |
| **Phase 2** ❌ | Parameter-shift gradients + L-BFGS-B | **2–3× slower** — 8× evaluation overhead dominated |
| **Phase 3** ✅ | Focus on scaling N, not speed | Quantum wins at N ≥ 40 assets |

Full paper: [docs/research/RESEARCH_PAPER_DRAFT.md](docs/research/RESEARCH_PAPER_DRAFT.md) · Failure analysis: [docs/technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md](docs/technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md)

---

## Future Roadmap

| Milestone | Theme |
|---|---|
| **M1** | Production SDK & Platform |
| **M2** | Bring Your Own Node Network |
| **M3** | Autonomous Research & Drug Discovery Platform |
| **M4** | Torrent-Native Service Network |
| **M5** | Hydra Self-Healing Network |

Details: [docs/FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md)

---

## Contributing

1. Fork and create a feature branch.
2. Read [CONTEXT.md](CONTEXT.md) first — the Trio/asyncio bridge and event-sourced persistence have constraints that aren't obvious.
3. `make lint && make test` must pass in `backend/` before submitting.
4. `npm run build` must succeed in `frontend/` (no TypeScript errors).
5. Surgical changes only — match existing style, don't refactor adjacent code.

---

## Citation

```bibtex
@article{bhoir2026quantum,
  title={Quantum Portfolio Optimization: Bottleneck Analysis and Scaling Studies},
  author={Bhoir, Soham and Gupta, Manusheel},
  journal={[Pending submission]},
  year={2026},
  note={QAOA bottleneck profiling, Amdahl's Law analysis, and quantum advantage
        characterization for financial portfolio optimization using distributed
        py-libp2p infrastructure}
}
```

---

## Acknowledgments

- **Algorand x402** — machine-payable HTTP service payments and Algorand USDC settlement
- [Qiskit](https://qiskit.org/) (IBM) — quantum computing framework
- [py-libp2p](https://github.com/libp2p/py-libp2p) — peer-to-peer networking
- [FastAPI](https://fastapi.tiangolo.com/) — async Python API framework
- [shadcn/ui](https://ui.shadcn.com/) — UI component library
- [Yahoo Finance](https://finance.yahoo.com/) / Prof. Aswath Damodaran (NYU Stern) — market data

---

<div align="center">

**[docs/START_HERE.md](docs/START_HERE.md)** · **[Research Paper](docs/research/RESEARCH_PAPER_DRAFT.md)** · **[Architecture](docs/ARCHITECTURE.md)** · **[Deployment](DEPLOYMENT-MANUAL.md)**

*Built with quantum circuits, debugged with patience, documented with care.*

</div>
