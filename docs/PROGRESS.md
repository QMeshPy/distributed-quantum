# Progress Report: Frontend Migration and Platform Console Foundation

This document records **completed work** for migrating the legacy React dashboard (`frontend/`) to the Next.js application (`frontend-v2/`) and relates it to the long-horizon plan in [FUTURE_ROADMAP.md](FUTURE_ROADMAP.md).

## How this maps to the future roadmap

The [Future Roadmap](FUTURE_ROADMAP.md) spans five milestones (M1–M5). The frontend migration is a **concrete step on Milestone 1 (M1): Production SDK and Platform**, specifically the **operator frontend** and **job / workflow surfaces** described in [Milestone 1: Production SDK and Platform](future-roadmap/01-production-sdk-and-platform.md).

Relevant M1 themes from that milestone:

| Roadmap area | What M1 calls for (summary) | Status after `frontend-v2` |
| --- | --- | --- |
| **M1-C Operator platform** — “build platform console”, “workflow and run management surfaces” | Cohesive console: job list, run detail, execution visibility | **In progress at UI layer**: runs list, run detail, new run, fragment flow, dashboard over services/health/fidelity |
| **Frontend platform console** — workspace shell | Navigable shell (sidebar, structure for future account/org/project switching) | **Partially met**: `DashboardShell` with multi-section navigation, breadcrumbs, responsive layout |
| **Job and workflow surfaces** | Job list with filters, run detail, live execution / plan explorer | **Largely met** for the current POC API: filtered jobs list, paginated plan fragments, execution results, peer flow, quantum analysis views |
| **Stable contracts toward SDKs** | Typed API usage, predictable client behavior | **Foundation**: shared TypeScript types (`types/backend.ts`, `types/runs.ts`, etc.), server-side proxy to coordinator, Zod-friendly patterns where used |

M1 **exit criteria** in the roadmap (stable platform APIs, durable artifacts, full auth/audit, documented deploy) are **not** claimed complete here; they depend on backend, SDK, and operations work beyond this frontend migration.

---

## Migration outcome: `frontend` → `frontend-v2`

### Stack and architecture

- **Framework**: Next.js (App Router) with React 19.
- **Styling**: Tailwind CSS v4, shared UI primitives (shadcn-style components under `src/components/ui/`).
- **State**: Zustand stores for dashboard and runs (`store/dashboard-store.ts`, `store/runs-store.ts`).
- **Data fetching**: React hooks (`use-dashboard-data`, `use-runs-list`, `use-run-detail`, `use-create-run`, `use-circuit-composer`, `use-run-quantum-full-detail`) calling Next.js **Route Handlers** that proxy to the Python coordinator.
- **Visualization**: `@xyflow/react` for fragment flow graphs, `@qctrl/visualizer` / custom components (e.g. Bloch sphere) for quantum visualization, Recharts where charts are used.

### Server-side backend integration (BFF pattern)

A **server-only** client (`src/lib/backend-client.ts`) centralizes calls to the coordinator:

- Base URL from `QUANTUM_BACKEND_URL` (default `http://127.0.0.1:8080`).
- Optional `QUANTUM_BACKEND_API_KEY` as `X-API-Key` when the coordinator requires it.
- JSON fetch with `no-store` caching and structured `BackendClientError` for HTTP failures.

Documented environment variables live in `frontend-v2/.env.example`.

**Proxy routes** aggregate and normalize backend data for the UI:

| Route | Role |
| --- | --- |
| `GET /api/dashboard` | Health (`/api/v1/health`), services (`/api/v1/services`), per-node fidelity (`/api/v1/metrics/fidelity/{node_id}`), merged into a dashboard snapshot with warnings when partial data fails |
| `GET /api/runs` | Jobs list (`/api/v1/jobs`) with `limit` and repeated `status` query params; resilient empty state when jobs API is missing or backend is unreachable in development |
| `POST /api/runs` | Circuit submission (`POST /api/v1/circuits/submit`) with validation against known backend job statuses |
| `GET /api/runs/[runId]` | Single job / run detail for the run page |

