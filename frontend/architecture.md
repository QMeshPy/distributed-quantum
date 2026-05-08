# frontend-v3 Architecture

> **Read order for every agent session working in this directory:**
>
> 1. This file (`architecture.md`) — stack, structure, patterns, rules
> 2. `DESIGN.md` — visual system, tokens, typography, do's/don'ts
> 3. `AGENTS.md` — Next.js performance rules, 40+ patterns, Bun policy
>
> Never write a single line of UI without reading `DESIGN.md` first.
> Never write a component without reading `AGENTS.md` first.
> Conflict resolution: `architecture.md` > `DESIGN.md` > `AGENTS.md`.

---

## 1. Stack


| Layer                            | Choice                                         | Replaces (v2)                 |
| -------------------------------- | ---------------------------------------------- | ----------------------------- |
| Framework                        | Next.js 16 (App Router)                        | same                          |
| Runtime                          | React 19                                       | same                          |
| Package manager                  | Bun                                            | same                          |
| Language                         | TypeScript 5 (strict)                          | same                          |
| Styling                          | Tailwind CSS v4 + shadcn/ui                    | same                          |
| Validation                       | Zod v4                                         | same                          |
| Client state                     | Zustand v5                                     | same                          |
| **Server state / data fetching** | **TanStack Query v5**                          | raw `fetch` in `useEffect`    |
| **Forms**                        | **React Hook Form v7 + @hookform/resolvers**   | manual form state             |
| **Auth**                         | **Better Auth** (MongoDB adapter, OTP plugin)  | custom JWT + OTP from scratch |
| **API type safety**              | **Typed fetch client via `backend-client.ts`** | untyped fetch                 |
| Charts                           | Recharts 3                                     | same                          |
| Tables                           | TanStack Table v8                              | same                          |
| Flow diagrams                    | @xyflow/react                                  | same                          |
| 3D graphs                        | react-force-graph-3d, d3-force-3d              | same                          |
| Quantum viz                      | @qctrl/visualizer                              | same                          |
| Drag & drop                      | @dnd-kit                                       | same                          |
| Notifications                    | Sonner                                         | same                          |
| Email                            | Resend                                         | same                          |
| DB driver                        | MongoDB v7 (server-only)                       | same                          |


---

## 2. Directory Structure

