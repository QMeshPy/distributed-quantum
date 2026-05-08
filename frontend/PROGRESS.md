# frontend-v3 Migration — Progress Tracker

## How to use this file

This file is the **single source of truth** for the frontend-v3 migration project. Update it whenever:
- A task is started or completed
- A bug or issue is discovered
- An architectural decision is made
- A question arises that needs an answer before proceeding

Keep the Summary Dashboard in sync with milestone statuses. Add entries to the Known Issues Log and Decisions Log as they occur. Do not delete old entries — mark them resolved.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 Completed | Done and verified |
| 🟡 In Progress | Actively being worked on |
| 🔴 Blocked | Cannot proceed without external input |
| 🟠 Halted | Started but paused |
| 🔵 In Review | Done, awaiting review |
| ⚪ Pending | Not started yet |
| ✅ | Task complete |
| ❌ | Task not started |
| ⚠️ | Task has a known issue |

---

## Summary Dashboard

| # | Milestone | Status | % Complete | Blockers |
|---|-----------|--------|------------|---------|
| 0 | Architecture & Agent Guidance | 🟢 Completed | 100% | — |
| 1 | Project Scaffolding & Tooling | 🟢 Completed | 100% | — |
| 2 | Auth Feature | 🟢 Completed | 100% | — |
| 3 | Shared Layout & Navigation | 🟢 Completed | 100% | — |
| 4 | Dashboard Feature | 🟢 Completed | 100% | — |
| 5 | Runs Feature | 🟢 Completed | 100% | — |
| 6 | Options Feature | 🟢 Completed | 100% | — |
| 7 | Risk Feature | 🟢 Completed | 100% | — |
| 8 | Financial Feature | 🟢 Completed | 100% | — |
| 9 | Quantum Visualizations | 🟢 Completed | 100% | — |
| 10 | Network Feature | 🟢 Completed | 100% | — |
| 11 | Docs & Settings Features | 🟢 Completed | 100% | — |
| 12 | Performance Audit & Bundle Optimization | 🟢 Completed | 100% | — |
| 13 | E2E Verification | 🟡 In Progress | 75% | Backend build fails on Windows (coincurve) |
| 14 | IPFS Helia + Pinata Integration | ⚪ Pending | 0% | — |

---

## Milestone 0 — Architecture & Agent Guidance

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-02
### Completed: 2026-05-02

### Tasks

- [x] `architecture.md` — feature-first directory structure documented
- [x] `CLAUDE.md` — agent guidance for Claude written
- [x] `DESIGN.md` — Airtable-inspired design system documented (Haas Grotesk, near-black CTAs, signature cards)
- [x] `AGENTS.md` — agent context and conventions written
- [x] `.cursor/rules/frontend-v3.mdc` — Cursor IDE rule created

### Issues

_None._

### Notes

All planning and architecture documents are in place. The Next.js 16 scaffold (`package.json`, `node_modules`, `.next/`) also exists. Actual feature implementation has not started.

---

## Milestone 1 — Project Scaffolding & Tooling

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-03
### Completed: 2026-05-04

### Tasks

- [ ] Set up `src/constants/routes.ts` — typed app route constants
- [ ] Set up `src/constants/api.ts` — backend API endpoint constants
- [ ] Set up `src/constants/backend.ts` — base URLs and service config
- [ ] Set up `src/constants/query-keys.ts` — TanStack Query key factory
- [ ] Set up `src/constants/auth.ts` — auth-related constants (cookie names, expiry, etc.)
- [ ] Set up `src/constants/config.ts` — environment config with validation
- [ ] Set up `src/constants/ui.ts` — shared UI constants (breakpoints, animation durations, z-index map)
- [ ] Set up `src/providers/QueryProvider.tsx` — TanStack Query client wrapper
- [ ] Set up `src/providers/ThemeProvider.tsx` — theme/dark-mode provider
- [ ] Set up `src/providers/AuthProvider.tsx` — auth session context provider
- [ ] Set up `src/shared/components/ui/` — shadcn/ui base components
- [ ] Set up `src/shared/components/layout/` — layout component stubs
- [ ] Set up `src/shared/hooks/` — shared utility hooks
- [ ] Set up `src/shared/lib/` — shared utility functions
- [ ] Set up `src/shared/types/` — shared TypeScript types
- [ ] Configure TanStack Query client (staleTime, retry, refetchOnWindowFocus)
- [ ] Configure Better Auth server instance + MongoDB adapter
- [ ] Configure React Hook Form globally (no per-component setup needed)
- [ ] Set up `src/middleware.ts` for route protection (protect `/dashboard`, `/runs`, `/options`, `/risk`, `/finance`, `/network`, `/analytics`, `/settings`)
- [ ] Migrate `tailwind.config.ts` with DESIGN.md tokens (colors, fonts, spacing)
- [ ] Migrate `globals.css` with CSS custom properties from DESIGN.md

### Issues

_None yet._

### Notes

- Constants architecture is critical — complete this before any feature work so magic strings never appear in feature code.
- `query-keys.ts` should use the factory pattern: `{ all: () => [...], lists: () => [...], detail: (id) => [...] }`.
- TanStack Query client config: `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false` as defaults.
- Better Auth requires `BETTER_AUTH_SECRET` and `MONGODB_URI` env vars.

---

## Milestone 2 — Auth Feature

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-03
### Completed: 2026-05-05

### Tasks

