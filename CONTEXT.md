# CONTEXT

Project context for contributors working in this repository.

Covers: what the platform is, how the code is organized, where the important code lives, and caveats to know before making changes.

Last verified: May 2026.

---

## What This Platform Is

A research-oriented platform that treats quantum-style operations as **discoverable network services**, orchestrated through a Python FastAPI coordinator over real `py-libp2p`, exposed through a Next.js operator console, and persisted to Postgres + MongoDB.

A secondary research workflow uses **QAOA-based portfolio optimization**, demonstrating where quantum computing gains a scaling advantage over classical algorithms for financial optimization problems.

## What This Platform Is Not

- A real quantum hardware control stack (uses Qiskit statevector simulation)
- A production multi-tenant platform (auth is dev-mode stubs)
- A multi-coordinator consensus system
- A finished bring-your-own-node marketplace

Treat it as a serious proof-of-concept orchestration platform with a growing operator console.

---

## Directory Structure

| Directory | Role | Tech |
|---|---|---|
| `backend/` | Primary backend | Python 3.11, FastAPI, py-libp2p (Trio), Qiskit, SQLAlchemy (Postgres), Beanie (MongoDB) |
| `frontend/` | Primary frontend | Next.js 16, React 19, TypeScript, Tailwind 4, shadcn/ui |
| `docs/` | Documentation corpus | Markdown |
| `dataset/` | S&P 500 benchmark data | CSV |
| `deploy/` | Caddy + deployment config | Caddyfile |
| `scripts/` | Utility scripts | Python / Shell |

### Root Files

| File | Purpose |
|---|---|
| `docker-compose.yaml` | Runs `backend` + `frontend` + Caddy. Uses Neon Postgres and Atlas MongoDB by default. |
| `DEPLOYMENT-MANUAL.md` | EC2 + Docker + Caddy + Vercel deployment runbook |
| `.env.example` | Template for Docker/deployment env vars |
| `deploy/Caddyfile` | Reverse proxy config |

---

## Backend Architecture

Package: `backend/src/quantum_backend_v2/`

### Entrypoints

- CLI: `quantum_backend_v2.main:main` (registered as `quantum-backend` console script)
- Bootstrap: `bootstrap/application.py` → `create_application()` builds the FastAPI app
- Lifespan: `api/app.py` handles startup (init persistence, start discovery, run recovery) and shutdown

### Layer Map

| Layer | Path | Responsibility |
|---|---|---|
| **API** | `api/routers/`, `api/models/`, `api/deps/`, `api/errors/` | FastAPI routers, request/response models, auth deps, error contracts |
| **Application** | `application/` | Business logic: `CircuitJobService`, `FinancialJobService`, `EnrollmentService`, distributed statevector execution |
| **Identity** | `identity/` | User roles (ADMIN/OPERATOR/DEVELOPER/VIEWER), trust tiers, token claims, API keys |
| **Persistence** | `persistence/postgres.py` | SQLAlchemy ORM: users, enrollments, workflow runs, execution plans, financial jobs, reservation/execution events (append-only) |
| **Persistence** | `persistence/mongodb.py` | Beanie documents: peer capabilities, topology projections, benchmark results, provenance bundles |
| **Persistence** | `persistence/local_log.py` | JSONL append-only peer log (fsync) |
| **Libp2p** | `libp2p/` | Real py-libp2p host (Ed25519), GossipSub pubsub, stream RPC, Trio thread bridged to asyncio, embedded dev worker swarm |
| **Discovery** | `discovery/` | `DiscoveryService` + `PeerRegistry`: drain pubsub events → upsert MongoDB projections, stale-peer TTL, enrollment visibility |
| **Protocols** | `protocols/` | Wire schemas: execution, reservation, quality, peersync |
| **Reservations** | `reservations/` | Event-sourced state machine: REQUESTED → ACCEPTED → COMMITTED → CANCELLED/EXPIRED/REJECTED |
| **Runtime** | `runtime/` | Execution state machine, crash recovery on startup |
| **Quality** | `quality/` | Service quality catalog: transpiles each service circuit against Qiskit BasicSimulator for fidelity |
| **Workflows** | `workflows/` | Benchmark models and service |

### Configuration

All config flows through `QB2_*` environment variables → `AppSettings.from_env()` Pydantic model.

| Variable | Purpose |
|---|---|
| `QB2_ENVIRONMENT` | development / staging / production / test |
| `QB2_API_HOST` / `QB2_API_PORT` | Bind address (default 0.0.0.0:8081) |
| `QB2_AUTH_REQUIRED` | Auth toggle (false for local dev) |
| `QB2_POSTGRES_TARGET` | `local` or `neon` |
| `QB2_POSTGRES_LOCAL_DSN` / `QB2_POSTGRES_NEON_*_DSN` | Postgres connection strings |
| `QB2_MONGODB_TARGET` | `local` or `remote` |
| `QB2_MONGODB_*_URI` | MongoDB connection strings |
| `QB2_LIBP2P_ENABLED` | Enable/disable real libp2p |
| `QB2_LIBP2P_DEV_SERVICE_PEER_COUNT` | Embedded worker peers (default 4) |

### API Surface (28+ endpoints)

**System**: `GET /`, `GET /api/v1/health`, `GET /api/v1/ready`

**Bootstrap**: `GET /api/v1/bootstrap/libp2p`, `GET /api/v1/bootstrap/libp2p/runtime`

**Discovery**: `GET /api/v1/discovery/peers`, `GET /api/v1/discovery/peers/{peer_id}`, `GET /api/v1/discovery/topology`

