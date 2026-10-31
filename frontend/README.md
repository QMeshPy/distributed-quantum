# Quantum console

Next.js 16 / React 19 frontend. Use **Bun** for package and script operations.

## Setup

```sh
cp -n .env.example .env.local
bun install --frozen-lockfile
```

Preserve existing env files. Set `BETTER_AUTH_SECRET`, the backend-matching `AGENT_AUTH_BRIDGE_SECRET`, and `RESEND_API_KEY` / `OTP_EMAIL_FROM` for email sign-in. MongoDB and the Python backend must be reachable. See [environment and credential setup](../documentations/guides/environment.md), then run `bun run dev` and open `http://localhost:3000`.

Use `.env.local` for local configuration. Existing `.env` values have lower precedence; `MONGODB_DATABASE` is a fallback for the canonical `MONGODB_DB_NAME`. Keep provider credentials server-only: `PINATA_JWT` (or API key/secret) and `LIGHTHOUSE_API_KEY` belong on the Next.js server, never under `NEXT_PUBLIC_`. Rebuild after changing public variables.

## Checks

```sh
bun x tsc --noEmit --incremental false
bun run lint
# Isolate module mocks by running each file in its own process:
for test in tests/*.test.mjs tests/*.test.ts tests/*.test.jsx; do
  [ -f "$test" ] || continue
  case "$test" in
    *.ts) bun --no-env-file --conditions=react-server test "$test" || exit ;;
    *) bun --no-env-file test "$test" || exit ;;
  esac
done
bun run build
```

No check should use production provider credentials. Build and browser checks are separate from mocked handler tests.

## Development rules

Read the relocated documents together before modifying frontend architecture or UI:

- [Architecture](../documentations/repository/frontend/architecture.md)
- [Design](../documentations/repository/frontend/DESIGN.md)
- [Agent and performance rules](../documentations/repository/frontend/AGENTS.md)
- [Claude instructions](../documentations/repository/frontend/CLAUDE.md)
- [Skill checklist](../documentations/repository/frontend/SKILL.md)

Next.js APIs must be checked against installed `node_modules/next/dist/docs/` before coding. Those dependencies are excluded from documentation cleanup. The moved instruction files are no longer automatically discovered at their old frontend paths; tooling should read these linked sources explicitly.
