<div align="center">

# Distributed Quantum Services

**Quantum operations as discoverable peer-to-peer network services — orchestrated over py-libp2p, analyzed with Qiskit**

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Qiskit](https://img.shields.io/badge/Qiskit-1.x-6929C4?logo=ibm&logoColor=white)](https://qiskit.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

[![GitHub Stars](https://img.shields.io/github/stars/Winter-Soren/pylibp2p-nodes-as-quantum-gates?style=social)](https://github.com/Winter-Soren/pylibp2p-nodes-as-quantum-gates/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Winter-Soren/pylibp2p-nodes-as-quantum-gates?style=social)](https://github.com/Winter-Soren/pylibp2p-nodes-as-quantum-gates/network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/Winter-Soren/pylibp2p-nodes-as-quantum-gates?style=social)](https://github.com/Winter-Soren/pylibp2p-nodes-as-quantum-gates/watchers)
[![Last Commit](https://img.shields.io/github/last-commit/Winter-Soren/pylibp2p-nodes-as-quantum-gates?color=brightgreen)](https://github.com/Winter-Soren/pylibp2p-nodes-as-quantum-gates/commits/main)
[![Hits](https://hits.sh/github.com/Winter-Soren/pylibp2p-nodes-as-quantum-gates.svg?label=visitors&color=6929C4)](https://hits.sh/github.com/Winter-Soren/pylibp2p-nodes-as-quantum-gates/)

</div>

---

## What This Is

A research platform with two connected tracks:

**Track 1 — Distributed Quantum Orchestration.** A coordinator node (FastAPI + py-libp2p) discovers worker nodes via GossipSub pubsub, compiles OpenQASM circuits into distributed execution plans, routes fragments to workers over libp2p streams, and assembles full quantum results using Qiskit statevector simulation. A Next.js operator console gives real-time visibility into the peer network, job lifecycle, and quantum analysis output.

**Track 2 — QAOA Portfolio Optimization.** The same infrastructure drives a QAOA-based portfolio optimizer that runs rigorous empirical comparisons against classical baselines (Simulated Annealing) to characterize exactly where — and why — quantum computing gains a scaling advantage.

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

Create `frontend/.env.local`:

```
QUANTUM_BACKEND_URL=http://localhost:8081
NEXT_PUBLIC_TRIAL_DISABLED=true
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

