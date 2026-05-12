<div align="center">

# Distributed Quantum Services

**Quantum operations as discoverable peer-to-peer network services — orchestrated over py-libp2p, analyzed with Qiskit**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Qiskit](https://img.shields.io/badge/Qiskit-1.x-6929C4?logo=ibm&logoColor=white)](https://qiskit.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## What This Is

A research platform that treats **quantum operations as network-native services**.

A coordinator node (FastAPI + py-libp2p) discovers worker nodes via GossipSub pubsub, compiles OpenQASM circuits into distributed execution plans, routes circuit fragments to workers over libp2p streams, and assembles full quantum results using Qiskit statevector simulation. A Next.js operator console provides real-time visibility into the peer network, job lifecycle, and quantum analysis output.

A second research track uses the same infrastructure for **QAOA-based portfolio optimization**, with a detailed empirical study of where quantum computing gains a scaling advantage over classical algorithms.

---

## Platform Overview

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
│  │ Circuit Jobs │  │   Finance    │  │    Enrollment &      │  │
│  │   Service    │  │  (QAOA)      │  │    Discovery         │  │
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

**Implication (Amdahl's Law):**

```
Serial fraction  s  = 0.97
Maximum speedup     = 1/s = 1.03×
Measured speedup (20 nodes vs 5 nodes) = 1.24×
```

Adding more quantum nodes/processors yields at most **1.03× improvement**. Quantum advantage comes from **scaling behavior**, not raw speed:

| Portfolio Size | Classical (SA) | Quantum (QAOA) | Winner |
|---|---|---|---|
| 10 assets | **20 ms** | 1,500 ms | Classical 75× faster |
| 20 assets | **600 ms** | 1,700 ms | Classical 2.8× faster |
| 40 assets | 6,000 ms | **1,900 ms** | **Quantum 3.2× faster** |
| 60 assets | 20,000 ms | **2,100 ms** | **Quantum 9.5× faster** |

Full analysis: [docs/research/RESEARCH_PAPER_DRAFT.md](docs/research/RESEARCH_PAPER_DRAFT.md)

---

## Repository Structure

```
nodes-quantum-gates/
│
├── backend/                          Python backend
│   ├── src/quantum_backend_v2/       Core package
│   │   ├── api/                      FastAPI routers, models, auth, errors
│   │   ├── application/              CircuitJobService, FinancialJobService, EnrollmentService
│   │   ├── identity/                 Roles (ADMIN/OPERATOR/DEVELOPER/VIEWER), trust tiers
│   │   ├── libp2p/                   py-libp2p host, GossipSub, stream RPC, Trio↔asyncio bridge
│   │   ├── discovery/                PeerRegistry, topology projections → MongoDB
│   │   ├── reservations/             Event-sourced state machine (REQUESTED → COMMITTED)
│   │   ├── runtime/                  Execution state machine, crash recovery on startup
│   │   ├── quality/                  Qiskit transpilation for per-service fidelity
│   │   ├── persistence/              postgres.py (SQLAlchemy) · mongodb.py (Beanie) · local_log.py
│   │   ├── planning/                 DAG planning models
│   │   ├── protocols/                Wire schemas: execution, reservation, quality, peersync
│   │   └── workflows/                Benchmark models and service
│   ├── scripts/                      Benchmark scripts (QAOA scaling, massive dataset)
│   ├── tests/                        20 unit tests (pytest)
│   ├── alembic/                      Database migrations (2 versions)
│   ├── Makefile                      install · run · run-clean · test · lint
│   └── pyproject.toml                uv-managed Python project
│
├── frontend/                         Next.js 16 operator console
│   ├── src/app/(main)/               Route pages: dashboard · runs · finance
│   ├── src/app/api/                  BFF proxy route handlers (never calls backend directly)
│   ├── src/features/                 Feature modules: network · runs · finance
│   ├── src/components/               Shared UI components
│   ├── src/lib/                      Backend client, transformers (snake_case → camelCase)
│   ├── src/store/                    Zustand state stores
│   ├── src/proxy.ts                  Proxy middleware
│   └── DESIGN.md                     Design system specification (Clay design)
│
├── docs/                             Documentation
│   ├── ARCHITECTURE.md               System architecture (deep dive, Mermaid diagrams)
│   ├── design.md                     Design rationale and tradeoffs
│   ├── requirements.md               Functional / non-functional requirements + status
│   ├── FINANCIAL_MODELING_FOUNDATIONS.md  Finance theory and quantum use-case framing
│   ├── FUTURE_ROADMAP.md             Long-term 5-milestone roadmap
│   ├── LIGHTSAIL-DEPLOYMENT.md       Lightsail deployment guide
│   ├── research/                     Publication materials
│   │   ├── RESEARCH_PAPER_DRAFT.md   Main paper (~15k words, v1.1)
│   │   ├── MATHEMATICAL_APPENDIX.md  Formal proofs
│   │   ├── QUANTUM_SCALING_STRATEGY.md  Scaling hypothesis and crossover analysis
│   │   └── ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md  QAE backup plan
│   └── technical/                    Implementation details
│       ├── IMPLEMENTATION_NOTES.md   Optimization journey (Phase 1→2→3)
│       ├── GRADIENT_OPTIMIZATION_POSTMORTEM.md  Honest failure analysis
│       ├── QAOA_OPTIMIZATION_RESEARCH.md  Literature survey
│       └── BENCHMARK.md              Original bottleneck analysis
│
├── dataset/                          S&P 500 benchmark data (100 assets, 5 years, 1256 days)
├── deploy/                           Caddyfile and deployment configs
├── docker-compose.yaml               Full-stack: backend + frontend + Caddy
├── DEPLOYMENT-MANUAL.md              Production runbook (Vercel + Lightsail + Neon + Atlas)
├── CONTEXT.md                        Deep contributor context
└── .env.example                      Environment variable template
```

---

## Quick Start

### Prerequisites

- Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- Node.js 20+ with npm
- Docker (for full-stack deployment)

### Backend

```bash
cd backend
make install     # uv sync --extra dev
make run         # FastAPI on http://localhost:8081
```

Optional — flush runtime state and restart clean:

```bash
make run-clean
```

API docs available at `http://localhost:8081/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev      # Next.js on http://localhost:3000
```

Create `frontend/.env.local`:

```
QUANTUM_BACKEND_URL=http://localhost:8081
NEXT_PUBLIC_TRIAL_DISABLED=true
```

### Full Stack with Docker

```bash
cp .env.example .env
# Fill in Neon Postgres and MongoDB Atlas credentials
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8081 |
| API docs (Swagger) | http://localhost:8081/docs |

---

## Backend: Architecture Details

### Package: `quantum_backend_v2`

Entry point: `quantum_backend_v2.main:main` (registered as `quantum-backend` CLI)

Bootstrap: `bootstrap/application.py` → `create_application()` → FastAPI app  
Lifespan: `api/app.py` — startup (init persistence, start libp2p, run recovery) + shutdown

### Circuit Execution Flow

```
POST /api/v1/circuits/submit  (OpenQASM string)
        │
        ▼
  CircuitJobService  ──→  WorkflowRunRecord (QUEUED)  ──→  Postgres
        │
        ▼
  Wait for enrolled service peers  (GossipSub discovery)
        │
        ▼
  Compile execution plan  (fragment DAG, cost-model assignment)  ──→  Postgres
        │
        ▼
  Distribute fragments via libp2p stream RPC  (per-fragment reservation)
        │
        ▼
  Assemble quantum state  (Qiskit statevector)
        │
        ▼
GET /api/v1/jobs/{job_id}
  → counts · probabilities · statevector · Bloch vectors
    entanglement entropy · density matrices · fidelity
    observable expectations · top basis states
```

**Job status transitions**: `QUEUED → COMPILING → EXECUTING → COMPLETED / FAILED`

### Supported Gate/Service Types (11)

| Type | Aliases |
|---|---|
| `hadamard` | `h` |
| `cnot` | `cx`, `cnot` |
| `cz` | — |
| `controlled_unitary` | — |
| `programmable_gate` | (default for unknown) |
| `qft` | — |
| `teleportation` | `teleport` |
| `bell_pair` | `bell` |
| `syndrome_extraction` | — |
| `distillation` | — |
| `measurement_feedforward` | `measure` |

### Finance: QAOA Portfolio Optimization

```
POST /api/v1/finance/submit  (CSV of asset returns)
        │
        ▼
  Build QUBO  ──→  Ising Hamiltonian  ──→  QAOA circuit (p=2 layers)
        │
        ▼
  COBYLA parameter optimization loop  (~97% of total runtime)
        │
        ▼
GET /api/v1/finance/{job_id}/comparison
  → QAOA result vs Simulated Annealing vs Random baseline
    selected assets · portfolio return · Sharpe ratio · runtime comparison
```

### Full API Surface (28+ endpoints)

| Group | Endpoints |
|---|---|
| **System** | `GET /` · `GET /api/v1/health` · `GET /api/v1/ready` |
| **Bootstrap** | `GET /api/v1/bootstrap/libp2p` · `GET /api/v1/bootstrap/libp2p/runtime` |
| **Discovery** | `GET /api/v1/discovery/peers` · `GET /api/v1/discovery/peers/{id}` · `GET /api/v1/discovery/topology` · `GET /api/v1/discovery/network/topology` |
| **Enrollment** | `POST /api/v1/enrollment/peers` · `GET /api/v1/enrollment/peers` · `GET /api/v1/enrollment/peers/{id}` · `POST /api/v1/enrollment/peers/{id}/action` |
| **Circuits** | `POST /api/v1/circuits/submit` |
| **Jobs** | `GET /api/v1/jobs` · `GET /api/v1/jobs/{id}` |
| **Plans** | `GET /api/v1/plans/{id}` |
| **Services** | `GET /api/v1/services` |
| **Metrics** | `GET /api/v1/metrics/fidelity/{node_id}` |
| **Finance** | `POST /api/v1/finance/submit` · `GET /api/v1/finance/{id}` · `GET /api/v1/finance/{id}/comparison` · `GET /api/v1/finance` |
| **Workflows** | `POST /api/v1/workflows/runs` · `GET /api/v1/workflows/runs/{id}` · `POST /api/v1/workflows/benchmarks` · `GET /api/v1/workflows/benchmarks/{id}` |
| **Reservations** | `POST /api/v1/reservations` · `GET /api/v1/reservations/{id}` · `POST /api/v1/reservations/{id}/cancel` |

### Configuration

All config via `QB2_*` environment variables → `AppSettings.from_env()` (Pydantic):

| Variable | Purpose | Default |
|---|---|---|
| `QB2_ENVIRONMENT` | development / staging / production | `development` |
| `QB2_API_HOST` / `QB2_API_PORT` | Bind address | `0.0.0.0:8081` |
| `QB2_AUTH_REQUIRED` | Toggle role-based auth | `false` |
| `QB2_POSTGRES_TARGET` | `local` or `neon` | `local` |
| `QB2_POSTGRES_LOCAL_DSN` | Local Postgres DSN | — |
| `QB2_MONGODB_TARGET` | `local` or `remote` | `local` |
| `QB2_LIBP2P_ENABLED` | Enable real py-libp2p | `true` |
| `QB2_LIBP2P_DEV_SERVICE_PEER_COUNT` | Embedded worker peers | `4` |

### Persistence

| Store | Technology | Contents |
|---|---|---|
| **Postgres** | SQLAlchemy (event-sourced) | users · enrollments · workflow runs · execution plans · financial jobs · reservation events · execution events |
| **MongoDB** | Beanie (ODM) | peer capabilities · topology projections · benchmark results · provenance bundles |
| **Local JSONL** | Append-only, fsync | protocol events · reservation/execution transitions · package installs |

### libp2p Runtime

- Coordinator runs a real py-libp2p host with Ed25519 keypair
- GossipSub pubsub for peer advertisement and heartbeat
- Stream-based RPC for reservation and fragment dispatch
- Runs in a Trio daemon thread, bridged to asyncio via `queue.SimpleQueue`
- **Embedded dev swarm**: configurable N worker peers (default 4) run in the same process with independent libp2p hosts

### Auth Model

- `QB2_AUTH_REQUIRED=false` (default): all requests become a local dev-admin with ADMIN + DEVELOPER roles
- `QB2_ALLOW_DEV_BEARER_TOKENS=true`: accepts `Bearer dev-<user_id>` tokens for testing
- Production JWT surface exists as a stub — not yet production-hardened

---

## Frontend: Operator Console

Built with Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui.

### Routes

| Route | What You See |
|---|---|
| `/dashboard` | Live 3D WebGL peer network graph (react-force-graph-3d), system stats, recent runs table |
| `/runs` | All circuit and finance jobs — status badges, polling every 5s |
| `/runs/new` | Visual circuit builder (drag-and-drop with @dnd-kit) + OpenQASM editor with templates |
| `/runs/[id]` | Fragment DAG (ReactFlow), quantum analysis (Bloch spheres, histograms, entanglement entropy, density matrices) |
| `/finance` | CSV upload → QAOA optimization → quantum-vs-classical comparison charts |

### BFF Proxy Pattern

The browser **never** calls the Python backend directly. All requests go through Next.js API routes (`src/app/api/`):

```
Browser → Next.js API route → backend-client.ts → FastAPI backend
                ↑
         src/proxy.ts (middleware)
```

- `src/lib/backend-client.ts` — server-only HTTP client (reads `QUANTUM_BACKEND_URL`)
- `src/lib/*-transformers.ts` — reshape backend snake_case → frontend camelCase

### Key Interactive Components

| Component | Technology | Description |
|---|---|---|
| 3D Peer Network | `react-force-graph-3d` | WebGL, orbit controls, collision physics |
| Bloch Sphere | `@qctrl/visualizer` | Paginated multi-qubit display |
| Fragment Flow DAG | `@xyflow/react` | Animated edges, service type badges |
| Visual Circuit Builder | `@dnd-kit` | Drag-and-drop grid, real-time OpenQASM generation |
| Quantum Analysis | Custom | Measurement histograms, probability distributions, observable expectations, Bloch vectors, density matrices |

### State Management

Zustand stores + custom polling hooks:

| Hook | Polls | Interval |
|---|---|---|
| `useDashboardData` | `/api/dashboard` | 30s |
| `useRunsList` | `/api/runs` | 5s |
| `useRunDetail` | `/api/runs/[id]` | 2s (stops on terminal state) |

---

## Testing

```bash
# Backend — 20 unit tests
cd backend && make test

# Run specific test
cd backend && uv run pytest tests/unit/test_health.py -v

# Lint + type-check
cd backend && make lint    # ruff + mypy

# Frontend type-check
cd frontend && npm run build
```

Test coverage areas: health · config · auth · discovery (API + bootstrap + registry + service) · distributed execution · reservations · financial (API + comparison + portfolio + summary) · benchmarks · persistence · DAG planning · package manifests/signing · libp2p peerstore.

---

## Deployment

Full production guide: [DEPLOYMENT-MANUAL.md](DEPLOYMENT-MANUAL.md)

**Stack:**

| Component | Service | Cost |
|---|---|---|
| Frontend | Vercel (CDN, auto-deploys) | Free tier |
| Backend + Caddy | AWS Lightsail 8GB | ~$40/month |
| PostgreSQL | Neon (managed, serverless) | Free tier |
| MongoDB | Atlas (managed) | Free tier |
| HTTPS | Caddy (Let's Encrypt, auto) | Included |

**Deployed URLs (example):**
- `https://distributed-quantum.com` — frontend (Vercel)
- `https://api.distributed-quantum.com` — backend API (Lightsail)

See also [docs/LIGHTSAIL-DEPLOYMENT.md](docs/LIGHTSAIL-DEPLOYMENT.md) for infrastructure-specific detail.

---

## Research: QAOA Portfolio Optimization

### The Problem

QUBO (Quadratic Unconstrained Binary Optimization) formulation for portfolio selection:

```
minimize:   x^T Q x
subject to: Σ x_i = K  (select exactly K assets)
            x_i ∈ {0,1}
```

Mapped to an Ising Hamiltonian and solved with QAOA (p=2 layers).

### Bottleneck Analysis

| Phase | Approach | Outcome |
|---|---|---|
| **Initial** | Default COBYLA (150 iters × 12 starts) | 10,000ms · 77% parameter search |
| **Phase 1** | Reduced iters + caching | 1,400ms · 97% parameter search (Amdahl limit hit) |
| **Phase 2** | Parameter-shift gradients + L-BFGS-B | **2–3× SLOWER** — 8× evaluation overhead dominated |
| **Phase 3** | Focus on scaling N, not speed | Quantum wins at N≥40 assets |

### Why Gradients Failed

```
COBYLA:   80 iterations × 1 eval/iter = 80 total evaluations  →  1,400ms
L-BFGS-B: 30 iterations × 8 evals/iter = 240 total evaluations → 3,500ms
                                 ↑
               (2 evals per param × 4 params = 8× overhead)
Result: 3× MORE expensive despite 2× better convergence
```

Lesson: gradient methods help for n≥20 qubits (per literature), but not for n=10 qubits with a non-convex landscape.

### Scaling Results

Classical Simulated Annealing scales as ~O(K²) per iteration (K ≈ N/3). QAOA parameter search is ~constant because the number of QAOA parameters (2p=4) does not grow with N:

```
Crossover at N=40 assets: quantum runtime (~1,900ms) < classical (~6,000ms)
```

Full results and proofs: [docs/research/](docs/research/)

### Academic Contributions

1. **First detailed QAOA bottleneck profiling** in a financial application
2. **Amdahl's Law quantification** showing distributed execution gives ≤1.03× speedup when 97% is serial
3. **Transparent failure documentation** — gradient optimization postmortem with root cause
4. **Scaling characterization** — crossover point N=40–50 assets with realistic S&P 500 data

### Target Venues

- IEEE Quantum Computing Conference (QCE)
- npj Quantum Information (Nature)
- ACM Transactions on Quantum Computing

---

## Future Roadmap

| Milestone | Theme | Description |
|---|---|---|
| **M1** | Production SDK & Platform | Stable SDKs, operator UX, production deployment model |
| **M2** | Bring Your Own Node | Laptops, phones, edge devices join as service peers |
| **M3** | Autonomous Research Platform | Drug discovery, simulation, lab workflows |
| **M4** | Torrent-Native Service Network | Service/artifact swarm distribution |
| **M5** | Hydra Self-Healing Network | Multi-coordinator, self-healing orchestration |

See [docs/FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md) for the full narrative.

**VAULT** (IPFS integration, Phase 1 planned): Browser-native Helia nodes for peer-to-peer quantum circuit sharing without backend involvement. See [docs/IPFS_INTEGRATION_STRATEGIC_VISION.md](docs/IPFS_INTEGRATION_STRATEGIC_VISION.md).

---

## Documentation

| Document | Description |
|---|---|
| [CONTEXT.md](CONTEXT.md) | Contributor guide — code organization, caveats, entry points by task |
| [docs/START_HERE.md](docs/START_HERE.md) | Documentation navigator — pick a path |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture with Mermaid diagrams and state machines |
| [docs/design.md](docs/design.md) | Design rationale, cost model, failure model, protocol contracts |
| [docs/requirements.md](docs/requirements.md) | FR-001–FR-014 + NFR-001–NFR-005 with implementation status |
| [docs/FINANCIAL_MODELING_FOUNDATIONS.md](docs/FINANCIAL_MODELING_FOUNDATIONS.md) | Finance theory and quantum use-case framing |
| [docs/research/RESEARCH_PAPER_DRAFT.md](docs/research/RESEARCH_PAPER_DRAFT.md) | Main research paper (~15k words, v1.1) |
| [docs/research/MATHEMATICAL_APPENDIX.md](docs/research/MATHEMATICAL_APPENDIX.md) | Rigorous proofs (QUBO→Ising, Amdahl's Law, complexity) |
| [docs/technical/BENCHMARK.md](docs/technical/BENCHMARK.md) | Original bottleneck discovery benchmark analysis |
| [docs/technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md](docs/technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md) | Honest failure analysis of Phase 2 |
| [docs/FUTURE_ROADMAP.md](docs/FUTURE_ROADMAP.md) | Long-term 5-milestone product roadmap |
| [frontend/DESIGN.md](frontend/DESIGN.md) | Frontend design system (Clay design, oklch colors, shadcn/ui) |
| [DEPLOYMENT-MANUAL.md](DEPLOYMENT-MANUAL.md) | Production deployment runbook |

---

## Contributing

1. Fork and create a feature branch.
2. Read [CONTEXT.md](CONTEXT.md) before making backend changes — the Trio/asyncio bridge and persistence model have important constraints.
3. Backend: `make lint && make test` must pass before submitting.
4. Frontend: `npm run build` must succeed (no TypeScript errors).
5. Match existing code style — no speculative refactors.

---

## Citation

```bibtex
@article{bhoir2026quantum,
  title={Quantum Portfolio Optimization: Bottleneck Analysis and Scaling Studies},
  author={Bhoir, Soham and Gupta, Manusheel},
  journal={[Pending submission]},
  year={2026},
  note={QAOA bottleneck profiling, Amdahl's Law analysis, and quantum advantage characterization
        for financial portfolio optimization using distributed py-libp2p infrastructure}
}
```

---

## Acknowledgments

- [Qiskit](https://qiskit.org/) (IBM) — quantum computing framework
- [py-libp2p](https://github.com/libp2p/py-libp2p) — peer-to-peer networking
- [FastAPI](https://fastapi.tiangolo.com/) — async Python API framework
- [shadcn/ui](https://ui.shadcn.com/) — UI component library
- [Yahoo Finance](https://finance.yahoo.com/) — market data
- Professor Aswath Damodaran (NYU Stern) — historical returns dataset

---

<div align="center">

**[Architecture](docs/ARCHITECTURE.md)** · **[Research Paper](docs/research/RESEARCH_PAPER_DRAFT.md)** · **[API Docs](http://localhost:8081/docs)** · **[Deployment](DEPLOYMENT-MANUAL.md)** · **[Design System](frontend/DESIGN.md)**

*Built with quantum circuits, debugged with patience, documented with care.*

</div>