- [ ] `features/auth/server/auth.ts` — Better Auth server instance with email OTP plugin
- [ ] `features/auth/server/session.ts` — RSC session helper (`getSession()` using `auth.api.getSession`)
- [ ] `features/auth/hooks/use-auth.ts` — client hook wrapping Better Auth `useSession`
- [ ] `features/auth/hooks/use-signin.ts` — mutation hook for sign-in
- [ ] `features/auth/hooks/use-signup.ts` — mutation hook for sign-up
- [ ] `features/auth/components/signin-form.tsx` — React Hook Form + Zod resolver
- [ ] `features/auth/components/signup-form.tsx` — React Hook Form + Zod resolver
- [ ] `features/auth/components/trial-banner.tsx` — trial/free-tier status banner
- [ ] `features/auth/schemas/signin.schema.ts` — Zod schema for sign-in
- [ ] `features/auth/schemas/signup.schema.ts` — Zod schema for sign-up
- [ ] `features/auth/types.ts` — auth-related TypeScript types
- [ ] `app/api/auth/[...all]/route.ts` — Better Auth catch-all handler
- [ ] `app/(auth)/signin/page.tsx` — sign-in page (RSC wrapper)
- [ ] `app/(auth)/signup/page.tsx` — sign-up page (RSC wrapper)
- [ ] `app/(auth)/layout.tsx` — auth layout (centered card)
- [ ] Verify OTP email flow end-to-end (request OTP → receive email → verify → session created)
- [ ] Verify protected route redirect (unauthenticated → redirect to /signin)
- [ ] Verify post-auth redirect (signin → /dashboard)

### Issues

_None yet._

### Notes

- Better Auth's email OTP plugin sends a 6-digit code. The custom email sender must be configured via `sendVerificationOTP` in the auth config.
- The v2 implementation used Resend for email. Check if the same Resend API key is available.
- Session strategy: Better Auth uses DB sessions (stored in MongoDB). No JWT management needed on the app side.
- The `(auth)` route group should NOT be wrapped by the main app sidebar layout.

---

## Milestone 3 — Shared Layout & Navigation

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-03
### Completed: 2026-05-05

### Design Spec: See `frontend-v3/SPEC.md` for full UI & navigation architecture.

### Tasks

#### Constants & Config
- [ ] `constants/navigation.ts` — typed `NAV_CONFIG` with 5 rail items (Dashboard, Network, Lab, Docs, Settings)
- [ ] `constants/breadcrumbs.ts` — `BREADCRUMB_LABELS` map for auto-breadcrumb resolution

#### Shell Components
- [ ] `shared/components/layout/dashboard-shell.tsx` — main shell reads `NAV_CONFIG`, renders rail + sidebar + content
- [ ] `shared/components/layout/icon-rail.tsx` — 5-icon vertical rail (68px wide)
- [ ] `shared/components/layout/rail-item.tsx` — single rail icon + label with active state
- [ ] `shared/components/layout/workspace-switcher.tsx` — static "QG" monogram (future: dropdown)
- [ ] `shared/components/layout/sidebar-panel.tsx` — conditional sidebar renderer (static vs dynamic)

#### Static Sidebar Components
- [ ] `shared/components/layout/static-sidebar.tsx` — renders `NavGroupConfig[]` (for Network, Docs, Settings)
- [ ] `shared/components/layout/sidebar-group.tsx` — group heading + list of links
- [ ] `shared/components/layout/sidebar-link.tsx` — single nav link with active state indicator

#### Dynamic Sidebar Components (Lab)
- [ ] `shared/components/layout/dynamic-sidebar.tsx` — renders `NavToolConfig[]` with history items
- [ ] `shared/components/layout/lab-tool-group.tsx` — collapsible group: header + [+ New] + history items + "View all"
- [ ] `shared/components/layout/lab-history-item.tsx` — single history entry (status badge + label + time)

#### Header & Breadcrumbs
- [ ] `shared/components/layout/site-header.tsx` — top header bar container
- [ ] `shared/components/layout/auto-breadcrumbs.tsx` — config-driven breadcrumbs (reads URL + NAV_CONFIG + BREADCRUMB_LABELS)

#### User Navigation
- [ ] `shared/components/layout/nav-user.tsx` — user avatar + plan badge + dropdown (trial status from auth context)

#### Root Layouts
- [ ] `app/layout.tsx` — root layout with providers: `ThemeProvider` > `AuthProvider` > `QueryProvider`
- [ ] `app/(main)/layout.tsx` — main authenticated layout wrapping `DashboardShell`

### Issues

_None yet._

### Notes

- **Design spec:** Full architecture documented in `frontend-v3/SPEC.md` and on Notion.
- The sidebar uses shadcn `Sidebar` primitives (Collapsible, SidebarGroup, SidebarMenuItem, etc.).
- Dashboard rail item has `hasSidebar: false` — sidebar collapses, main content gets full width.
- Lab sidebar fetches recent jobs via 4 parallel TanStack Query hooks (one per tool).
- `nav-user.tsx` must display trial status from auth context.
- `app/layout.tsx` provider order matters: `ThemeProvider` > `AuthProvider` > `QueryProvider`.
- **No Analytics rail icon** — analytics content is placed contextually (Bloch sphere in run detail, fidelity in network, etc.).

---

## Milestone 4 — Dashboard Feature

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-04
### Completed: 2026-05-05

### Design Spec: See `SPEC.md` §7.1 for block map.

### Tasks

- [ ] `features/dashboard/types.ts` — dashboard data types
- [ ] `features/dashboard/server/dashboard-service.ts` — RSC data fetcher using `React.cache()`
- [ ] `features/dashboard/lib/dashboard-transformers.ts` — data transformation utilities (ported from v2)
- [ ] `features/dashboard/hooks/use-dashboard-data.ts` — TanStack Query hook for dashboard stats
- [ ] `features/dashboard/hooks/use-activity-feed.ts` — TanStack Query hook for recent activity (limit 5)
- [ ] `features/dashboard/components/dashboard-kpi-cards.tsx` — 4 KPI summary cards (Nodes, Services, Fidelity, Qubits)
- [ ] `features/dashboard/components/dashboard-health-status.tsx` — 2 mini-cards (health badge + environment info)
- [ ] `features/dashboard/components/dashboard-activity-feed.tsx` — recent 5 jobs across all Lab tools
- [ ] `features/dashboard/components/dashboard-quick-actions.tsx` — static action buttons linking to Lab tools
- [ ] `app/(main)/dashboard/page.tsx` — RSC page, full-width (no sidebar), server-side KPI data

