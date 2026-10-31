# Pinned EtherCalc service

Upstream: audreyt/ethercalc, revision `11d8a49540634249094b2c92c3ee1a3aa3d3b4ca`.

`prepare.sh NEW_BUILD_DIRECTORY` checks out and builds upstream with Bun. It applies one checked source patch: server-side cross-sheet reads may resolve only rooms sharing the same QMesh workbook ID. The integration must use this patched build; unpatched upstream does not know QMesh membership boundaries.

Run the standalone runtime with a persistent, backed-up data directory:

```
APP_ROOT=/absolute/build ETHERCALC_DATA_DIR=/absolute/persistent-data \
ETHERCALC_HOST=127.0.0.1 ETHERCALC_PORT=8000 ETHERCALC_KEY=... \
  bash /absolute/build/bin/workerd-entrypoint.sh
```

Keep `ETHERCALC_EXPIRE` unset. Do not expose port 8000 publicly. This service is an internal engine, not the authorization boundary for browser traffic. Docker is optional: upstream's Dockerfile can build the prepared source, with `/data` mounted durably and the port restricted to the gateway network. No Cloudflare account is needed.

The Next app and gateway need the same `ETHERCALC_KEY` (32+ random characters) and `ETHERCALC_INTERNAL_URL=http://127.0.0.1:8000`. Run `bun --env-file=.env.local scripts/ethercalc-gateway.mjs` from frontend; it listens locally on 8002. Set `BETTER_AUTH_URL` to the browser's application origin and `SPREADSHEET_APP_INTERNAL_URL` to the Next server. Next rewrites `/sheets-engine/*` to this gateway, including WebSocket upgrades.

Full setup, status and verification live in the separate `documentations` repository under `superpowers/` and the EtherCalc feature guide.

Preview is disabled by default. Set `SPREADSHEETS_ENABLED=true` in Next and the gateway, and `NEXT_PUBLIC_SPREADSHEETS_ENABLED=true` when building the frontend, only for controlled testing. See `documentations/technical/ethercalc-progress.md` for known gaps and current evidence.