This aligns with M1’s direction toward a **clear separation** between browser clients and the coordinator, even before a full “versioned public platform API” ships.

### Operator UX: routes and major features

Primary operator flows under `src/app/(main)/`:

| Area | Route / entry | Capabilities |
| --- | --- | --- |
| **Dashboard** | `/dashboard` | Overview of coordinator health, registered services, and fidelity-oriented metrics (via dashboard transformers and overview components) |
| **Runs list** | `/runs` | Table/list of jobs with status filtering, integration with runs store and list hooks |
| **New run** | `/runs/new` | Circuit composition and submission path (`new-run-page-client`, circuit composer hooks/types) |
| **Run detail** | `/runs/[runId]` | Deep view: status, plan fragments (with pagination), execution results, peer execution flow, quantum analysis section, fragment DAG / canvas where applicable |
| **Fragment flow** | `/runs/[runId]/fragment-flow` | Dedicated fragment flow page client and canvas for plan visualization |

Additional UI includes **login** (`/login`) and a **visual circuit builder** component for interactive circuit construction.

### Domain logic carried forward

Libraries mirror the POC domain (not an exhaustive list):

- **Fragment / plan modeling**: `fragment-dag-model.ts`, `fragment-flow-format.ts`, `peer-flow-model.ts`.
- **Run lifecycle presentation**: `run-status.ts`, transformers for list/detail snapshots.
- **Circuit composition**: `circuit-composer.ts`, `visual-circuit.ts`, related types.

These preserve **inspectable runs and plans**—a stepping stone toward M1’s durable artifact and lineage story once the backend exposes richer persistence.

---

## Relationship to other roadmap milestones (M2–M5)

The [program sequencing doc](future-roadmap/00-sequencing-and-program-plan.md) lists capabilities such as **node enrollment**, **peer identity**, **torrent-native distribution**, and **Hydra-style resilience** in later milestones.

**This migration does not implement those.** It **does** improve the **operator dashboard and run management** surface that later milestones assume as the control-plane UX (see dependency matrix: “operator dashboard and admin console” first appears in M1).

---

## Gaps and natural next steps (roadmap-aligned)

The following remain **out of scope** for “migration complete” but are explicit in [M1](future-roadmap/01-production-sdk-and-platform.md) for a full production platform:

1. **Identity and tenancy**: account / org / project switchers, API keys UI, role-based admin screens (sidebar placeholders exist in template data; full product flows are not shipped).
2. **Platform API versioning**: UI still targets the existing coordinator REST paths; versioned public APIs and generated SDKs are backend/SDK workstreams (M1-A / M1-B).
3. **Durable artifacts and audit**: first-class artifact browser, audit log viewer, and quota dashboards require backend persistence and APIs.
4. **Production operations**: CI/CD, preview envs, and smoke tests for the Next app are separate from the codebase migration (M1-D).
5. **Landing route**: `/` may still reflect the default Next.js starter unless the project adds a redirect or marketing home; day-to-day operator flows use `(main)` routes such as `/dashboard` and `/runs`.

---

## Related documentation

- [FUTURE_ROADMAP.md](FUTURE_ROADMAP.md) — multi-milestone product direction  
- [future-roadmap/01-production-sdk-and-platform.md](future-roadmap/01-production-sdk-and-platform.md) — M1 detail including frontend console pillars  
- [future-roadmap/00-sequencing-and-program-plan.md](future-roadmap/00-sequencing-and-program-plan.md) — milestone dependencies  
- [ARCHITECTURE.md](ARCHITECTURE.md), [tasks.md](tasks.md) — current POC architecture and near-term tasks  

---

*Last updated: reflects the completed migration to `frontend-v2/` as the primary Next.js operator console for the quantum coordinator POC.*