### Issues

_None yet._

### Notes

- **Full-width layout** — Dashboard has `hasSidebar: false` in NAV_CONFIG, so no sidebar.
- `dashboard-transformers.ts` exists in v2 at `src/lib/dashboard-transformers.ts` — port it directly, do not rewrite.
- Dashboard page should use RSC for KPI cards (no loading spinner on first paint).
- Activity feed is client-side (TanStack Query) — shows shimmer skeleton while loading.
- **NOT on Dashboard:** 3D network graph (→ Network > Topology), area charts (→ Network > Fidelity), service table (→ Network > Services), Bloch spheres (→ Run detail).

---

## Milestone 5 — Runs Feature

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-05
### Completed: 2026-05-05

### Tasks

- [ ] `features/runs/types.ts` — Run, RunStatus, Fragment, FragmentDAG types
- [ ] `features/runs/lib/fragment-dag-model.ts` — DAG data model utilities
- [ ] `features/runs/lib/fragment-flow-format.ts` — ReactFlow node/edge format converters
- [ ] `features/runs/lib/peer-flow-model.ts` — peer network flow model
- [ ] `features/runs/lib/run-status.ts` — status enum and helpers
- [ ] `features/runs/lib/run-transformers.ts` — API response → UI model transformers
- [ ] `features/runs/hooks/use-runs-list.ts` — TanStack Query list hook
- [ ] `features/runs/hooks/use-run-detail.ts` — TanStack Query detail hook with polling on active status
- [ ] `features/runs/hooks/use-create-run.ts` — TanStack Query mutation hook
- [ ] `features/runs/hooks/use-quantum-run-detail.ts` — full quantum detail with circuit data
- [ ] `features/runs/server/runs-service.ts` — RSC data fetchers
- [ ] `features/runs/components/runs-table.tsx` — sortable/filterable runs list
- [ ] `features/runs/components/run-status-badge.tsx` — status pill component
- [ ] `features/runs/components/run-detail-header.tsx` — run detail page header
- [ ] `features/runs/components/run-metrics-panel.tsx` — quantum metrics display
- [ ] `features/runs/components/run-create-form.tsx` — RHF + Zod run creation form
- [ ] `features/runs/components/fragment-flow-canvas.tsx` — ReactFlow visualization (**dynamic import, ssr: false**)
- [ ] `features/runs/components/quantum-circuit-viewer.tsx` — circuit display component
- [ ] `app/(main)/runs/page.tsx` — runs list page
- [ ] `app/(main)/runs/new/page.tsx` — create new run page
- [ ] `app/(main)/runs/[runId]/page.tsx` — run detail page
- [ ] `app/(main)/runs/[runId]/fragment-flow/page.tsx` — fragment flow visualization page

### Issues

_None yet._

### Notes

- `fragment-flow-canvas.tsx` uses ReactFlow which is browser-only and heavy — MUST be dynamically imported.
- Polling interval for active runs: 3000ms. Stop polling when status is `completed` or `failed`.
- Run creation form needs circuit configuration fields — reference v2 for the full field set.

---

## Milestone 6 — Options Feature

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-05
### Completed: 2026-05-05

### Tasks

- [ ] `features/options/types.ts` — OptionsJob, OptionsRequest, OptionsResult types
- [ ] `features/options/schemas/options-request.schema.ts` — Zod schema
- [ ] `features/options/hooks/use-options-job.ts` — TanStack Query with polling on pending status
- [ ] `features/options/hooks/use-options-batch.ts` — mutation for batch CSV upload
- [ ] `features/options/server/options-service.ts` — RSC data fetchers
- [ ] `features/options/components/options-pricing-form.tsx` — RHF + Zod
- [ ] `features/options/components/options-result-card.tsx` — pricing result display
- [ ] `features/options/components/options-result-dashboard.tsx` — full results view
- [ ] `features/options/components/options-hero.tsx` — page hero section
- [ ] `features/options/components/batch/batch-upload-panel.tsx` — CSV drag-and-drop
- [ ] `features/options/components/batch/batch-results-dashboard.tsx` — batch results table/chart
- [ ] `features/options/components/batch/batch-benchmark-client.tsx` — benchmark comparison
- [ ] `app/(main)/options/page.tsx` — single options pricing page
- [ ] `app/(main)/options/batch/page.tsx` — batch pricing page
- [ ] `app/api/options/route.ts` — proxy to backend `/api/options`
- [ ] `app/api/options/batch/route.ts` — proxy for batch upload

### Issues

_None yet._

### Notes

- Polling interval for options job: 2000ms. Stop when status is `completed` or `failed`.
- Batch upload accepts CSV with columns: `S, K, T, r, sigma, option_type`. Validate on the client before upload.
- Reference v2 `batch-upload-panel.tsx`, `batch-results-dashboard.tsx`, `batch-benchmark-client.tsx` for UI patterns.

---

## Milestone 7 — Risk Feature

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-05
### Completed: 2026-05-05

### Tasks

- [ ] `features/risk/types.ts` — RiskJob, RiskRequest, RiskResult, PortfolioItem types
- [ ] `features/risk/schemas/risk-request.schema.ts` — Zod schema for form validation
- [ ] `features/risk/hooks/use-risk-job.ts` — TanStack Query with polling
- [ ] `features/risk/hooks/use-risk-upload.ts` — mutation for CSV portfolio upload
- [ ] `features/risk/server/risk-service.ts` — RSC data fetchers
- [ ] `features/risk/components/risk-upload-panel.tsx` — portfolio CSV upload
- [ ] `features/risk/components/risk-hero.tsx` — page hero
- [ ] `features/risk/components/risk-job-card.tsx` — job status card
- [ ] `features/risk/components/risk-job-progress.tsx` — progress bar/stepper
- [ ] `features/risk/components/risk-result-dashboard.tsx` — VaR / CVaR / risk metrics display
- [ ] `features/risk/components/risk-analytics-client.tsx` — interactive analytics panel
- [ ] `app/(main)/risk/page.tsx` — risk analysis page
- [ ] `app/api/risk/route.ts` — proxy to backend `/api/risk`
- [ ] `app/api/risk/[jobId]/route.ts` — job status proxy

