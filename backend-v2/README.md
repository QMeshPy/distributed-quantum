# Backend V2

`backend-v2` is the next backend foundation for the decentralized quantum
service network. It starts with a thin FastAPI platform edge, explicit
configuration, typed models, and a protocol-first package layout that will
grow into the full migration plan described in `backend-migration.md`.

## Current Milestone

The current scaffold establishes:

- a clean Python package layout under `src/quantum_backend_v2/`
- a thin versioned FastAPI application
- explicit configuration loading
- a first health endpoint
- room for protocol, package, and swarm layers to grow independently

## Local Development

Use [uv](https://docs.astral.sh/uv/) from this directory so the virtualenv includes runtime and dev tools. Running plain `pytest` from your shell can pick a global interpreter (for example a pyenv shim) that does not have project dependencies installed, which often surfaces as `ModuleNotFoundError: No module named 'beanie'`.

```bash
cd backend-v2
uv sync
uv run pytest
```

With pip instead of uv:

```bash
cd backend-v2
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m pytest
```

Postgres: set `QB2_POSTGRES_TARGET=local` when you want `QB2_POSTGRES_LOCAL_DSN` to apply (for example a local database named `qds`). If `QB2_POSTGRES_TARGET=neon`, the local DSN is ignored and the Neon DSNs are used.
