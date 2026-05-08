# frontend-v3 — Agent Session Entry Point

This is the mandatory entry point for Claude Code and any agent working inside `frontend-v3/`.

---

## Step 1 — Read these files before anything else

Read all four in this exact order. Do not skip any. Do not write code first.

```
frontend-v3/architecture.md
frontend-v3/DESIGN.md
frontend-v3/AGENTS.md
frontend-v3/CLAUDE.md   ← you are here
```

Conflict resolution when rules contradict:

- `architecture.md` wins on: stack choices, directory structure, library selection, boundary rules.
- `DESIGN.md` wins on: colors, typography, spacing, component appearance, do's/don'ts.
- `AGENTS.md` wins on: performance patterns, rendering strategy, bundle optimization.
- This file (`CLAUDE.md`) wins on: session workflow and checklist.

---

## Step 2 — Session checklist (run before writing any code)

- Is this task inside an existing feature? → work inside `src/features/<name>/`
- Does it need a new feature? → create `src/features/<name>/` with index.ts barrel
- Does the task involve UI? → verify token usage against `DESIGN.md` before writing JSX
- Does the task involve a new constant (route, endpoint, string, interval)? → add to `src/constants/` first
- Does the task involve data fetching? → use TanStack Query, never raw fetch in useEffect
- Does the task involve a form? → use React Hook Form + Zod resolver, never manual useState
- Does the task involve auth? → use Better Auth, never the old v2 JWT helpers
- Does the task touch a heavy visualization (Bloch sphere, 3D graph, circuit builder, fragment flow)? → wrap with `next/dynamic` + `ssr: false`
- Does the task add a new page? → page.tsx must be ≤10 lines, shell only
- Does the task add a new API route? → handler must be thin, business logic in `features/*/server/`

---

## Step 3 — Package manager

This project is **Bun only**.

```bash
bun install          # install deps
bun dev              # dev server
bun build            # production build
bun lint             # eslint
bun format           # prettier
```

Never use `npm`, `yarn`, or `pnpm` in this directory.

---

## Step 4 — Import paths


| What                                                          | Import from                         |
| ------------------------------------------------------------- | ----------------------------------- |
| Constants (routes, API paths, query keys, config, UI strings) | `@/constants`                       |
| Feature public API                                            | `@/features/<name>`                 |
| Shared components (layout shell, nav)                         | `@/shared/components/layout/<name>` |
| shadcn primitives                                             | `@/shared/components/ui/<name>`     |
| Shared hooks                                                  | `@/shared/hooks/<name>`             |
| Shared lib utilities                                          | `@/shared/lib/<name>`               |
| Providers                                                     | `@/providers`                       |


Never import from `node_modules/next/dist/` directly.
Never import from sub-paths inside a feature from outside that feature.

---

## Step 5 — Before calling a task done

- No magic strings or hardcoded URLs anywhere in the changed files
- No raw `fetch` in `useEffect` added
- No new form using manual `useState` for field values
- No heavy visualization imported statically
- `import "server-only"` present in any new `features/*/server/` file
- Design tokens used for all colors, spacing, and typography (no inline hex/px)
- TypeScript strict — no `any`, no `as unknown as X` casts
- `bun lint` passes on changed files

