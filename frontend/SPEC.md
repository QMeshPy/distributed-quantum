# Frontend v3 — UI & Navigation Architecture Spec

> **Status:** Approved Design — Pending Implementation
> **Date:** 2026-05-03
> **Owner:** Soham Bhoir
> **Milestone:** M3 (Layout & Navigation)

---

## 1. Design Philosophy

This platform is a **research workbench for distributed quantum computing** today, evolving into a **Cursor-for-researchers** with autonomous AI agents tomorrow.

### Two-Horizon Design

| Horizon | Timeline | What | Interface |
|---------|----------|------|-----------|
| H1 (now) | Current build | Manual quantum platform — runs, options, risk, finance, network | Icon rail + sidebar + content |
| H2 (future) | ~1 month | "Autonomous Labs" workspace — agents do autonomous research | ChatGPT-like conversation UI |

The shell we build now must accommodate a workspace switcher without a rewrite.

### Cardinal Rules

1. **Every block exists in exactly ONE place** — no duplication across pages
2. **Zero information fatigue** — each page answers one question
3. **Zero decision fatigue** — obvious next actions, no ambiguous choices
4. **Config-driven navigation** — adding a page never touches the shell
5. **Future-proof** — workspace switcher slot exists from day one

---

## 2. Top-Level Shell Layout

```
┌─────────────────────────────────────────────────────────┐
│ [QG] Workspace Switcher (future-ready)                  │
├────┬────────────┬──────────────────────────────────────┤
│    │            │ Breadcrumbs (auto-generated)          │
│ R  │  Sidebar   ├──────────────────────────────────────┤
│ A  │            │                                      │
│ I  │  (context  │         Main Content                 │
│ L  │   changes  │                                      │
│    │   per rail │         (page.tsx renders             │
│ 5  │   item)    │          feature component)           │
│    │            │                                      │
│ i  │            │                                      │
│ c  │            │                                      │
│ o  │ ────────── │                                      │
│ n  │ Nav User   │                                      │
│ s  │ + Trial    │                                      │
├────┴────────────┴──────────────────────────────────────┤
```

### Workspace Switcher

- Located at the top of the rail, above icons
- Currently: static "QG" monogram (no dropdown)
- Future: dropdown to switch between "Quantum Gates" (H1) and "Autonomous Labs" (H2)
- When H2 is active, the entire rail+sidebar replaces with the agent chat interface
- The component slot exists from day one — just renders a static logo for now

### Design Tokens (per DESIGN.md)

| Token | Value |
|-------|-------|
| Rail width | 68px |
| Sidebar width | 220px |
| Icon size | 18px inside 36px rounded-xl container |
| Active icon bg | `bg-background` with soft shadow |
| Active icon text | `text-primary` |
| Inactive icon text | `text-muted` → `text-foreground` on hover |
| Rail label | 9px, `font-medium` (inactive), `font-semibold` (active) |
| Rail background | `surface-soft` |

---

## 3. Icon Rail — 5 Items

| # | Icon (Lucide) | Label | Route Prefix | Has Sidebar? |
|---|---------------|-------|-------------|-------------|
| 1 | `Home` | Dashboard | `/dashboard` | No |
| 2 | `Globe` | Network | `/network/*` | Yes (static) |
| 3 | `Flask` | Lab | `/runs/*`, `/options/*`, `/risk/*`, `/finance/*` | Yes (dynamic) |
| 4 | `BookOpen` | Docs | `/docs/*` | Yes (static) |
| 5 | `Settings` | Settings | `/settings/*` | Yes (static) |

### Why No Analytics Rail Icon

The v2 analytics pages were all empty placeholders. Analytics content is placed contextually:
- Bloch Sphere → inside Run detail page (Quantum State tab)
- Run-specific analytics → inside Run detail page (Overview tab)
- Financial analytics → inside Financial job result pages
- Network fidelity → Network > Fidelity page

---

## 4. Sidebar Behavior Per Rail Item

### 4a. Dashboard → NO Sidebar

Dashboard collapses the sidebar. Main content gets full width. Dashboard is a single page — no sub-navigation needed.

```
┌────┬───────────────────────────────────────────────────┐
│ R  │                                                   │
│ A  │  Dashboard content (full width)                   │
│ I  │                                                   │
│ L  │                                                   │
└────┴───────────────────────────────────────────────────┘
```