```
frontend-v3/
├── AGENTS.md               ← Next.js perf rules (read before any component)
├── DESIGN.md               ← Design system tokens (read before any UI)
├── architecture.md         ← This file (read first)
├── CLAUDE.md               ← Claude Code / agent entry point
│
├── next.config.ts
├── package.json
├── tsconfig.json
│
└── src/
    │
    ├── app/                         ← ROUTING ONLY — no business logic here
    │   ├── (auth)/
    │   │   ├── signin/page.tsx      ← imports from features/auth
    │   │   └── signup/page.tsx
    │   ├── (main)/
    │   │   ├── layout.tsx           ← wraps with DashboardShell
    │   │   ├── dashboard/
    │   │   │   ├── page.tsx
    │   │   │   └── network-health/page.tsx
    │   │   ├── analytics/
    │   │   │   ├── page.tsx
    │   │   │   ├── comparisons/page.tsx
    │   │   │   ├── deep-state/page.tsx
    │   │   │   ├── diagnostics/page.tsx
    │   │   │   ├── frontier/page.tsx
    │   │   │   ├── geometry/page.tsx
    │   │   │   ├── measurements/page.tsx
    │   │   │   └── ranking/page.tsx
    │   │   ├── network/
    │   │   │   ├── page.tsx
    │   │   │   ├── circuits/page.tsx
    │   │   │   ├── dag/page.tsx
    │   │   │   ├── fidelity/page.tsx
    │   │   │   ├── mesh/page.tsx
    │   │   │   ├── nodes/page.tsx
    │   │   │   ├── services/page.tsx
    │   │   │   └── zones/page.tsx
    │   │   ├── finance/
    │   │   │   ├── page.tsx
    │   │   │   ├── benchmark/page.tsx
    │   │   │   ├── execution/page.tsx
    │   │   │   ├── frontier/page.tsx
    │   │   │   └── states/page.tsx
    │   │   ├── options/
    │   │   │   ├── page.tsx
    │   │   │   └── batch/page.tsx
    │   │   ├── risk/page.tsx
    │   │   ├── runs/
    │   │   │   ├── page.tsx
    │   │   │   ├── new/page.tsx
    │   │   │   └── [runId]/
    │   │   │       ├── page.tsx
    │   │   │       └── fragment-flow/page.tsx
    │   │   ├── docs/
    │   │   │   ├── page.tsx
    │   │   │   ├── api/page.tsx
    │   │   │   ├── examples/page.tsx
    │   │   │   ├── playbooks/page.tsx
    │   │   │   ├── roadmap/page.tsx
    │   │   │   └── schemas/page.tsx
    │   │   └── settings/
    │   │       ├── page.tsx
    │   │       ├── audit/page.tsx
    │   │       ├── integrations/page.tsx
    │   │       ├── observability/page.tsx
    │   │       ├── security/page.tsx
    │   │       └── users/page.tsx
    │   ├── api/                     ← THIN handlers only — delegate to features/*/server/
    │   │   ├── auth/[...all]/route.ts   ← Better Auth catch-all handler
    │   │   ├── dashboard/route.ts
    │   │   ├── runs/
    │   │   │   ├── route.ts
    │   │   │   └── [runId]/route.ts
    │   │   ├── options/
    │   │   │   ├── route.ts
    │   │   │   ├── batch/route.ts
    │   │   │   └── [jobId]/route.ts
    │   │   ├── risk/
    │   │   │   ├── route.ts
    │   │   │   └── [jobId]/route.ts
    │   │   └── finance/
    │   │       ├── route.ts
    │   │       ├── [jobId]/route.ts
    │   │       └── [jobId]/comparison/route.ts
    │   ├── layout.tsx               ← root layout — mounts providers
    │   └── globals.css
    │
    ├── features/                    ← DOMAIN FEATURES (vertical slices)
    │   │
    │   ├── auth/
    │   │   ├── index.ts             ← public barrel — only import from here
    │   │   ├── components/
    │   │   │   ├── signin-form.tsx
    │   │   │   ├── signup-form.tsx
    │   │   │   └── trial-banner.tsx
    │   │   ├── hooks/
    │   │   │   └── use-auth.ts      ← wraps Better Auth client
    │   │   ├── server/
    │   │   │   ├── auth.ts          ← Better Auth server instance
    │   │   │   └── session.ts       ← getSession() helper for RSC
    │   │   └── types.ts
    │   │
    │   ├── dashboard/
    │   │   ├── index.ts
    │   │   ├── components/
    │   │   │   ├── dashboard-overview.tsx
    │   │   │   ├── dashboard-network-stats.tsx
    │   │   │   └── chart-area-interactive.tsx
    │   │   ├── hooks/
    │   │   │   └── use-dashboard-data.ts    ← TanStack Query
    │   │   ├── lib/
    │   │   │   └── dashboard-transformers.ts
    │   │   ├── server/
    │   │   │   └── dashboard-service.ts
    │   │   ├── store.ts             ← Zustand slice (if needed)
    │   │   └── types.ts
    │   │
    │   ├── options/
    │   │   ├── index.ts
    │   │   ├── components/
    │   │   │   ├── options-analytics-client.tsx
    │   │   │   ├── options-hero.tsx
    │   │   │   ├── options-input-panel.tsx
    │   │   │   ├── options-result-dashboard.tsx
    │   │   │   ├── options-job-card.tsx
    │   │   │   ├── options-job-progress.tsx
    │   │   │   └── batch/
    │   │   │       ├── batch-upload-panel.tsx
    │   │   │       ├── batch-benchmark-client.tsx
    │   │   │       └── batch-results-dashboard.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-options-job.ts       ← useQuery with refetchInterval
    │   │   │   └── use-options-batch.ts     ← useMutation
    │   │   ├── server/
    │   │   │   └── options-service.ts
    │   │   └── types.ts
    │   │
    │   ├── risk/
    │   │   ├── index.ts
    │   │   ├── components/
    │   │   │   ├── risk-analytics-client.tsx
    │   │   │   ├── risk-hero.tsx
    │   │   │   ├── risk-upload-panel.tsx
    │   │   │   ├── risk-job-card.tsx
    │   │   │   ├── risk-job-progress.tsx
    │   │   │   └── risk-result-dashboard.tsx
    │   │   ├── hooks/
    │   │   │   └── use-risk-job.ts
    │   │   ├── server/
    │   │   │   └── risk-service.ts
    │   │   └── types.ts
    │   │
    │   ├── financial/
    │   │   ├── index.ts
    │   │   ├── components/
    │   │   │   ├── financial-analytics-client.tsx
    │   │   │   ├── finance-hero.tsx
    │   │   │   ├── finance-upload-panel.tsx
    │   │   │   ├── finance-job-card.tsx
    │   │   │   ├── finance-job-progress.tsx
    │   │   │   ├── finance-recent-jobs.tsx
    │   │   │   ├── portfolio-result-dashboard.tsx
    │   │   │   └── portfolio-comparison-report-section.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-finance-job.ts
    │   │   │   └── use-finance-comparison.ts
    │   │   ├── server/
    │   │   │   └── finance-service.ts
    │   │   └── types.ts
    │   │
    │   ├── runs/
    │   │   ├── index.ts
    │   │   ├── components/
    │   │   │   ├── runs-page-client.tsx
    │   │   │   ├── run-detail-page-client.tsx
    │   │   │   ├── new-run-page-client.tsx
    │   │   │   ├── run-status-badge.tsx
    │   │   │   ├── fragment-flow-canvas.tsx
    │   │   │   ├── fragment-execution-data-table.tsx
    │   │   │   └── peer-execution-flow.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-runs-list.ts
    │   │   │   ├── use-run-detail.ts          ← polling via refetchInterval
    │   │   │   ├── use-create-run.ts          ← useMutation
    │   │   │   └── use-run-quantum-full-detail.ts
    │   │   ├── lib/
    │   │   │   ├── fragment-dag-model.ts
    │   │   │   ├── fragment-flow-format.ts
    │   │   │   ├── peer-flow-model.ts
    │   │   │   ├── run-status.ts
    │   │   │   └── run-transformers.ts
    │   │   ├── server/
    │   │   │   └── runs-service.ts
    │   │   ├── store.ts
    │   │   └── types.ts
    │   │
    │   ├── network/
    │   │   ├── index.ts
    │   │   ├── components/
    │   │   │   └── dashboard-network-3d.tsx   ← dynamic import (heavy)
    │   │   └── types.ts
    │   │
    │   ├── analytics/
    │   │   ├── index.ts
    │   │   └── components/
    │   │
    │   ├── quantum/                           ← quantum-specific visualizations
    │   │   ├── index.ts
    │   │   ├── components/
    │   │   │   ├── bloch-sphere.tsx           ← dynamic import
    │   │   │   └── visual-circuit-builder.tsx ← dynamic import
    │   │   ├── hooks/
    │   │   │   └── use-circuit-composer.ts
    │   │   └── lib/
    │   │       ├── circuit-composer.ts
    │   │       └── visual-circuit.ts
    │   │
    │   └── settings/
    │       ├── index.ts
    │       └── components/
    │
    ├── shared/                      ← used by 2+ features — no feature-specific logic
    │   ├── components/
    │   │   ├── ui/                  ← shadcn primitives (owned by shadcn CLI)
    │   │   │   └── *.tsx
    │   │   └── layout/              ← app shell components
    │   │       ├── app-sidebar.tsx
    │   │       ├── dashboard-shell.tsx
    │   │       ├── nav-main.tsx
    │   │       ├── nav-user.tsx
    │   │       ├── nav-secondary.tsx
    │   │       └── nav-documents.tsx
    │   ├── hooks/
    │   │   ├── use-mobile.ts
    │   │   └── use-hash.ts
    │   ├── lib/
    │   │   ├── utils.ts             ← cn() and generic helpers
    │   │   ├── backend-client.ts    ← typed fetch wrapper for Python FastAPI
    │   │   ├── backend-normalizers.ts
    │   │   └── mongodb.ts           ← server-only DB singleton
    │   └── types/
    │       └── backend.ts           ← shared backend contract types
    │
    ├── constants/                   ← every constant in the codebase lives here
    │   ├── index.ts                 ← single re-export barrel
    │   ├── routes.ts                ← all Next.js page paths
    │   ├── api.ts                   ← all /api/* handler paths
    │   ├── backend.ts               ← all Python FastAPI paths + BASE_URL
    │   ├── query-keys.ts            ← all TanStack Query cache keys
    │   ├── auth.ts                  ← cookie names, token TTL, OTP config
    │   ├── config.ts                ← polling intervals, pagination, limits
    │   └── ui.ts                    ← nav labels, page titles, error messages
    │
    ├── providers/                   ← root React providers
    │   ├── index.tsx                ← composes all providers
    │   ├── query-provider.tsx       ← TanStack Query client
    │   ├── theme-provider.tsx       ← next-themes
    │   └── auth-provider.tsx        ← Better Auth session context
    │
    └── middleware.ts                ← route protection (Better Auth session check)
```

