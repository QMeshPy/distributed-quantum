# Quantum backend

FastAPI coordinator, py-libp2p workers, simulated quantum/finance services, and MongoDB persistence. Requires Python 3.12–3.13, uv, and MongoDB. No PostgreSQL service is used.

## Local setup

From this directory:

```sh
cp -n .env.example .env
uv sync --locked
make run
```

Do not overwrite an existing `.env`. The example is a loopback-only development configuration with one embedded worker. Visit `http://127.0.0.1:8081/docs`; `/api/v1/ready` checks MongoDB.

CLI and app factory use this directory's `.env`; exported variables take precedence. CLI `--host` and `--port` override settings. Installed wheels instead read `.env` in the launch directory. All Mongo-backed services use `QB2_MONGODB_TARGET`, its selected URI, and `QB2_MONGODB_DATABASE`. Preserve your explicit database name during upgrades.

For authenticated frontend calls, share one 32+ character `AGENT_AUTH_BRIDGE_SECRET` between both servers. Set `QB2_AUTH_REQUIRED=true` for shared deployments. Complete setup and credential sources: [environment guide](../documentations/guides/environment.md).

## Optional chemistry and storage

```sh
uv sync --locked --extra pharma
make run
```

Chemistry dependencies are omitted from the core install. Keep the extra on subsequent uv commands, or run through `make run` to use the installed environment. Toju additionally requires Node 22 and `npm ci` in `toju-client`; the frontend itself uses Bun.

## Tests and maintenance

```sh
uv run --locked pytest tests/unit
uv run --locked ruff check src tests
uv run --locked mypy src
```

Live integration tests are opt-in through `QB2_MONGODB_TEST_URI` (loopback Mongo) or the feature-specific test variable. With those unset, `uv run --locked pytest` runs the offline suite and skips live checks. `make run` does not kill existing processes or clean data; `make run-clean` is a deprecated target that refuses deletion. Keep coordinator `QB2_PEER_ID` stable and unique for safe restart handling. Jobs interrupted by a restart are failed, not resumed; old unowned records are left untouched.

## Reference

- [Feature APIs, tokenized portfolios, and Kubo](../documentations/guides/backend-features.md)
- [Provenance](../documentations/repository/backend/PROVENANCE.md)
- [Chain registry](../documentations/repository/backend/CHAIN_REGISTRY.md)
- [Moved backend documentation](../documentations/repository/README.md)