### 4b. Network → Static Sidebar

```
Sidebar (~220px)
├── Infrastructure
│   ├── Topology          /network/mesh
│   ├── Nodes             /network/nodes
│   ├── Services          /network/services
│   └── Fidelity          /network/fidelity
├── Structure
│   ├── DAG View          /network/dag
│   ├── Circuits          /network/circuits
│   └── Zones             /network/zones
└── Nav User
```

All static links. Driven entirely from `NAV_CONFIG`.

### 4c. Lab → Dynamic Sidebar (ChatGPT History Pattern)

Each tool group has:
- A collapsible header with chevron
- A `+ New` action button (accent styled)
- Last 5-10 recent jobs (fetched via TanStack Query, `staleTime: 30_000`)
- A "View all →" link at the bottom of each group

```
Sidebar (~220px)
├── Quantum Runs (collapsible)
│   ├── [+ New Run]                    → /runs/new
│   ├── Run 7f3a · completed · 2h      → /runs/7f3a
│   ├── Run 4b1c · running · 5m        → /runs/4b1c
│   ├── Run 9e2d · failed · 1d         → /runs/9e2d
│   └── View all →                      → /runs
│
├── Options Pricing (collapsible)
│   ├── [+ New]                         → /options
│   ├── AAPL Call $150 · done          → /options/[id]
│   ├── TSLA Put $200 · done           → /options/[id]
│   └── View all →                      → /options/history
│
├── Risk Engine (collapsible)
│   ├── [+ New Analysis]                → /risk
│   ├── Portfolio Alpha · done         → /risk/[id]
│   └── View all →                      → /risk/history
│
├── Financial (collapsible)
│   ├── [+ New Analysis]                → /finance
│   ├── Portfolio A · May 3            → /finance/[id]
│   └── View all →                      → /finance/history
│
└── Nav User
```

**Implementation detail:** The sidebar component checks if the nav config entry has a `tool` property. If yes → render `LabToolHistory`. If no → render static links. One component, two modes.

**Data fetching:** Each tool group uses a separate TanStack Query hook:
- `useRecentRuns({ limit: 5 })`
- `useRecentOptionsJobs({ limit: 5 })`
- `useRecentRiskJobs({ limit: 5 })`
- `useRecentFinanceJobs({ limit: 5 })`

All 4 fire in parallel on Lab sidebar mount. Skeleton shimmer while loading.

### 4d. Docs → Static Sidebar

```
Sidebar
├── Documentation
│   ├── System Docs       /docs
│   ├── API Reference     /docs/api
│   └── Roadmap           /docs/roadmap
├── Developer
│   ├── Schemas           /docs/schemas
│   ├── Examples          /docs/examples
│   └── Playbooks         /docs/playbooks
└── Nav User
```

### 4e. Settings → Static Sidebar

```
Sidebar
├── Workspace
│   ├── General           /settings
│   ├── Integrations      /settings/integrations
│   └── Users             /settings/users
├── System
│   ├── Security          /settings/security
│   ├── Observability     /settings/observability
│   └── Audit Logs        /settings/audit
└── Nav User
```

---

## 5. Navigation Config Structure

File: `src/constants/navigation.ts`

