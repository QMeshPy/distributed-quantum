# Quantum Libp2p Coordinator

A Python project to orchestrate distributed quantum operations with `py-libp2p` as the coordination layer.

## Current Status

Implemented milestones:
- Python package scaffold under `src/quantum_coordinator`
- Centralized typed configuration loader (file + env overrides)
- Structured logging setup
- FastAPI app with health endpoint: `GET /api/v1/health`
- Test/lint/type-check workflow
- Service advertisement schema + validation
- In-memory pubsub adapters for local multi-node integration tests
- Discovery worker with subscription loop and TTL-based staleness pruning
- SQLite-backed service registry snapshot persistence
- OpenQASM-like circuit normalization to internal IR
- Qubit-based dependency DAG construction
- Deterministic weighted cost-based planner with primary + fallback assignments
- Planner test suite for compatibility, dependency ordering, missing-service errors, and determinism
- Reservation request/response contracts and enforced lifecycle transitions
- Runtime executor with dependency-safe scheduling, retries, and fallback node execution
- In-memory gate execution adapter with failure injection (timeout, reject, node drop, quality degradation)
- SQLite persistence for reservations and fragment execution events
- Versioned SQLite migrations and persistent job lifecycle store
- Job manager with lifecycle transitions and startup recovery for unfinished jobs
- M4 API endpoints: submit circuit, job status, service list, fidelity metrics, and websocket job updates
- Optional API key auth and in-memory rate limiting guards

## Requirements

- Python 3.10+
- `uv` package manager

## Quick Start

```bash
# Install dependencies and project in editable mode
make install

# Run API
make run
```

API docs: `http://localhost:8080/docs`

Health check:

```bash
curl http://localhost:8080/api/v1/health
```

## Configuration

Use `config/config.example.yaml` as a starting point.

You can provide config either:
- via CLI: `python -m quantum_coordinator --config path/to/config.yaml`
- via env: `QC_CONFIG_FILE=path/to/config.yaml`

Environment override format for nested fields:
- `QC_API__PORT=9000`
- `QC_LOGGING__LEVEL=DEBUG`

## Development Commands

```bash
make install   # uv sync --extra dev
make lint      # ruff + mypy
make test      # pytest + coverage
make format    # ruff format
make run       # run FastAPI app
```

## py-libp2p Adapter (Real Transport)

The project now includes real py-libp2p adapters in
`src/quantum_coordinator/infra/libp2p/pylibp2p.py`.

Quick sketch:

```python
import trio

from quantum_coordinator.infra.libp2p import build_libp2p_node, run_libp2p_services


async def main() -> None:
    node = build_libp2p_node(listen_addrs=["/ip4/0.0.0.0/tcp/9000"])
    async with run_libp2p_services(node.host, node.pubsub):
        await node.pubsub_adapter.subscribe("/quantum-coordinator/service-ads/v1")
        # publish / receive / request stream calls here


trio.run(main)
```

Note: py-libp2p services are Trio-native; the real adapter requires a Trio backend.

## Project Structure

```text
src/quantum_coordinator/
  api/
  application/
  config/
  domain/
  infra/libp2p/
  monitoring/
  planning/
  runtime/
```

## Next Milestone

M5 Evaluation Plane:
- distributed vs centralized orchestration benchmark harness
- reproducible scenario matrix and fault injection controls
- exportable experiment report artifacts
