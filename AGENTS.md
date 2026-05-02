## Learned User Preferences

- Never leave TODOs or placeholders — implement everything completely in one pass; the user explicitly asks "do everything 100%" and "complete the TODOs, don't leave anything for the future."
- Do not hardcode UI theme values or colors in components; all visual parameters must be CSS variables sourced from `frontend-v2/src/app/globals.css` so the design system can be swapped by replacing `DESIGN.md`.
- Always reuse existing shadcn/ui components (e.g. `pagination.tsx`, `table.tsx` with TanStack React Table) rather than writing custom equivalents.
- When migrating frontend code, align every component against `DESIGN.md`; if a new `DESIGN.md` is provided, re-audit all components and sync them.
- Prefer light theme for the frontend; do not switch to dark theme unless explicitly requested.
- When adding an `AUTH_REQUIRED` env variable for development, make it a boolean toggle so auth middleware can be bypassed locally.
- When the user asks to force-merge a branch, hard-reset the target branch to the source branch (not a standard merge) — and remind them to force-push afterward.
- Document all issues and resolutions encountered during EC2/Docker deployment directly in `MANUAL.md`.
- When adding a Makefile, include a docstring/comment describing each command.
- Do not use `dark mode` or `localStorage`-dependent logic in Next.js SSR components; it causes hydration mismatches — use `suppressHydrationWarning` or initialize safely.
- The icon rail in `dashboard-shell.tsx` uses a flush, no-outer-padding layout (no `p-3`/`gap-3` on the wrapper). The rail is a narrow `w-[4.25rem]` sidebar with icon+label nav items. Do not add outer padding or spacing around the layout, and do not add rounded corners to the overall shell container. There is no top header bar — it was intentionally removed. The active rail item uses a `size-9 rounded-xl bg-background shadow` icon tile for an elevation/raised effect. Active sidebar selections must always use elevation (raised tile + shadow on the icon container), never just a background fill on the row.
- The top `<header>` bar (breadcrumb, search ⌘K, avatar, bell) in `dashboard-shell.tsx` was intentionally removed. Also removed: the "Workspace navigation" subtitle `<p class="text-xs text-muted-foreground">` and the non-functional "Add" `<Button>` in the sidebar header area for non-runs sections.
- `financialSubLinkIsActive` in `dashboard-shell.tsx`: the "Upload & Analyse" link (`/finance`) must only be active on the bare `/finance` route with no `?jobId` query param. Pass the active job ID into the check so the upload link is not highlighted when viewing a job result.
- Finance page (`financial-analytics-client.tsx`) route behavior: when `?jobId` is present in the URL, hide the upload form and recent jobs list entirely — show only the active job card, progress, and result dashboard. When no `jobId` is set, show the upload form + recent jobs list in a `[1fr_320px]` two-column layout.

## Learned Workspace Facts

- **Primary stack:** backend = Python 3.11 + FastAPI + py-libp2p (Trio) + Qiskit (statevector simulation) + SQLAlchemy (Postgres) + Beanie (MongoDB); frontend = Next.js 16 + React 19 + TypeScript + Tailwind 4 + shadcn/ui + Zustand + ReactFlow + Recharts.
- **Active directories:** `backend-v2/` (primary backend) and `frontend-v2/` (primary frontend). `frontend-v3/` is an active migration target (auth system, DESIGN.md token work). `backend/` and `frontend/` are legacy reference — do not extend them.
- **Entry point:** `CONTEXT.md` at the repo root is the canonical session context file for all AI agents; read it first in every new session.
- **Config pattern:** All backend config flows through `QB2_*` environment variables into `AppSettings.from_env()` (Pydantic); never hardcode config values.
- **SQLite files** (`*.sqlite3`, `*.sqlite3-shm`, `*.sqlite3-wal`) under `backend-v2/quantum-backend-v2/libp2p/` are gitignored via `**/*.sqlite3*` glob patterns.
- **Deployment:** `docker-compose.yaml` runs `backend-v2` + `frontend-v2` + Caddy. EC2 deployment documented in `MANUAL.md`. Legacy frontend (`frontend/`) is served manually via `pm2` + `serve -s dist` on port 3003, not included in Docker Compose.
- **Quantum backend:** Uses Qiskit `BasicSimulator` for statevector simulation (not real quantum hardware). Quality/fidelity metrics are derived from Qiskit backend instruction properties via `ServiceQualityTracker`.
- **Financial workflow:** A secondary QAOA-based portfolio optimization workflow accepts user-uploaded CSV files; results must appear in the run history page under the sidebar "Financial" section alongside circuit job history.
- **3D network visualization:** Uses `react-force-graph-3d` (React wrapper); do not use `3d-force-graph` directly (that is the HTML-only library).
- **Authors:** Soham Bhoir and Manusheel Gupta (both listed in README BibTeX and `**Author**` line).
- **Branch `legacy`:** A snapshot of the old `main` before the `codex/wire-frontendv2-to-backendv2` force-merge; kept as a reference backup.
- **`frontend-v3` landing route:** `/` redirects to `/dashboard`; there is no standalone landing page.
- **`frontend-v3` auth session:** `GET /api/auth/session` returns HTTP 200 with `{ user: null }` when no session exists (not a 4xx). Guards must check `data.user` for null after `response.ok`; both `src/features/auth/store/auth-store.ts` and `src/store/auth-store.ts` are kept in sync.
- **Financial analytics UI style:** Finance page components under `frontend-v2/src/components/financial/` use flat, blunt info blocks with no decorative chrome. Only `border-border`, `bg-card`, `text-foreground`, `text-muted-foreground`, and other globals.css CSS variables — no hardcoded colors or custom clay/gradient vars.
- **Financial results page layout:** On the finance job results page, render small stat/metric boxes first (top), then main details in descending order of importance; use side-by-side layout when the data width permits, single-column otherwise.
- **`frontend-v3` tooling:** Uses `bun` as the package manager (not npm/yarn). Prettier is configured via `frontend-v3/prettier.config.mjs`; run `bun run format` to format and `bun run format:check` to check. A `.prettierignore` at `frontend-v3/.prettierignore` excludes `node_modules`, `.next`, `out`, `build`, lock files, and `next-env.d.ts`. `eslint-config-prettier` must be the **last** config block in the ESLint config to properly override conflicting formatting rules.
- **`frontend-v3` Tailwind v4 design tokens:** Custom DESIGN.md color tokens (`ink`, `canvas`, `surface-soft`, `surface-strong`, `surface-dark`, `link`, `link-active`, `info`, `info-border`, `signature-*`, `primary-active`, `on-primary`, `on-dark`, `hairline`, `border-strong`) and radius tokens must be wired into the `@theme inline` block in `globals.css` so Tailwind v4 generates utility classes (`text-ink`, `bg-canvas`, etc.). Defining CSS variables without the `@theme inline` mapping means Tailwind utilities are not generated.
- **Local Postgres DB name:** `qds`.