```typescript
import {
  Home, Globe, Flask, BookOpen, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavToolConfig = {
  group: string;
  tool: string;
  href: string;
  newLabel: string;
  newHref: string;
  historyHref: string;
};

export type NavLinkConfig = {
  label: string;
  href: string;
};

export type NavGroupConfig = {
  heading: string;
  links: NavLinkConfig[];
};

export type RailItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  hasSidebar: boolean;
  sidebar:
    | { type: "static"; groups: NavGroupConfig[] }
    | { type: "dynamic"; tools: NavToolConfig[] }
    | null;
};

export const NAV_CONFIG: Record<string, RailItem> = {
  dashboard: {
    label: "Dashboard",
    icon: Home,
    href: "/dashboard",
    hasSidebar: false,
    sidebar: null,
  },
  network: {
    label: "Network",
    icon: Globe,
    href: "/network/mesh",
    hasSidebar: true,
    sidebar: {
      type: "static",
      groups: [
        {
          heading: "Infrastructure",
          links: [
            { label: "Topology", href: "/network/mesh" },
            { label: "Nodes", href: "/network/nodes" },
            { label: "Services", href: "/network/services" },
            { label: "Fidelity", href: "/network/fidelity" },
          ],
        },
        {
          heading: "Structure",
          links: [
            { label: "DAG View", href: "/network/dag" },
            { label: "Circuits", href: "/network/circuits" },
            { label: "Zones", href: "/network/zones" },
          ],
        },
      ],
    },
  },
  lab: {
    label: "Lab",
    icon: Flask,
    href: "/runs",
    hasSidebar: true,
    sidebar: {
      type: "dynamic",
      tools: [
        {
          group: "Quantum Runs",
          tool: "runs",
          href: "/runs",
          newLabel: "New Run",
          newHref: "/runs/new",
          historyHref: "/runs",
        },
        {
          group: "Options Pricing",
          tool: "options",
          href: "/options",
          newLabel: "New",
          newHref: "/options",
          historyHref: "/options/history",
        },
        {
          group: "Risk Engine",
          tool: "risk",
          href: "/risk",
          newLabel: "New Analysis",
          newHref: "/risk",
          historyHref: "/risk/history",
        },
        {
          group: "Financial",
          tool: "finance",
          href: "/finance",
          newLabel: "New Analysis",
          newHref: "/finance",
          historyHref: "/finance/history",
        },
      ],
    },
  },
  docs: {
    label: "Docs",
    icon: BookOpen,
    href: "/docs",
    hasSidebar: true,
    sidebar: {
      type: "static",
      groups: [
        {
          heading: "Documentation",
          links: [
            { label: "System Docs", href: "/docs" },
            { label: "API Reference", href: "/docs/api" },
            { label: "Roadmap", href: "/docs/roadmap" },
          ],
        },
        {
          heading: "Developer",
          links: [
            { label: "Schemas", href: "/docs/schemas" },
            { label: "Examples", href: "/docs/examples" },
            { label: "Playbooks", href: "/docs/playbooks" },
          ],
        },
      ],
    },
  },
  settings: {
    label: "Settings",
    icon: Settings,
    href: "/settings",
    hasSidebar: true,
    sidebar: {
      type: "static",
      groups: [
        {
          heading: "Workspace",
          links: [
            { label: "General", href: "/settings" },
            { label: "Integrations", href: "/settings/integrations" },
            { label: "Users", href: "/settings/users" },
          ],
        },
        {
          heading: "System",
          links: [
            { label: "Security", href: "/settings/security" },
            { label: "Observability", href: "/settings/observability" },
            { label: "Audit Logs", href: "/settings/audit" },
          ],
        },
      ],
    },
  },
} as const;
```

### How to Add a Page (Junior Dev Checklist)

1. Open `src/constants/navigation.ts`
2. Add your link to the correct rail item's `sidebar.groups[].links[]`
3. Create `app/(main)/your-route/page.tsx`
4. Create your feature component in `src/features/your-feature/`
5. Done. Breadcrumbs auto-generate. Sidebar auto-renders. Shell untouched.

### How to Add a New Lab Tool

1. Add a new entry to `NAV_CONFIG.lab.sidebar.tools[]`
2. Create the feature directory: `src/features/your-tool/`
3. Create the hook: `useRecentYourToolJobs()` (follows same pattern as others)
4. Create route files: `app/(main)/your-tool/page.tsx`, `app/(main)/your-tool/[jobId]/page.tsx`
5. Done. The Lab sidebar auto-discovers and renders the new tool's history.

---

## 6. Auto-Breadcrumbs

File: `src/shared/components/layout/auto-breadcrumbs.tsx`

### Algorithm

1. Read `usePathname()` → split by `/` → segments
2. For each segment, walk the `NAV_CONFIG` tree to find the label
3. For dynamic segments like `[runId]`, display the truncated ID in monospace OR fetch display name via a lightweight hook
4. Render as clickable breadcrumb pills

### Examples

| URL | Breadcrumb |
|-----|-----------|
| `/dashboard` | `Dashboard` |
| `/network/nodes` | `Network / Nodes` |
| `/runs/7f3a` | `Lab / Runs / 7f3a` |
| `/options` | `Lab / Options / New` |
| `/options/abc123` | `Lab / Options / abc123` |
| `/finance/xyz` | `Lab / Financial / xyz` |
| `/settings/security` | `Settings / Security` |

