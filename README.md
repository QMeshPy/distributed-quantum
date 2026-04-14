# Distributed Quantum Services

This repository is the full workspace for a research-oriented distributed quantum orchestration project.
What started as a backend-only proof of concept now includes:

- a Python backend coordinator
- a Next.js dashboard frontend
- a dedicated documentation site

The root `README.md` is now the project-level guide. Each app also has its own local README:

- [`backend/README.md`](backend/README.md)
- [`frontend-v2/README.md`](frontend-v2/README.md)
- [`docs/README.md`](docs/README.md)

## Workspace At A Glance

| Folder | Purpose | Main stack | Local start command |
| --- | --- | --- | --- |
| `backend/` | Coordinator, planner, API, persistence, runtime, libp2p integration | Python, FastAPI, py-libp2p, Qiskit | `make -C backend demo` |
| `frontend-v2/` | Current operator dashboard for jobs, topology, runs, and finance analysis | Next.js 16, React 19, TypeScript, Bun | `bun --cwd frontend-v2 run dev` |
| `docs/` | Public docs site and reference handbook | Next.js 16, Fumadocs, MDX | `npm --prefix docs run dev` |

## What The Project Does

- Discovers quantum service advertisements over `py-libp2p`.
- Normalizes OpenQASM-like circuit input into an internal planning model.
- Builds dependency-aware fragments and assigns them with a deterministic cost-based planner.
- Reserves and executes fragments with retry and fallback behavior.
- Persists jobs, registry state, and runtime events to SQLite.
- Reconstructs finished runs with Qiskit to return counts, state summaries, Bloch vectors, entropy, and fidelity information.
- Exposes the system through a FastAPI API, a React dashboard, and a dedicated docs site.

## Quick Start

The commands below are intended to be run from the repository root.

### Docker Quick Start

The repository now includes a Docker-first deployment path in `docker-compose.yaml` for the current Next.js dashboard in `frontend-v2`, the FastAPI backend, and a Caddy reverse proxy in front.

1. Copy the root env template:

```bash
cp .env.example .env
```

2. For local Docker usage, leave:

```dotenv
CADDY_FRONTEND_SITE_ADDRESS=http://localhost:3000
CADDY_API_SITE_ADDRESS=http://localhost:8080
```

3. Start the stack:

```bash
docker compose up --build
```

4. Open:

- `http://localhost:3000` for the dashboard
- `http://localhost:8080/docs` for FastAPI docs
- `http://localhost:8080/api/v1/health` for the backend health check

Notes:

- The Docker stack persists SQLite data in the named volume `backend_data`, mounted at `backend/data` inside the backend container.
- `frontend-v2` talks to the backend over the internal Docker network, so no manual API URL wiring is needed.
- If you want the simplest container runtime, set `QC_LIBP2P__ENABLED=false` in `.env`. Leaving it `true` keeps the embedded demo libp2p services enabled inside the backend container.
- The frontend production build currently fetches Google font assets during `next build`, so the machine running `docker compose build` needs outbound HTTPS access.
- Locally, Caddy exposes the frontend on `localhost:3000` and the backend on `localhost:8080`, so you do not need custom localhost subdomains.
- The backend container now boots through `make demo-clean-docker`, which clears `backend/data/quantum_coordinator.db` on container start before launching the API.

### EC2 + Caddy

For an EC2 deployment with automatic HTTPS:

1. Point your root domain A record at the EC2 public IP.
2. Point `api.<domain>` at the same EC2 public IP.
3. Open inbound security-group ports `80` and `443`.
4. Set `CADDY_FRONTEND_SITE_ADDRESS` and `CADDY_API_SITE_ADDRESS` in the root `.env`, for example:

```dotenv
CADDY_FRONTEND_SITE_ADDRESS=quantum.example.com
CADDY_API_SITE_ADDRESS=api.quantum.example.com
```

5. Start the stack in the background:

```bash
docker compose up -d --build
```

6. Check the rollout:

```bash
docker compose ps
docker compose logs -f caddy backend frontend-v2
```

If you deploy by raw EC2 IP instead of real DNS, use plain HTTP values such as:

```dotenv
CADDY_FRONTEND_SITE_ADDRESS=http://<EC2_PUBLIC_IP>
CADDY_API_SITE_ADDRESS=http://api.<EC2_PUBLIC_IP>.nip.io
```

or use a real domain for both hosts if you want automatic HTTPS.

### Requirements