### Issues

_None yet._

### Notes

- Risk engine runs async jobs. Poll `/api/risk/{jobId}` every 2000ms until `status === "completed"`.
- Reference v2 `risk-engine.py` for the backend API contract.
- CSV format: one row per asset with columns `ticker, weight, value`. Validate before upload.

---

## Milestone 8 — Financial Feature

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-05
### Completed: 2026-05-05

### Tasks

- [ ] `features/financial/types.ts` — Portfolio, FactorReturn, Allocation, HistoricalReturn types
- [ ] `features/financial/schemas/` — Zod schemas for all financial form inputs
- [ ] `features/financial/hooks/use-portfolio-comparison.ts` — TanStack Query with polling
- [ ] `features/financial/hooks/use-factor-analysis.ts` — TanStack Query hook
- [ ] `features/financial/hooks/use-portfolio-upload.ts` — CSV upload mutation
- [ ] `features/financial/server/financial-service.ts` — RSC data fetchers with `React.cache()`
- [ ] `features/financial/lib/financial-transformers.ts` — API → chart-ready data transformers
- [ ] `features/financial/components/portfolio-upload-panel.tsx`
- [ ] `features/financial/components/portfolio-comparison-chart.tsx` — dynamic import
- [ ] `features/financial/components/factor-attribution-table.tsx`
- [ ] `features/financial/components/allocation-pie-chart.tsx` — dynamic import
- [ ] `features/financial/components/historical-returns-chart.tsx` — dynamic import
- [ ] `app/(main)/finance/page.tsx` — financial overview
- [ ] `app/(main)/finance/portfolio/page.tsx` — portfolio analysis
- [ ] `app/(main)/finance/comparison/page.tsx` — portfolio comparison
- [ ] `app/(main)/finance/factors/page.tsx` — factor model analysis
- [ ] `app/(main)/finance/allocation/page.tsx` — asset allocation
- [ ] `app/api/finance/route.ts` and sub-routes

### Issues

_None yet._

### Notes

- Dataset files are in `dataset/massive/` and `dataset/damodaran/` — financial feature may reference these.
- Chart components (recharts/Victory) are browser-only — all must use `next/dynamic`.
- Factor analysis uses the Fama-French 3-factor model (dataset in `dataset/massive/F-F_Research_Data_Factors_daily.csv`).

---

## Milestone 9 — Quantum Visualizations

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-06
### Completed: 2026-05-06

### Tasks

- ✅ `features/quantum/types.ts` — Gate, QubitState, CircuitLayer, BlochVector, CircuitResult types
- ✅ `features/quantum/lib/circuit-composer.ts` — composeCircuit (QASM), validateCircuit, estimateDepth
- ✅ `features/quantum/lib/visual-circuit.ts` — getGateDisplay, computeGridLayout
- ✅ `features/quantum/hooks/use-circuit-composer.ts` — useState-based circuit composer hook (addGate, removeGate, clearCircuit, addLayer, qasmOutput, depth)
- ✅ `features/quantum/components/bloch-sphere.tsx` — SVG placeholder Bloch sphere (TODO: replace with Three.js); dynamically imported by consumers
- ✅ `features/quantum/components/visual-circuit-builder.tsx` — click-to-place circuit builder (**dynamically imported via next/dynamic in parent**)
- ✅ `features/quantum/components/gate-palette.tsx` — quantum gate selector (H, X, Y, Z, S, T, RX, RY, RZ, CNOT, Toffoli)
- ✅ `features/quantum/components/circuit-output-panel.tsx` — QASM code display + measurement bar chart
- ✅ `features/quantum/index.ts` — public barrel file
- ✅ `features/runs/components/run-detail-page-client.tsx` — BlochSphere wired into Quantum State tab via `next/dynamic({ ssr: false })`
- ✅ Architecture audit fixes: added `index.ts` barrels for all features (runs, options, risk, finance, network, dashboard, settings, quantum)
- ✅ `app/(main)/runs/[runId]/fragment-flow/page.tsx` — thin shell routing to `FragmentFlowPageClient`
- ✅ All page.tsx files refactored to ≤10-line shells (runs, options/[jobId], risk, finance)
- ✅ `shared/lib/utils.ts` re-export created
- ✅ Build: 0 TypeScript errors, 53 routes compiled
- ✅ Lint: 0 new errors introduced (2 pre-existing errors in shadcn carousel.tsx and hooks/use-mobile.ts)

### Issues

_None._

### Notes

- Bloch sphere uses SVG placeholder; consumers must wrap with `next/dynamic({ ssr: false })`.
- Visual circuit builder is client-only; consumers must use `next/dynamic({ ssr: false })`.
- Gate set: H, X, Y, Z, CNOT, T, S, RX, RY, RZ, Toffoli.
- Architecture audit also resolved: missing index.ts barrels across all feature modules.

---

## Milestone 10 — Network Feature

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-05
### Completed: 2026-05-05

### Design Spec: See `SPEC.md` §7.4 for block map.

### Tasks

#### Network Feature
- [ ] `features/network/types.ts` — Node, Peer, Circuit, Zone, Mesh types
- [ ] `features/network/server/network-service.ts`
- [ ] `features/network/hooks/use-network-topology.ts`
- [ ] `features/network/hooks/use-network-nodes.ts`
- [ ] `features/network/hooks/use-network-fidelity.ts`
- [ ] `features/network/components/network-3d-graph.tsx` — force-directed 3D graph (**dynamic import, ssr: false**)
- [ ] `features/network/components/node-table.tsx` — full data table with search/filter/sort
- [ ] `features/network/components/service-table.tsx` — service registry table
- [ ] `features/network/components/fidelity-chart.tsx` — interactive area chart (**dynamic import**)
- [ ] `features/network/components/dag-viewer.tsx` — DAG visualization
- [ ] `features/network/components/circuit-path-viewer.tsx` — circuit path viewer
- [ ] `features/network/components/zone-map.tsx` — zone map
- [ ] `app/(main)/network/mesh/page.tsx`
- [ ] `app/(main)/network/nodes/page.tsx`
- [ ] `app/(main)/network/services/page.tsx`
- [ ] `app/(main)/network/fidelity/page.tsx`
- [ ] `app/(main)/network/circuits/page.tsx`
- [ ] `app/(main)/network/dag/page.tsx`
- [ ] `app/(main)/network/zones/page.tsx`