---

## 3. Strict Rules

### 3.1 Feature isolation

- Features **never** import from other features directly.
- Cross-feature shared code belongs in `shared/` only after it is needed by ≥2 features.
- Each feature exposes one public barrel: `features/<name>/index.ts`.
- Nothing outside a feature imports sub-paths like `features/runs/hooks/use-runs-list`.

### 3.2 App Router is routing-only

Every `page.tsx` is a shell of ≤10 lines — it imports the client component from the feature and renders it. No logic, no data fetching, no hooks inside page files.

```typescript
// app/(main)/options/page.tsx
import { OptionsAnalyticsClient } from "@/features/options";
export default function OptionsPage() {
  return <OptionsAnalyticsClient />;
}
```

### 3.3 API route handlers are thin

All business logic lives in `features/*/server/`. Handlers only parse the request, call the service, and return the response.

```typescript
// app/api/options/route.ts
import { createOptionsJob } from "@/features/options/server/options-service";
export async function POST(req: Request) {
  const body = await req.json();
  const job = await createOptionsJob(body);
  return Response.json(job);
}
```

### 3.4 No magic strings, ever

Every route path, API path, backend path, query key, config value, and UI string is declared in `src/constants/`. Import from `@/constants`.

### 3.5 server/ is server-only

Files inside `features/*/server/` and `shared/lib/mongodb.ts` must never be imported by client components. Add `import "server-only"` at the top of every file in these directories.