### Breadcrumb Label Resolution Map

File: `src/constants/breadcrumbs.ts`

```typescript
export const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  network: "Network",
  mesh: "Topology",
  nodes: "Nodes",
  services: "Services",
  fidelity: "Fidelity",
  dag: "DAG View",
  circuits: "Circuits",
  zones: "Zones",
  runs: "Runs",
  new: "New",
  options: "Options",
  batch: "Batch",
  history: "History",
  risk: "Risk",
  finance: "Financial",
  docs: "Docs",
  api: "API Reference",
  roadmap: "Roadmap",
  schemas: "Schemas",
  examples: "Examples",
  playbooks: "Playbooks",
  settings: "Settings",
  integrations: "Integrations",
  users: "Users",
  security: "Security",
  observability: "Observability",
  audit: "Audit Logs",
} as const;
```

If a segment is not in `BREADCRUMB_LABELS`, it's treated as a dynamic ID and displayed as-is (truncated, monospace).

---

## 7. Page Block Map — Every Block, Once

### 7.1 Dashboard `/dashboard`

Full-width (no sidebar). Answers: "Is everything healthy? What happened recently?"

| Block | Component | Data Source |
|-------|-----------|-------------|
| KPI Summary Cards (4) | `DashboardKpiCards` | `GET /api/coordinator/stats` via RSC |
| Health Status (2 mini-cards) | `DashboardHealthStatus` | Same endpoint, `health` field |
| Recent Activity Feed | `DashboardActivityFeed` | `GET /api/activity/recent?limit=5` via TanStack Query |
| Quick Actions | `DashboardQuickActions` | Static links to Lab tools |

**NOT on Dashboard (and where it lives):**
- 3D network graph → Network > Topology (`/network/mesh`)
- Interactive area charts → Network > Fidelity (`/network/fidelity`)
- Full service registry table → Network > Services (`/network/services`)
- Bloch spheres → Run detail > Quantum State tab (`/runs/[id]?tab=quantum-state`)

### 7.2 Run Detail `/runs/[runId]`

Tab bar with 3 tabs. This is where per-run analytics live.

**Tab: Overview (default)**

| Block | Component |
|-------|-----------|
| Run Metrics Cards (3) | `RunMetricsCards` — duration, fragments, fidelity |
| Execution Timeline | `RunExecutionTimeline` — peer execution flow chart |

**Tab: Quantum State** (`?tab=quantum-state`)

| Block | Component | Notes |
|-------|-----------|-------|
| Bloch Sphere(s) | `BlochSphere` | `next/dynamic`, `ssr: false` |
| Measurement Results Table | `MeasurementResultsTable` | Static table |
| State Comparison | `StateComparison` | Only if multiple measurements |

**Tab: Fragment Flow** (`?tab=fragment-flow`)

| Block | Component | Notes |
|-------|-----------|-------|
| ReactFlow Canvas | `FragmentFlowCanvas` | `next/dynamic`, `ssr: false`, full-height |

### 7.3 Lab Tool Pages (Options, Risk, Finance)

All follow the same two-state pattern:

**State A: New Job** (`/options`, `/risk`, `/finance`)

| Block | Component |
|-------|-----------|
| Page Header | Tool name + one-line description |
| Input Form | `{Tool}InputForm` — React Hook Form + Zod |

**State B: Job Result** (`/options/[id]`, `/risk/[id]`, `/finance/[id]`)

| Block | Component |
|-------|-----------|
| Page Header | Tool name + job label + status badge |
| Job Progress | `LabJobProgress` — shared component |
| Results Dashboard | Tool-specific result components |

**Shared components across all Lab tools:**
- `LabJobProgress` — progress stepper (running) or status badge (done)
- `LabJobStatusBadge` — pending/running/completed/failed pill
- `CsvUploadPanel` — drag-and-drop CSV upload (Risk, Finance, Options Batch)

**Tool-specific components (NOT shared):**

