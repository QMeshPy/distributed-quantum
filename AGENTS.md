
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
- Follow `frontend-v3/DESIGN.md` strictly for colors, variables, and component styling
- User prefers animated lucide icons throughout the UI
- Disable trial/auth gating during development via `NEXT_PUBLIC_TRIAL_DISABLED=true` env var
- Remove non-interactive or data-less cards; consolidate small status indicators to top-right area

## Learned Workspace Facts

- frontend-v3 uses barrel imports from feature folders (`@/features/network`, `@/features/runs`)
- Backend API returns snake_case; frontend transformers in `features/*/lib/*-transformers.ts` convert to camelCase
- Topology route should hit `BACKEND.DISCOVERY.PEERS` (not `DISCOVERY.TOPOLOGY`) for peer list data
- Backend `ServiceQualityTracker` in `api/routers/service_quality.py` provides gate_set/connectivity/fidelity from Qiskit transpilation
- Proxy middleware is in `frontend-v3/src/proxy.ts` (not `src/middleware.ts`)
- Backend is FastAPI on port 8081; frontend-v3 is Next.js 16 on port 3000
- Backend only exposes `POST /api/v1/workflows/runs` (no GET); frontend hooks must account for this
- frontend-v3 was migrated from frontend-v2; architecture docs live in `frontend-v3/architecture.md`, `frontend-v3/DESIGN.md`, `frontend-v3/SKILLS.md`
- CSS variables from `globals.css` should be used everywhere for theming consistency
- Always follow @frontend-v3/AGENT.md, @frontend-v3/SKILL.md, @frontend-v3/CLAUDE.md