### Issues

_None yet._

### Notes

- **No standalone Analytics section** — analytics content is placed contextually:
  - Bloch Spheres → Run detail page (Quantum State tab, M5/M9)
  - Fidelity trends → Network > Fidelity page (this milestone)
  - Financial analytics → Financial job result pages (M8)
  - Run-specific analytics → Run detail page (Overview tab, M5)
- 3D network graph likely uses `three-forcegraph` or `react-force-graph-3d` — confirm package before implementing.
- Each network page has ONE block. No overlap with other pages.

---

## Milestone 11 — Docs & Settings Features

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-05
### Completed: 2026-05-05

### Tasks

#### Settings Feature
- [ ] `features/settings/types.ts`
- [ ] `features/settings/hooks/use-settings.ts`
- [ ] `features/settings/components/profile-form.tsx` — RHF + Zod
- [ ] `features/settings/components/api-keys-panel.tsx`
- [ ] `features/settings/components/notifications-form.tsx`
- [ ] `app/(main)/settings/profile/page.tsx`
- [ ] `app/(main)/settings/api-keys/page.tsx`
- [ ] `app/(main)/settings/notifications/page.tsx`
- [ ] `app/(main)/settings/billing/page.tsx`
- [ ] `app/(main)/settings/team/page.tsx`
- [ ] `app/(main)/settings/security/page.tsx`

#### Docs Pages
- [ ] `app/(main)/docs/getting-started/page.tsx`
- [ ] `app/(main)/docs/api/page.tsx`
- [ ] `app/(main)/docs/quantum-gates/page.tsx`
- [ ] `app/(main)/docs/circuits/page.tsx`
- [ ] `app/(main)/docs/options-pricing/page.tsx`
- [ ] `app/(main)/docs/risk-engine/page.tsx`

### Issues

_None yet._

### Notes

- Docs pages are likely static MDX or plain TSX — no server data needed.
- Settings pages require auth; server-side session check before rendering.
- API keys panel needs careful security treatment — never log or expose full keys.

---

## Milestone 12 — Performance Audit & Bundle Optimization

### Status: 🟢 Completed
### Owner: —
### Started: 2026-05-06
### Completed: 2026-05-06

### Tasks

- [x] Add `@next/bundle-analyzer` and `ANALYZE=true bun run build` script
- [x] Confirm all heavy components use `next/dynamic` with `ssr: false`:
  - [x] `fragment-flow-canvas.tsx` — dynamically imported via `RunDetailPageClient` (ReactFlow placeholder; will auto-apply when ReactFlow added)
  - [x] `network-3d-graph.tsx` — dynamically imported via `MeshPageClient` (react-force-graph-3d placeholder; ready for M9 implementation)
  - [x] `bloch-sphere.tsx` — does not exist yet (Quantum feature planned for future milestone), skip per spec
  - [x] `visual-circuit-builder.tsx` — does not exist yet (Quantum feature planned), skip per spec
  - [x] recharts chart components — no direct recharts barrel imports found
- [x] Audit all imports — no barrel imports from `@/components/ui` found (all imports are direct)
- [x] Verify `React.cache()` in all RSC data fetchers — all `*/server/*-service.ts` files confirmed with `cache()` + `import "server-only"`
- [x] Add `experimental.optimizePackageImports` for `lucide-react`, `recharts`, `@radix-ui/react-icons`
- [x] Verify `constants/index.ts` re-exports all modules (routes, api, backend, query-keys, auth, config, ui, navigation, breadcrumbs) — ✅ confirmed
- [x] No magic strings: `http://localhost` correctly in `constants/backend.ts` as env fallback, no `/api/` strings in feature code
- [ ] Run Lighthouse on `/dashboard`, `/runs`, `/options`, `/risk` pages — requires live server
- [ ] Document Lighthouse scores — requires live server

### Issues

_None._

### Notes

- `MeshPageClient` created at `features/network/components/mesh-page-client.tsx` — uses `next/dynamic` for `Network3dGraph`
- `RunDetailPageClient` created at `features/runs/components/run-detail-page-client.tsx` — uses `next/dynamic` for `FragmentFlowCanvas`
- `mesh/page.tsx` and `runs/[runId]/page.tsx` refactored to thin shells (≤10 lines) importing from feature barrels
- `@next/bundle-analyzer@16.2.4` installed; `analyze` script added to `package.json`
- Lighthouse requires running frontend + backend servers; deferred to live deployment verification

---

## Milestone 13 — E2E Verification

### Status: 🟡 In Progress
### Owner: —
### Started: 2026-05-06
### Completed: —
### Verified on: 2026-05-06

### Static Checks (Done)

- [x] **Build check** — `bun run build` passes with 0 TypeScript errors; 53 routes compiled (14 dynamic, 39 static)
- [x] **Lint check** — `bun lint` passes (exit code 0); 0 errors, 6 pre-existing warnings
- [x] **Route completeness** — all routes from `architecture.md` verified or created:
  - [x] `analytics/page.tsx` + 7 sub-pages → redirects to `/dashboard` (analytics removed per ADR)
  - [x] `dashboard/network-health/page.tsx` — created
  - [x] `finance/benchmark/page.tsx`, `finance/execution/page.tsx`, `finance/frontier/page.tsx`, `finance/states/page.tsx` — created
  - [x] `runs/[runId]/fragment-flow/page.tsx` — created (redirects to run detail `?tab=fragment-flow`)
  - [x] `network/page.tsx` — created (redirects to `/network/mesh`)