| Tool | Input Component | Result Components |
|------|----------------|-------------------|
| Options | `OptionsInputForm` | `OptionsResultCard`, `OptionsGreeksTable` |
| Options Batch | `CsvUploadPanel` | `BatchResultsTable`, `BatchBenchmarkChart` |
| Risk | `CsvUploadPanel` | `RiskMetricsDashboard` (VaR, CVaR, distribution) |
| Finance | `CsvUploadPanel` | `PortfolioResultDashboard`, `ComparisonReport` |

### 7.4 Network Pages

Each page has ONE job. No overlap.

| Page | Route | Block | Component | Dynamic Import? |
|------|-------|-------|-----------|----------------|
| Topology | `/network/mesh` | 3D force-directed graph | `Network3dGraph` | Yes |
| Nodes | `/network/nodes` | Full data table | `NodeTable` | No |
| Services | `/network/services` | Service registry table | `ServiceTable` | No |
| Fidelity | `/network/fidelity` | Interactive area chart | `FidelityChart` | Yes |
| DAG View | `/network/dag` | DAG visualization | `DagViewer` | Yes |
| Circuits | `/network/circuits` | Circuit path viewer | `CircuitPathViewer` | No |
| Zones | `/network/zones` | Zone map | `ZoneMap` | No |

### 7.5 Docs & Settings

Standard content pages. No special blocks. Each page is a self-contained view. Docs pages are static MDX or TSX. Settings pages are forms (React Hook Form + Zod).

---

## 8. Component Hierarchy

```
app/layout.tsx
├── ThemeProvider
├── AuthProvider
├── QueryProvider
└── {children}

app/(main)/layout.tsx
├── DashboardShell (workspace={currentWorkspace})
│   ├── IconRail
│   │   ├── WorkspaceSwitcher (future-ready slot)
│   │   ├── RailItem × 5
│   │   └── (bottom) — empty for now
│   ├── SidebarPanel (conditional)
│   │   ├── StaticSidebar (for network, docs, settings)
│   │   │   ├── SidebarGroup × N
│   │   │   │   ├── SidebarGroupLabel
│   │   │   │   └── SidebarLink × N
│   │   │   └── NavUser
│   │   └── DynamicSidebar (for lab)
│   │       ├── LabToolGroup × 4
│   │       │   ├── CollapsibleHeader + [+ New] button
│   │       │   ├── LabHistoryItem × 5 (from TanStack Query)
│   │       │   └── "View all →" link
│   │       └── NavUser
│   └── MainContent
│       ├── SiteHeader
│       │   └── AutoBreadcrumbs
│       └── {children} ← page.tsx renders here
```

---

## 9. File Map for M3 Implementation

```
src/
├── constants/
│   ├── navigation.ts          ← NAV_CONFIG (typed, as const)
│   └── breadcrumbs.ts         ← BREADCRUMB_LABELS map
├── shared/
│   └── components/
│       └── layout/
│           ├── dashboard-shell.tsx    ← main shell (reads NAV_CONFIG)
│           ├── icon-rail.tsx          ← 5-icon rail column
│           ├── rail-item.tsx          ← single rail icon+label
│           ├── workspace-switcher.tsx ← static logo (future dropdown)
│           ├── sidebar-panel.tsx      ← conditional sidebar renderer
│           ├── static-sidebar.tsx     ← renders NavGroupConfig[]
│           ├── dynamic-sidebar.tsx    ← renders NavToolConfig[] with history
│           ├── lab-tool-group.tsx     ← collapsible tool group with history
│           ├── lab-history-item.tsx   ← single history entry (badge + label)
│           ├── sidebar-link.tsx       ← single nav link with active state
│           ├── sidebar-group.tsx      ← group heading + links
│           ├── nav-user.tsx           ← user avatar + plan badge + dropdown
│           ├── site-header.tsx        ← header bar container
│           └── auto-breadcrumbs.tsx   ← config-driven breadcrumbs
└── app/
    └── (main)/
        └── layout.tsx                 ← wraps DashboardShell
```

---

## 10. Future-Proofing: Workspace 2 (Autonomous Labs)

When Workspace 2 lands:

```
┌─────────────────────────────────────────────────────────┐
│ [QG ▾] ← Workspace switcher dropdown                   │
│  ├── Quantum Gates (workspace 1)                        │
│  └── Autonomous Labs (workspace 2)                      │
├─────────────────────────────────────────────────────────┤
```

### What Changes