### 3.6 Heavy components use dynamic imports

The following components are heavy and must always be dynamically imported with `next/dynamic` and `ssr: false`:

- `features/quantum/components/bloch-sphere.tsx`
- `features/quantum/components/visual-circuit-builder.tsx`
- `features/network/components/dashboard-network-3d.tsx`
- `features/runs/components/fragment-flow-canvas.tsx`

---

## 4. Data Fetching Patterns

### Query (read)

```typescript
// features/runs/hooks/use-runs-list.ts
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";

export function useRunsList() {
  return useQuery({
    queryKey: QUERY_KEYS.runs.list(),
    queryFn: () => fetch(API.RUNS.LIST).then(r => r.json()),
    staleTime: CONFIG.STALE_TIME_MS,
  });
}
```

### Polling (job status)

```typescript
// features/runs/hooks/use-run-detail.ts
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API, CONFIG } from "@/constants";

export function useRunDetail(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.runs.detail(id),
    queryFn: () => fetch(API.RUNS.DETAIL(id)).then(r => r.json()),
    refetchInterval: (query) =>
      CONFIG.POLL_STOP_STATUSES.includes(query.state.data?.status)
        ? false
        : CONFIG.POLL_INTERVAL_MS,
  });
}
```

### Mutation (write)

```typescript
// features/runs/hooks/use-create-run.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      fetch(API.RUNS.CREATE, { method: "POST", body: JSON.stringify(payload) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.runs.all() }),
  });
}
```