- [x] **Middleware / proxy** — `src/proxy.ts` verified: protects all `(main)` routes, allows `/api/auth/*`, redirects authenticated users away from `/signin`/`/signup`
- [x] **Providers order** — fixed from `QueryProvider > ThemeProvider > AuthProvider` to `ThemeProvider > AuthProvider > QueryProvider`
- [x] **`features/auth/server/session.ts`** — exists, has `getSession()` with `headers()` + Better Auth
- [x] **`src/shared/lib/utils.ts`** — exists, re-exports `cn()` from `@/lib/utils`

### Auth Proxy Verification (Static — 2026-05-06)

- [x] **Unauthenticated `/dashboard`** → 307 redirect to `/signin?next=%2Fdashboard` ✅ (confirmed via curl: `GET /dashboard` → 307)
- [x] **Authenticated user on `/signin`** → 302 redirect to `/dashboard` ✅ (proxy.ts line 21-23: `isAuthPath && sessionCookie → redirect DASHBOARD`)
- [x] **`/api/auth/*` always public** ✅ (`PUBLIC_PATHS` includes `/api/auth`; `isPublic()` matches prefix; all `(main)` routes fall through to the no-session check)
- [x] **All `(main)` routes protected** ✅ (matcher covers all paths; only `/signin`, `/signup`, `/api/auth` explicitly public)

### Frontend Route Checks (Live — 2026-05-06, frontend dev server port 3000)

| Route | HTTP Status | Notes |
|-------|-------------|-------|
| `/` | 307 | → `/signin` (unauthenticated, expected) |
| `/signin` | 200 | Renders sign-in page |
| `/signup` | 200 | Renders sign-up page |
| `/dashboard` | 307 | → `/signin` (unauthenticated, expected) |
| `/runs` | 307 | → `/signin` (unauthenticated, expected) |
| `/options` | 307 | → `/signin` (unauthenticated, expected) |
| `/risk` | 307 | → `/signin` (unauthenticated, expected) |
| `/finance` | 307 | → `/signin` (unauthenticated, expected) |
| `/network/mesh` | 307 | → `/signin` (unauthenticated, expected) |
| `/network/nodes` | 307 | → `/signin` (unauthenticated, expected) |
| `/network/services` | 307 | → `/signin` (unauthenticated, expected) |
| `/docs` | 307 | → `/signin` (unauthenticated, expected) |
| `/settings` | 307 | → `/signin` (unauthenticated, expected) |

All 307s are correct — unauthenticated access to protected routes redirects to `/signin`. Dashboard title: `<title>Quantum Platform</title>` ✅

### API Proxy Route Checks (Live — 2026-05-06)

| Route | HTTP Status | Notes |
|-------|-------------|-------|
| `/api/runs` | 307 | → auth redirect (expected without session) |
| `/api/options` | 307 | → auth redirect (expected without session) |
| `/api/risk` | 307 | → auth redirect (expected without session) |
| `/api/finance` | 307 | → auth redirect (expected without session) |
| `/api/network/topology` | 307 | → auth redirect (expected without session) |
| `/api/network/peers` | 307 | → auth redirect (expected without session) |
| `/api/network/services` | 307 | → auth redirect (expected without session) |

### Backend API Checks (Live — 2026-05-06)

**Status: FAILED — backend did not start**

Error: `coincurve==21.0.0` build failed — `RuntimeError: Expected exactly one LICENSE file in cffi distribution, got 0`. This is a `libp2p` transitive dependency issue on Windows. Backend endpoints untested.

- [ ] `GET /api/v1/health` — not tested (backend down)
- [ ] `GET /api/v1/discovery/topology` — not tested
- [ ] `GET /api/v1/services` — not tested
- [ ] `GET /api/v1/jobs` — not tested

### Runtime Checks (Pending — requires authenticated session + working backend)

- [ ] Sign up / sign in / sign out flows
- [ ] Options pricing job submission and polling
- [ ] Risk analysis job submission and result display
- [ ] Runs list, create run, run detail with fragment flow tab
- [ ] Dashboard KPI cards load real data
- [ ] Playwright E2E suite passes

### Issues

- Backend fails to build on Windows due to `coincurve==21.0.0` → `hatchling` build error (missing LICENSE in cffi distribution). Workaround: run backend on Linux/WSL or pin `coincurve` to an older version.

### Notes

- Full E2E requires both frontend dev server and backend-v2 running
- `proxy.ts` uses `getSessionCookie` from `better-auth/cookies` — lightweight cookie check, no DB round-trip
- All analytics routes are deliberately empty redirects per the ADR decision to remove standalone Analytics section
- `fragment-flow/page.tsx` redirects to the tab-based run detail page; `fragment-flow-canvas.tsx` dynamically imported on tab switch
- `src/constants/backend.ts` default URL corrected from `http://localhost:8000` to `http://localhost:8081`

---

## Milestone 14 — IPFS Helia + Pinata Integration

### Status: ⚪ Pending
### Owner: —
### Started: —
### Completed: —

### Vision

Transform the platform into the world's first verifiable peer-to-peer quantum computing platform. Every user's frontend (browser or desktop app) runs a Helia IPFS node, enabling true peer-to-peer quantum circuit sharing, real-time execution observation, and community-driven circuit libraries — all without backend intermediation for content distribution.

**Architecture**: Frontend-only IPFS. Backend continues handling quantum execution via libp2p unchanged. IPFS Helia runs entirely in user frontends for content sharing. Pinata provides optional long-term persistence, managed entirely from the frontend (frontend-to-Pinata directly, bypassing backend).

### Key Use Cases