- `WorkspaceSwitcher` gets a dropdown with workspace list
- A new `NAV_CONFIG_AUTONOMOUS` config object is created
- `DashboardShell` reads `workspace` from context and selects config
- Different workspace = different config = different rail + sidebar
- Same rendering engine, zero rewrite

### What Doesn't Change

- `DashboardShell` component
- `IconRail` component
- `SidebarPanel` component
- `AutoBreadcrumbs` component
- All the rendering infrastructure

### Autonomous Labs Rail (Future)

| # | Icon | Label | Description |
|---|------|-------|-------------|
| 1 | Bot | Agents | Active agent sessions |
| 2 | Search | Research | Research projects (drug discovery, etc.) |
| 3 | Layout | Canvas | Visual workspace (like aicofounder canvas) |
| 4 | Settings | Settings | Agent config, API keys |

The sidebar becomes a ChatGPT-like conversation history list. The main content area becomes the agent conversation interface with streaming responses.

---

## 11. DX Comparison: v2 vs v3

| Task | v2 (files touched) | v3 (files touched) |
|------|--------------------|--------------------|
| Add a static page | 5+ (shell, breadcrumbs, nav data, icons, route) | 2 (`navigation.ts` + route file) |
| Add a new Lab tool | 8+ (shell, panel data, icons, breadcrumbs, types) | 3 (`navigation.ts` + feature dir + route) |
| Fix a breadcrumb | Find conditional in 860-line file | Edit `breadcrumbs.ts` label map |
| Add workspace 2 | Full rewrite | New config object + workspace switcher UI |
| Change sidebar for a rail item | Edit monolithic shell | Edit that rail item's config entry |

---

## 12. Performance Considerations

| Concern | Solution |
|---------|----------|
| 4 parallel history queries on Lab mount | TanStack Query with `staleTime: 30_000` — cached across navigations |
| 3D graph on Network > Topology | `next/dynamic({ ssr: false })` with skeleton |
| Bloch Sphere on Run detail | `next/dynamic({ ssr: false })` with skeleton |
| ReactFlow on Fragment Flow tab | `next/dynamic({ ssr: false })` with skeleton |
| Fidelity chart on Network > Fidelity | `next/dynamic({ ssr: false })` with skeleton |
| Dashboard initial load | RSC for KPI cards (no spinner), client for activity feed |
| Lab sidebar history | Client-side TanStack Query, shimmer skeleton |

---

## 13. Appendix: Route Map

```
/dashboard                       → Dashboard (full width, no sidebar)
/network/mesh                    → Network > Topology (3D graph)
/network/nodes                   → Network > Nodes (table)
/network/services                → Network > Services (table)
/network/fidelity                → Network > Fidelity (chart)
/network/dag                     → Network > DAG View
/network/circuits                → Network > Circuits
/network/zones                   → Network > Zones
/runs                            → Lab > Runs (list)
/runs/new                        → Lab > Runs > New Run (form)
/runs/[runId]                    → Lab > Runs > Detail (tabs)
/runs/[runId]?tab=quantum-state  → Lab > Runs > Detail > Quantum State
/runs/[runId]?tab=fragment-flow  → Lab > Runs > Detail > Fragment Flow
/options                         → Lab > Options > New (form)
/options/[jobId]                 → Lab > Options > Result
/options/batch                   → Lab > Options > Batch Upload
/options/history                 → Lab > Options > All Jobs
/risk                            → Lab > Risk > New (form)
/risk/[jobId]                    → Lab > Risk > Result
/risk/history                    → Lab > Risk > All Jobs
/finance                         → Lab > Finance > New (form)
/finance/[jobId]                 → Lab > Finance > Result
/finance/history                 → Lab > Finance > All Jobs
/docs                            → Docs > System Docs
/docs/api                        → Docs > API Reference
/docs/roadmap                    → Docs > Roadmap
/docs/schemas                    → Docs > Schemas
/docs/examples                   → Docs > Examples
/docs/playbooks                  → Docs > Playbooks
/settings                        → Settings > General
/settings/integrations           → Settings > Integrations
/settings/users                  → Settings > Users
/settings/security               → Settings > Security
/settings/observability          → Settings > Observability
/settings/audit                  → Settings > Audit Logs
```

---

_Last updated: 2026-05-03_