- Python `3.10+`
- [`uv`](https://github.com/astral-sh/uv)
- Node.js `20+`
- `bun`
- `npm`
- free local ports for the backend demo: `8080`, `9100`, `9200`, `9201`, `9202`

### 1. Install and run the backend

```bash
make -C backend install
make -C backend demo
```

if you got an error during python packages installtion related to fastecdsa then run:
sudo apt-get install -y libgmp-dev

and reinstall packages

For a clean database:

```bash
make -C backend demo-clean
```

Important note:

- `backend/scripts/demo-start.sh` force-kills anything bound to ports `8080`, `9100`, `9200`, `9201`, and `9202`
- `demo-clean` also removes `backend/data/quantum_coordinator.db`

### 2. Start the frontend dashboard

In a second terminal:

```bash
bun --cwd frontend-v2 install
bun --cwd frontend-v2 run dev
```

If the backend is running somewhere other than `http://127.0.0.1:8080`:

```bash
QUANTUM_BACKEND_URL=http://127.0.0.1:8080 bun --cwd frontend-v2 run dev
```

### 3. Start the docs site

In a third terminal:

```bash
npm --prefix docs install
npm --prefix docs run dev
```

Optional AI docs assistant:

- set `OPENROUTER_API_KEY` to enable the docs chat route
- set `OPENROUTER_MODEL` if you want to override the default model

### Useful URLs

| Surface | URL |
| --- | --- |
| Backend OpenAPI | `http://127.0.0.1:8080/docs` |
| Backend ReDoc | `http://127.0.0.1:8080/redoc` |
| Backend health | `http://127.0.0.1:8080/api/v1/health` |
| Frontend dashboard | `http://127.0.0.1:3000` |
| Docs site | `http://127.0.0.1:3000` |

## Example API Flow

### Check the coordinator

```bash
curl http://127.0.0.1:8080/api/v1/health
curl http://127.0.0.1:8080/api/v1/services
```

### Submit a sample circuit

```bash
curl -X POST http://127.0.0.1:8080/api/v1/circuits/submit \
  -H 'Content-Type: application/json' \
  --data-binary '{
    "circuit": "OPENQASM 3;\nqubit[2] q;\nbit[1] c;\nbell_pair q[0], q[1];\ncnot q[0], q[1];\ncz q[0], q[1];\nteleport q[0], q[1];\nsyndrome_extraction q[0];\ndistillation q[1];\nmeasure q[0] -> c[0];"
  }'
```

### Inspect the job and plan

```bash
curl http://127.0.0.1:8080/api/v1/jobs/<job_id>
curl http://127.0.0.1:8080/api/v1/plans/<plan_id>
curl http://127.0.0.1:8080/api/v1/metrics/fidelity/<node_id>
```

## Supported Service Vocabulary

The backend currently models these service types:

- `hadamard`
- `cnot`
- `cz`
- `controlled_unitary`
- `programmable_gate`
- `qft`
- `teleportation`
- `bell_pair`
- `syndrome_extraction`
- `distillation`
- `measurement_feedforward`

Normalization details:

- aliases such as `h`, `cx`, `bell`, `teleport`, and `measure` are normalized automatically
- unrecognized operations currently fall back to `programmable_gate`

## Repository Map

```text
.
├── README.md                  # workspace-level guide
├── backend/                   # FastAPI coordinator and research backend
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── config/
│   ├── docs/
│   ├── scripts/
│   ├── src/quantum_coordinator/
│   └── tests/
├── frontend-v2/               # Current Next.js operator dashboard
│   ├── README.md
│   └── src/
├── frontend/                  # Legacy Vite dashboard
│   ├── README.md
│   └── src/
└── docs/                      # Next.js + Fumadocs site
    ├── README.md
    ├── app/
    ├── content/docs/
    └── lib/
```

## Documentation Map

- [`MANUAL.md`](MANUAL.md): EC2 deployment guide for the Docker + Caddy stack
- [`backend/README.md`](backend/README.md): backend-specific setup, API, and developer commands
- [`frontend-v2/README.md`](frontend-v2/README.md): current dashboard setup and API wiring
- [`docs/README.md`](docs/README.md): docs site setup, search, and authoring notes
- [`backend/ARCHITECTURE.md`](backend/ARCHITECTURE.md): system-level architecture deep dive
- [`backend/docs/design.md`](backend/docs/design.md): design rationale
- [`backend/docs/requirements.md`](backend/docs/requirements.md): functional and non-functional requirements
- [`backend/docs/tasks.md`](backend/docs/tasks.md): milestone planning and task breakdown
- [`backend/postman.json`](backend/postman.json): importable API collection
- [`docs/content/docs/getting-started/quickstart.mdx`](docs/content/docs/getting-started/quickstart.mdx): end-to-end local workflow

## Important Notes

- There is no root workspace `Makefile` right now. Backend commands must be run via `make -C backend ...` or from inside `backend/`.
- `frontend-v2/` is the active UI. `frontend/` is legacy and should not be used for new setup or deployment work.
- If you still need the legacy UI, use the PM2 helper documented in [`MANUAL.md`](MANUAL.md#legacy-frontend-via-pm2-optional) (`./scripts/manage-legacy-frontend.sh`) instead of adding `frontend/` to Docker Compose.
- `GET /api/v1/plans/{plan_id}` is backed by the coordinator's in-memory plan cache, so plan lookup is only guaranteed for plans compiled since the current backend process started.
- If `QC_LIBP2P__ENABLED=false`, the backend falls back to a local in-process gate adapter instead of real libp2p transport.
- This is a proof-of-concept orchestration system, not a full hardware-backed quantum network stack.
- `teleportation`, `syndrome_extraction`, and `distillation` are still modeled with simplified semantics in the current Qiskit reconstruction path.

## License

The repository currently includes Apache-2.0 license text at [`LICENSE`](LICENSE).