---

## 5. Auth (Better Auth)

Better Auth replaces the custom JWT + OTP implementation in v2.

- Server instance: `features/auth/server/auth.ts`
- Client instance (hook): `features/auth/hooks/use-auth.ts`
- API handler: `app/api/auth/[...all]/route.ts` — single catch-all
- MongoDB adapter handles user/session persistence
- OTP plugin handles the email code flow via Resend
- Route protection: `src/middleware.ts` checks session and redirects unauthenticated users away from `(main)` routes

---

## 6. Forms (React Hook Form)

All forms use React Hook Form v7 with Zod resolvers. No manual form state.

```typescript
const schema = z.object({ email: z.string().email() });
const form = useForm({ resolver: zodResolver(schema) });
```

---

## 7. Constants

All constants are in `src/constants/`. See the full schema:


| File            | Contents                                                        |
| --------------- | --------------------------------------------------------------- |
| `routes.ts`     | `ROUTES.*` — every Next.js page path                            |
| `api.ts`        | `API.*` — every `/api/*` path                                   |
| `backend.ts`    | `BACKEND.*` — every Python FastAPI path + `BASE_URL`            |
| `query-keys.ts` | `QUERY_KEYS.*` — every TanStack Query cache key (factory fns)   |
| `auth.ts`       | `AUTH.*` — cookie name, token TTL, OTP config                   |
| `config.ts`     | `CONFIG.*` — poll interval, page size, stale time, graph limits |
| `ui.ts`         | `UI.*` — page titles, nav labels, error messages, empty states  |


Import all constants from the barrel: `import { ROUTES, API, QUERY_KEYS, CONFIG, UI } from "@/constants"`.

---

## 8. Design System Contract

The design system is defined in `DESIGN.md`. Its tokens map to Tailwind CSS v4 CSS variables in `globals.css`. The following rules are non-negotiable:

- **Never use raw hex values.** Use design tokens via CSS variables or Tailwind utility classes.
- **Never use `font-bold` on display text.** Typography weights are defined in `DESIGN.md` — display text is weight 400/500 only.
- **Primary CTA is `colors.primary` (near-black `#181d26`), not blue.** The link color (`#1b61c9`) is never used as a button background.
- **shadcn components are the baseline.** Extend them via `className` and `cva` variants. Never write raw Radix primitives unless a shadcn component doesn't exist for it.
- **Signature cards** (`signature-coral`, `signature-forest`, `surface-dark`) are used as punctuation — one per major section, not decorative wallpaper.

---

## 9. Performance Checklist

Enforced by `AGENTS.md`. Key points for this codebase:

- No `await` chains that could be `Promise.all()`
- No barrel file imports from `shared/components/ui/` — import primitives directly
- Heavy visualizations use `next/dynamic` with `ssr: false`
- Job-polling hooks stop polling when status is in `CONFIG.POLL_STOP_STATUSES`
- `React.cache()` used for per-request deduplication in RSC data fetchers
- `after()` used for non-blocking post-response work (logging, analytics)
- `useQuery` stale time set via `CONFIG.STALE_TIME_MS` — never hardcoded

---

## 10. Deployment Target

Vercel (Node.js runtime). API routes that touch MongoDB or heavy computation stay on Node.js. Auth routes use Node.js runtime. Purely read-only, stateless API routes can opt into Edge runtime with `export const runtime = "edge"`.