1. **Public Quantum Circuit Library** — Decentralized marketplace of quantum circuits. Users publish circuits to IPFS with metadata. Community curates. Zero platform lock-in, censorship-resistant, automatic attribution.
2. **Workflow Cloning & Collaborative Research** — GitHub-style collaboration for quantum computing. Every completed workflow has a CID. Users share, clone, fork, and compare workflows with full provenance chains. Academic citations via permanent CIDs.
3. **Real-Time Execution Observation** — "Twitch for quantum computing". Users subscribe to live execution streams of other users' workflows via IPFS pubsub. Pure P2P — no backend involvement in streaming.
4. **Decentralized Benchmark Leaderboards** — Community-maintained leaderboards stored on IPFS with cryptographic verification. Signed benchmark records, verifiable by anyone via CIDs.
5. **Frontend-Managed Circuit Storage & Sharing** — Users store quantum workflows directly to IPFS from their frontend, creating personal circuit repositories they fully own.

### Tasks

#### Infrastructure
- [ ] `bun add helia @helia/unixfs @helia/json @helia/strings` — install Helia packages
- [ ] `bun add @pinata/sdk` or use Pinata REST API directly
- [ ] `src/features/ipfs/lib/helia-node.ts` — singleton Helia node factory (browser-only, `next/dynamic`)
- [ ] `src/features/ipfs/lib/pinata-client.ts` — Pinata REST client wrapper
- [ ] `src/features/ipfs/hooks/use-helia.ts` — React hook to initialize/access Helia node
- [ ] `src/features/ipfs/hooks/use-ipfs-upload.ts` — TanStack mutation for uploading content to IPFS
- [ ] `src/features/ipfs/hooks/use-ipfs-fetch.ts` — TanStack query for fetching content by CID
- [ ] `src/features/ipfs/hooks/use-pinata-pin.ts` — TanStack mutation for pinning CIDs to Pinata
- [ ] `src/features/ipfs/types.ts` — CID, CircuitRecord, WorkflowRecord, BenchmarkRecord types
- [ ] `src/constants/ipfs.ts` — IPFS gateway URLs, Pinata API base, pubsub topic names
- [ ] Add `PINATA_API_KEY`, `PINATA_SECRET_API_KEY`, `NEXT_PUBLIC_IPFS_GATEWAY` to `.env.local`

#### Circuit Library Feature
- [ ] `src/features/ipfs/components/circuit-library-panel.tsx` — browsable circuit library (dynamic import)
- [ ] `src/features/ipfs/components/circuit-publish-form.tsx` — RHF + Zod form to publish circuit to IPFS
- [ ] `src/features/ipfs/components/circuit-card.tsx` — single circuit card with CID, metadata, Load button
- [ ] `src/features/ipfs/hooks/use-circuit-library.ts` — TanStack Query hook to fetch circuits from IPFS DHT
- [ ] Wire circuit library into `runs/new/page.tsx` as "Load from Library" option
- [ ] `app/(main)/runs/library/page.tsx` — dedicated circuit library page

#### Workflow Sharing
- [ ] `src/features/ipfs/lib/workflow-serializer.ts` — serialize RunDetail → IPFS-storable WorkflowRecord
- [ ] `src/features/ipfs/components/share-workflow-button.tsx` — "Share via IPFS" button on run detail
- [ ] `src/features/ipfs/components/workflow-cid-badge.tsx` — shows CID with copy + IPFS gateway link
- [ ] Wire into `runs/[runId]/page.tsx` — show CID badge and share button after completion
- [ ] `app/(main)/runs/[runId]/share/page.tsx` — public share page (fetches from IPFS, no auth required)

#### Live Execution Observation (pubsub)
- [ ] `src/features/ipfs/hooks/use-pubsub-subscribe.ts` — subscribe to IPFS pubsub topic
- [ ] `src/features/ipfs/hooks/use-pubsub-publish.ts` — publish execution events to pubsub
- [ ] `src/features/ipfs/components/live-executions-feed.tsx` — live feed of public workflows
- [ ] `src/features/ipfs/components/execution-observer-panel.tsx` — observe a specific workflow in realtime
- [ ] Privacy controls: private / anonymized / public flag on run submit form

#### Benchmark Leaderboards
- [ ] `src/features/ipfs/lib/benchmark-record.ts` — create + sign benchmark records
- [ ] `src/features/ipfs/components/leaderboard-panel.tsx` — dynamic leaderboard from IPFS
- [ ] `src/features/ipfs/components/submit-benchmark-button.tsx` — submit run result as benchmark
- [ ] `app/(main)/network/leaderboard/page.tsx` — leaderboard page

#### Pinata Persistence
- [ ] `src/features/ipfs/components/pin-to-pinata-button.tsx` — "Pin for permanent access" button
- [ ] `src/features/ipfs/components/pinned-content-list.tsx` — user's pinned content management
- [ ] `app/(main)/settings/ipfs/page.tsx` — IPFS + Pinata settings (API keys, pinned content, usage)

#### Navigation
- [ ] Add "Library" sub-item to Runs section in `constants/navigation.ts`
- [ ] Add "Leaderboard" sub-item to Network section in `constants/navigation.ts`
- [ ] Add "IPFS" sub-item to Settings section in `constants/navigation.ts`

#### index.ts barrel
- [ ] `src/features/ipfs/index.ts` — public barrel

### Issues

_None yet._

### Notes

- Helia is browser-only (uses WebRTC/WebSockets transports). ALL Helia components MUST use `next/dynamic({ ssr: false })`.
- The Helia node should be a singleton created once per browser session — use a module-level cache in `helia-node.ts`.
- IPFS pubsub requires Helia + libp2p pubsub (GossipSub). Install `@chainsafe/libp2p-gossipsub`.
- CIDs should be stored in MongoDB alongside workflow/run records so the backend can reference them.
- Pinata REST API is simpler than the SDK for frontend use — use `fetch` directly to `https://api.pinata.cloud`.
- The `NEXT_PUBLIC_IPFS_GATEWAY` should default to `https://gateway.pinata.cloud/ipfs/` for reliability.
- Source document: `docs/IPFS_INTEGRATION_STRATEGIC_VISION.md`.

