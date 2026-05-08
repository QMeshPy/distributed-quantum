<!-- codebase-memory-mcp:start -->
# Codebase Knowledge Graph (codebase-memory-mcp)

This project uses codebase-memory-mcp to maintain a knowledge graph of the codebase.
ALWAYS prefer MCP graph tools over grep/glob/file-search for code discovery.

## Priority Order
1. `search_graph` — find functions, classes, routes, variables by pattern
2. `trace_path` — trace who calls a function or what it calls
3. `get_code_snippet` — read specific function/class source code
4. `query_graph` — run Cypher queries for complex patterns
5. `get_architecture` — high-level project summary

## When to fall back to grep/glob
- Searching for string literals, error messages, config values
- Searching non-code files (Dockerfiles, shell scripts, configs)
- When MCP tools return insufficient results

## Examples
- Find a handler: `search_graph(name_pattern=".*OrderHandler.*")`
- Who calls it: `trace_path(function_name="OrderHandler", direction="inbound")`
- Read source: `get_code_snippet(qualified_name="pkg/orders.OrderHandler")`
<!-- codebase-memory-mcp:end -->

## Learned User Preferences

- UI cards should be neutral glass (no per-card color fills); ambient glow gradients go behind sections in the page background
- Hover states on clickable cards should show a gradient wash matching the card's icon color
- Background glow positions should match the horizontal position of the cards they sit behind
- Follow `frontend/DESIGN.md` strictly for colors, variables, and component styling
- User prefers animated lucide icons throughout the UI
- Disable trial/auth gating during development via `NEXT_PUBLIC_TRIAL_DISABLED=true` env var
- Remove non-interactive or data-less cards; consolidate small status indicators to top-right area
- Detail/result pages must be full-width — never apply `max-w-*` constraints to detail page content containers
- History table rows (Options/Risk/Finance) must be clickable via `router.push` with hover gradient matching the page accent color — no separate "View" column

## Learned Workspace Facts

- frontend uses barrel imports from feature folders (`@/features/network`, `@/features/runs`)
- Backend API returns snake_case; frontend transformers in `features/*/lib/*-transformers.ts` convert to camelCase
- Topology route should hit `BACKEND.DISCOVERY.PEERS` (not `DISCOVERY.TOPOLOGY`) for peer list data
- Backend `ServiceQualityTracker` in `api/routers/service_quality.py` provides gate_set/connectivity/fidelity from Qiskit transpilation
- Proxy middleware is in `frontend/src/proxy.ts` (not `src/middleware.ts`)
- Backend is FastAPI on port 8081; frontend is Next.js 16 on port 3000
- Circuit submission uses `BACKEND.CIRCUITS.SUBMIT` (`POST /api/v1/circuits/submit` accepts `{circuit: "..."}`); job detail uses `BACKEND.JOBS.DETAIL` (`GET /api/v1/jobs/{id}`) — do NOT use `BACKEND.WORKFLOWS.RUNS` for these
- Parity system uses uppercase statuses (QUEUED, COMPILING, EXECUTING, COMPLETED, FAILED) stored in `workflow_runs` table — incompatible with `WorkflowRunStatus` enum (lowercase: submitted, planning, running, etc.)
- Circuit jobs use `job-{uuid}` prefix; workflows use `run-{uuid}` prefix
- The shadcn `SidebarProvider` wrapper has `w-full min-h-svh` which breaks flex layouts when used as a child — must override with `!w-auto !min-h-0 flex-none`
- `DashboardShell` main content wrapper keeps `ml-1.5` left gap (icon rail separation) but is flush on top, bottom, and right edges — do NOT add `my-*` or `mr-*` margins or `rounded-*` to that wrapper
- Shared detail-page components live at `src/shared/components/detail/` — `GlassCard`, `SectionTitle`, `JobMetaStrip`, `MetricGrid`, `DataTable`, `FieldList`, `ResultValue`; use these across Options, Risk, and Finance detail pages for consistent UI
- Network mesh page uses `react-force-graph-3d` loaded via `next/dynamic` with `ssr: false`; nodes auto-zoom to fit canvas, links rendered in orange
- CSS variables from `globals.css` should be used everywhere for theming consistency
- Always follow @frontend/AGENT.md, @frontend/SKILL.md, @frontend/CLAUDE.md, @frontend/DESIGN.md
- `PageHeader` is the standard shared page header at `src/shared/components/layout/page-header.tsx`; all pages use it instead of inline `h1` headers — pass `children` for right-side content
- `DataTable` `getRowKey` callbacks must append the row index for uniqueness (e.g. `` `${r.state}-${i}` ``) to avoid duplicate React key warnings when data values repeat
- `LabToolGroup` sidebar component must fetch recent items for all tool types (options, risk, finance, runs), not just runs — each tool type needs its own data hook
- Job IDs must not be truncated in breadcrumbs — `formatSegment` in `AutoBreadcrumbs` should show full IDs