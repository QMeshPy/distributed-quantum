# Backend V2 Progress

This file tracks implementation progress against [backend-migration.md](./backend-migration.md).

## Overall Snapshot

- Estimated overall completion: `~44%`
- Current active milestone: `Phase 3 - Libp2p-native discovery and peer lifecycle foundation`
- Last completed milestone: `Phase 2 first Alembic revision plus Beanie app startup wiring`

## Phase Progress

| Phase | Status | Estimated Completion | What Is Done | What Is Still Pending |
| --- | --- | ---: | --- | --- |
| Phase 0: Architectural foundation | In progress | `78%` | Python package scaffold, target `src/` layout, first protocol contracts, first package and peer-published service manifest models, persistence ownership/catalog contracts, local and cloud `.env` workflow, Alembic scaffold | Richer identity/application/runtime modules, more protocol families, and deeper domain boundaries |
| Phase 1: Developer-friendly API foundation | In progress | `62%` | Thin FastAPI app, versioned `/api/v1` router, explicit bootstrap/config flow, typed health and readiness contracts, developer-facing libp2p bootstrap endpoint, lifespan hooks that initialize and tear down persistence runtimes cleanly | Auth dependency model, shared error contracts, OpenAPI discipline, pagination/streaming conventions, SDK-first response envelopes |
| Phase 2: Durable state model | In progress | `76%` | Typed local/Neon Postgres settings, typed local/remote Mongo settings, append-only local peer log, SQLAlchemy ORM base and first transactional models, Beanie document models, Alembic scaffold, persistence runtime probes, first Alembic revision for core transactional tables, Beanie `init_beanie` on FastAPI startup plus client disposal on shutdown | Additional migration revisions as new ORM entities land, projection writers, replay/recovery orchestration, stricter no-in-memory-truth enforcement across future modules |
| Phase 3: Libp2p-native discovery and peer lifecycle | In progress | `18%` | Typed libp2p settings, real `py-libp2p` host bootstrap via `new_host(...)`, sqlite peerstore wiring, deterministic key derivation, peer advertisement and heartbeat payloads, protocol suite for discovery/peer exchange, bootstrap-plan and runtime-summary endpoints | Live listener activation by default, advertisement transport, heartbeat scheduling, stale handling, rejoin flow, peer registry materialization |
| Phase 4: Durable reservations and execution | Not started | `0%` | None yet | Reservation event log, execution event log, recovery logic, fallback and retry orchestration |
| Phase 5: Open peer enrollment | Not started | `15%` | Migration brief defines trust tiers and peer-published services; transactional peer enrollment ORM model now exists | Enrollment APIs, ownership checks, trust-tier persistence, policy gates, capability registration |
| Phase 6: Swarm-ready package and artifact layer | In progress | `28%` | Service/package manifest foundation, integrity metadata, benchmark metadata, peer-published service workflow captured in the migration brief | Signing and verification implementation, chunked transfer, seeding, artifact replication metadata, swarm placement metadata |
| Phase 7: Quantum-first applications and benchmarks | Not started | `12%` | Benchmark mode/comparison intent exists in package models and the migration brief | Workflow models, provenance bundles, benchmark run storage, publishable result packages, financial/scientific domain apps |

## First Concrete Tasks

| Task From Migration Brief | Status | Notes |
| --- | --- | --- |
| Scaffold `backend-v2` as a Python package with the target folder layout | Done | Package, test, bootstrap, config, API, protocols, packages, and persistence foundations exist |
| Define Postgres entities and migration discipline | In progress | SQLAlchemy ORM models, Alembic scaffold, and first revision `838b0126c4fd` for `platform_users`, `workflow_definitions`, and `peer_enrollments` exist; expand revisions as the relational model grows |
| Define MongoDB collections and projection strategy | In progress | Beanie document models, target selection, and startup-time `init_beanie` wiring exist; projection writers and collection setup policies are still pending |
| Define durable local peer log format | Done | `PeerLogRecord` plus JSONL-backed append-only `LocalPeerLogStore` are implemented |
| Define protocol schemas and versioning rules | In progress | Base protocol descriptor models exist; family-specific protocols are still pending |
| Build a thin FastAPI app with no business state in `app.state` | Done | Current app keeps the API edge thin and injects dependencies explicitly |
| Build a `py-libp2p` bootstrap module | In progress | Real `py-libp2p` bootstrap exists with `new_host(...)` and sqlite peerstore; transport activation and lifecycle management are still pending |
| Build first-class discovery and heartbeat services | In progress | Discovery payloads and protocol suite exist; live gossip/heartbeat transport is still pending |
| Add peer enrollment model and trust-tier design | In progress | Captured in migration brief; persistence and API implementation are pending |
| Define peer-published quantum service manifest, signing, and approval workflow | In progress | Manifest models exist; signing and approval enforcement are pending |
| Define benchmark data model for quantum-vs-classical runs | In progress | Benchmark metadata exists; run/result/provenance models are pending |
| Define swarm-aware package placement and seeding metadata | Pending | Not started |

## Evidence In Repo

- [config/models.py](./src/quantum_backend_v2/config/models.py), [config/loader.py](./src/quantum_backend_v2/config/loader.py), [.env.example](./.env.example), and the local ignored `.env` establish the local-vs-Neon and local-vs-remote database workflow.
- [persistence/postgres.py](./src/quantum_backend_v2/persistence/postgres.py), [persistence/mongodb.py](./src/quantum_backend_v2/persistence/mongodb.py), [persistence/runtime.py](./src/quantum_backend_v2/persistence/runtime.py), and [alembic/env.py](./alembic/env.py) provide the SQLAlchemy, Beanie, Alembic, and hybrid-runtime foundation for real database work.
- [alembic/versions/838b0126c4fd_initial_platform_tables.py](./alembic/versions/838b0126c4fd_initial_platform_tables.py) is the first transactional schema revision aligned with the ORM models.
- [api/app.py](./src/quantum_backend_v2/api/app.py), [api/routers/system.py](./src/quantum_backend_v2/api/routers/system.py), and [bootstrap/application.py](./src/quantum_backend_v2/bootstrap/application.py) show the thin FastAPI edge, readiness wiring, explicit dependency assembly, and persistence startup and shutdown inside the FastAPI lifespan.
- [libp2p/bootstrap.py](./src/quantum_backend_v2/libp2p/bootstrap.py) now imports and uses the real `py-libp2p` package (`new_host`, `create_sync_sqlite_peerstore`, and `create_new_ed25519_key_pair`) while [discovery/models.py](./src/quantum_backend_v2/discovery/models.py) defines the first discovery payloads.
- [tests/unit/test_health_endpoint.py](./tests/unit/test_health_endpoint.py), [tests/unit/test_config_loader.py](./tests/unit/test_config_loader.py), [tests/unit/test_persistence.py](./tests/unit/test_persistence.py), and [tests/unit/test_discovery_bootstrap.py](./tests/unit/test_discovery_bootstrap.py) cover the current milestone.

## Immediate Next Moves

1. Exercise the new migration against a Neon branch DSN (direct URL) and document any Neon-specific connection notes beside local `qds` bring-up.
2. Replace the libp2p bootstrap plan with listener activation defaults, advertisement transport, heartbeat scheduling, stale handling, and peer registry materialization.
3. Add projection writers that upsert Beanie documents from libp2p discovery events, plus tests that prove Mongo readiness flips to `ready` when a local Mongo instance is reachable.