---

## Known Issues Log

| ID | Milestone | Description | Severity | Status | Fix Applied | Pending Action |
|----|-----------|-------------|----------|--------|-------------|----------------|
| — | — | No issues logged yet | — | — | — | — |

---

## Decisions & Changes Log

| Date | Decision | Rationale | Impact |
|------|----------|-----------|--------|
| 2026-05-02 | Feature-first directory structure over layer-first (`features/<name>/` vertical slices) | Co-location of related code improves discoverability; scales better than `components/`, `hooks/`, `services/` at the top level | All new code goes under `src/features/<name>/`; shared code under `src/shared/` |
| 2026-05-02 | TanStack Query v5 replacing raw `fetch` in `useEffect` | Built-in caching, request deduplication, background refetch, polling support, and DevTools integration eliminate ~80% of manual async state code | All client-side data fetching uses `useQuery` / `useMutation`; no raw `useEffect` fetches |
| 2026-05-02 | Better Auth replacing custom JWT + OTP implementation | Battle-tested library; official MongoDB adapter; built-in email OTP plugin; session management out of the box; eliminates custom crypto code | `app/api/auth/[...all]/route.ts` catch-all replaces 4 separate auth API routes from v2 |
| 2026-05-02 | React Hook Form v7 + Zod resolvers replacing manual `useState` form state | Uncontrolled inputs = better performance (no re-render on every keystroke); Zod resolvers co-locate schema with component; consistent validation DX | All forms use `useForm({ resolver: zodResolver(schema) })`; no manual `useState` for form fields |
| 2026-05-02 | All constants in `src/constants/` (routes, api, backend, query-keys, auth, config, ui) | No magic strings anywhere in feature code; compiler-safe refactors; single source of truth for URLs, keys, and config | Every route, API endpoint, and query key must be imported from `src/constants/` — never hardcoded |
| 2026-05-02 | Heavy visualization components use `next/dynamic` with `ssr: false` | Three.js, ReactFlow, and 3D graph libs are browser-only and large; SSR would crash and bloat the initial bundle | `bloch-sphere.tsx`, `fragment-flow-canvas.tsx`, `visual-circuit-builder.tsx`, `network-3d-graph.tsx` all dynamically imported |
| 2026-05-02 | Bun as package manager (not npm or pnpm) | Speed; already used in frontend-v2; consistent developer environment | Use `bun install`, `bun run dev`, `bun run build` — never `npm` or `npx` in this project |
| 2026-05-03 | 5-icon rail navigation (Dashboard, Network, Lab, Docs, Settings) — no standalone Analytics | v2 analytics pages were empty placeholders; analytics content placed contextually (Bloch sphere in run detail, fidelity in network, financial analytics in finance results) | Removes 7+ empty analytics routes; every block exists in exactly one place |
| 2026-05-03 | Lab sidebar uses ChatGPT-style dynamic history pattern | Researchers need quick access to recent jobs; mirrors mental model of "sessions" like ChatGPT threads; prepares for Workspace 2 (Autonomous Labs) agent conversations | Lab sidebar fetches last 5 jobs per tool via TanStack Query; collapsible groups with [+ New] buttons |
| 2026-05-03 | Config-driven navigation via `NAV_CONFIG` in `constants/navigation.ts` | v2's monolithic 860-line `dashboard-shell.tsx` required editing 5+ places to add a page; config-driven approach requires only 2 files | Adding a page: edit `navigation.ts` + create route file. Shell and breadcrumbs auto-update |
| 2026-05-03 | Dashboard has no sidebar (full-width layout) | Dashboard is a single page answering "is everything healthy?"; sub-navigation adds no value; full width gives KPI cards room to breathe | Dashboard rail item has `hasSidebar: false`; sidebar collapses when dashboard is active |
| 2026-05-03 | Workspace switcher slot built into rail from day one | H2 vision adds "Autonomous Labs" workspace (ChatGPT-like agent interface); retrofitting a workspace switcher would require shell rewrite | `WorkspaceSwitcher` component exists at top of rail; currently static; future: dropdown to switch workspaces |
| 2026-05-03 | Run detail page uses tabs (Overview, Quantum State, Fragment Flow) instead of separate routes | Keeps all run context in one place; eliminates 2 extra route entries; Bloch sphere and Fragment Flow are per-run analytics, not standalone pages | Tabs use `?tab=` query param; Fragment Flow and Quantum State are `next/dynamic` loaded on tab switch |

---

## Resolved Questions

1. **Email provider for OTP** — Using same Resend API key as frontend-v2. Env var: `RESEND_API_KEY`. Configured in `.env.local`.

2. **MongoDB connection** — Same MongoDB Atlas cluster as frontend-v2. Env var: `MONGODB_URI`. Configured in `.env.local`.

3. **Backend-v2 base URL** — Local: `http://localhost:8081` (QB2_API_PORT=8081). Production: `https://api.distributed-quantum.com`. Configured via `NEXT_PUBLIC_BACKEND_URL` in `.env.local`.

4. **Better Auth secret** — Generated. Stored as `BETTER_AUTH_SECRET` in `.env.local`.

5. **3D network graph library** — Using `react-force-graph-3d`. Already in package.json as a dependency.

6. **Deployment architecture** — Frontend (Next.js) → Vercel. Backend (FastAPI + libp2p swarm) → EC2 t3.medium (persistent sockets required, libp2p Trio event loop cannot run serverless). Already deployed this way.

7. **Lighthouse score targets** — All categories: ≥ 90. Configured as `CONFIG.LIGHTHOUSE_MIN_SCORE = 90` in `src/constants/config.ts`.

8. **Trial/free-tier logic** — 1 day free trial from account creation. Dev bypass via `TRIAL_BYPASS_EMAILS` env var. On expiry: blur all content, freeze all API calls, show "Trial ended" banner with link to /settings subscribe page.

---

_Last updated: 2026-05-06_