**Enrollment**: `POST /api/v1/enrollment/peers`, `GET /api/v1/enrollment/peers`, `POST /api/v1/enrollment/peers/{peer_id}/action`

**Circuits**: `POST /api/v1/circuits/submit`

**Jobs**: `GET /api/v1/jobs`, `GET /api/v1/jobs/{job_id}`

**Plans**: `GET /api/v1/plans/{plan_id}`

**Services**: `GET /api/v1/services`

**Finance**: `POST /api/v1/finance/submit`, `GET /api/v1/finance/{job_id}`, `GET /api/v1/finance/{job_id}/comparison`, `GET /api/v1/finance`

**Workflows**: `POST /api/v1/workflows/runs`, `GET /api/v1/workflows/runs/{run_id}`, `POST /api/v1/workflows/benchmarks`, `GET /api/v1/workflows/benchmarks/{benchmark_id}`

**Reservations**: `POST /api/v1/reservations`, `GET /api/v1/reservations/{reservation_id}`, `POST /api/v1/reservations/{reservation_id}/cancel`

### Quantum Execution Flow

1. Client submits OpenQASM to `POST /api/v1/circuits/submit`
2. `CircuitJobService` creates a `WorkflowRunRecord` (QUEUED)
3. Background: waits for service peers → compiles execution plan → distributes fragments via libp2p RPC → streams results → assembles final quantum state
4. Status: QUEUED → COMPILING → EXECUTING → COMPLETED / FAILED
5. Qiskit builds the quantum result: counts, probabilities, statevector, Bloch vectors, entanglement entropy, density matrices, fidelity, observable expectations

### Quantum Gate/Service Types (11)

`hadamard`, `cnot`, `cz`, `controlled_unitary`, `programmable_gate`, `qft`, `teleportation`, `bell_pair`, `syndrome_extraction`, `distillation`, `measurement_feedforward`

### Running Locally

```bash
cd backend
make install    # uv sync --extra dev
make run        # scripts/demo-start.sh
make run-clean  # flush runtime artifacts, then start
make test       # uv run pytest
make lint       # ruff + mypy
```

---

## Frontend Architecture

Framework: Next.js 16 (App Router), React 19, TypeScript.

### Routing

| Route | Description |
|---|---|
| `/dashboard` | 3D network graph, stats, charts, data table |
| `/runs` | Unified run list (circuit + financial) |
| `/runs/new` | Visual circuit builder + OpenQASM editor |
| `/runs/[runId]` | Run detail, quantum analysis, fragment flow |
| `/finance` | CSV upload, portfolio optimization, quantum-vs-classical comparison |

### BFF Proxy Pattern

The browser never calls the Python backend directly. Next.js API routes (`src/app/api/`) proxy all requests:

- `src/lib/backend-client.ts` — server-only HTTP client (reads `QUANTUM_BACKEND_URL`)
- `src/proxy.ts` — proxy middleware
- `src/lib/*-transformers.ts` — reshape backend snake_case to frontend camelCase

### Running Locally

```bash
cd frontend
npm install
npm run dev     # http://localhost:3000
```

Set `QUANTUM_BACKEND_URL` if backend is not at `http://127.0.0.1:8081`.

---

## Docker Compose (Full Stack)

```bash
cp .env.example .env
docker compose up --build
```

Services: `backend` (port 8081), `frontend` (port 3000), `caddy` (ports 80/443).

---

## Important Caveats

1. **Trio/asyncio bridge**: The libp2p layer runs in a Trio thread, bridged to asyncio via `queue.SimpleQueue`. Do not mix Trio and asyncio primitives.

2. **No WebSockets**: Both backend and frontend use REST polling. No WS endpoints exist.

3. **Auth is dev-mode**: `QB2_AUTH_REQUIRED=false` by default. Production JWT is a stub. Do not build features that assume real auth exists.

4. **Embedded dev swarm**: The libp2p "network" in local dev is a coordinator + N worker peers all running in the same process — a controlled demo fabric, not an open heterogeneous node ecosystem.

5. **Quantum modeling simplifications**: Teleportation = ancilla-free SWAP. Syndrome extraction and distillation = orchestration steps (no stabilizer measurement). Fidelity = consistency reference against ideal compiled state, not hardware tomography.

6. **uv, not pip**: backend uses `uv` for Python package management. Use `uv sync` and `uv run`.

7. **npm**: frontend uses npm. Use `npm install` and `npm run dev`.

---

## Where To Start By Task

| Task | Entry Point |
|---|---|
| Backend API or orchestration | `backend/src/quantum_backend_v2/api/routers/` → `application/` |
| Circuit parsing or planning | `backend/src/quantum_backend_v2/planning/` and `application/distributed_statevector.py` |
| Libp2p or peer discovery | `backend/src/quantum_backend_v2/libp2p/` → `discovery/` |
| Persistence or data models | `backend/src/quantum_backend_v2/persistence/postgres.py` and `persistence/mongodb.py` |
| Alembic migrations | `backend/alembic/` |
| Frontend pages or components | `frontend/src/app/(main)/` for pages, `frontend/src/components/` for components |
| Frontend API layer | `frontend/src/app/api/` and `frontend/src/lib/backend-client.ts` |
| Frontend state or hooks | `frontend/src/store/` and `frontend/src/hooks/` |
| Docker or deployment | `docker-compose.yaml`, `backend/Dockerfile`, `frontend/Dockerfile`, `DEPLOYMENT-MANUAL.md` |
| Docs | `docs/README.md` |
