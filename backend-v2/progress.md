# Backend V2 Progress

This file tracks implementation progress against [backend-migration.md](./backend-migration.md).

## Overall Snapshot

- Estimated overall completion: `~62%`
- Current active milestone: `Phase 4 - Durable reservations and execution`
- Last completed milestone: `Phase 3 - Libp2p-native discovery and peer lifecycle`

## Phase Progress

| Phase | Status | Estimated Completion | What Is Done | What Is Still Pending |
| --- | --- | ---: | --- | --- |
| Phase 0: Architectural foundation | In progress | `78%` | Python package scaffold, target `src/` layout, first protocol contracts, first package and peer-published service manifest models, persistence ownership/catalog contracts, local and cloud `.env` workflow, Alembic scaffold | Richer identity/application/runtime modules, more protocol families, and deeper domain boundaries |
| Phase 1: Developer-friendly API foundation | In progress | `72%` | Thin FastAPI app, versioned `/api/v1` router, explicit bootstrap/config flow, typed health and readiness contracts, developer-facing libp2p bootstrap endpoint, lifespan hooks, discovery API endpoints (`/api/v1/discovery/peers`, `/api/v1/discovery/topology`) | Auth dependency model, shared error contracts, OpenAPI discipline, pagination/streaming conventions, SDK-first response envelopes |
| Phase 2: Durable state model | In progress | `76%` | Typed local/Neon Postgres settings, typed local/remote Mongo settings, append-only local peer log, SQLAlchemy ORM base and first transactional models, Beanie document models, Alembic scaffold, persistence runtime probes, first Alembic revision for core transactional tables, Beanie `init_beanie` on FastAPI startup plus client disposal on shutdown | Additional migration revisions as new ORM entities land, projection writers, replay/recovery orchestration, stricter no-in-memory-truth enforcement across future modules |
| Phase 3: Libp2p-native discovery and peer lifecycle | **Done** | `100%` | Typed libp2p settings (heartbeat interval, stale TTL, topics as properties), real `py-libp2p` host bootstrap, sqlite peerstore, deterministic key derivation, GossipSub pubsub factory (`libp2p/pubsub.py`), trio-based `LibP2pNetworkThread` with live listener activation, advertisement transport (initial broadcast on startup), heartbeat scheduling loop, stale peer TTL enforcement, rejoin detection, `PeerRegistry` with MongoDB `PeerCapabilityDocument` and `TopologyProjectionDocument` upserts, `DiscoveryService` with asyncio drain loop and periodic stale sweep, discovery API endpoints, full test coverage (31 new passing tests) | — |
| Phase 4: Durable reservations and execution | Not started | `0%` | None yet | Reservation event log, execution event log, recovery logic, fallback and retry orchestration |
| Phase 5: Open peer enrollment | Not started | `15%` | Migration brief defines trust tiers and peer-published services; transactional peer enrollment ORM model now exists | Enrollment APIs, ownership checks, trust-tier persistence, policy gates, capability registration |
| Phase 6: Swarm-ready package and artifact layer | In progress | `28%` | Service/package manifest foundation, integrity metadata, benchmark metadata, peer-published service workflow captured in the migration brief | Signing and verification implementation, chunked transfer, seeding, artifact replication metadata, swarm placement metadata |
| Phase 7: Quantum-first applications and benchmarks | Not started | `12%` | Benchmark mode/comparison intent exists in package models and the migration brief | Workflow models, provenance bundles, benchmark run storage, publishable result packages, financial/scientific domain apps |

## Phase 3 Evidence In Repo

| Component | File | Description |
| --- | --- | --- |
| GossipSub factory | [libp2p/pubsub.py](./src/quantum_backend_v2/libp2p/pubsub.py) | Creates `GossipSub` router + `Pubsub` wired to an `IHost` |
| Trio transport thread | [libp2p/transport.py](./src/quantum_backend_v2/libp2p/transport.py) | `LibP2pNetworkThread` — daemon thread running `trio.run()`, starts `host.run(listen_addrs=...)`, subscribes to topics, heartbeat loop, stop-event polling |
| Event bridge | [discovery/events.py](./src/quantum_backend_v2/discovery/events.py) | `DiscoveryEvent` + `DiscoveryEventKind` — thread-safe `queue.SimpleQueue` payload |
| Peer registry | [discovery/registry.py](./src/quantum_backend_v2/discovery/registry.py) | `PeerRegistry` — asyncio-facing, TTL enforcement, stale/rejoin logic, MongoDB `PeerCapabilityDocument` + `TopologyProjectionDocument` upserts |
| Discovery service | [discovery/service.py](./src/quantum_backend_v2/discovery/service.py) | `DiscoveryService` — coordinates transport thread + asyncio drain loop + periodic stale sweep |
| Discovery API models | [api/models/discovery.py](./src/quantum_backend_v2/api/models/discovery.py) | `PeerSummary`, `PeerDetail`, `PeerListResponse`, `TopologyResponse` |
| Discovery router | [api/routers/discovery.py](./src/quantum_backend_v2/api/routers/discovery.py) | `GET /api/v1/discovery/peers`, `GET /api/v1/discovery/peers/{peer_id}`, `GET /api/v1/discovery/topology` |
| Config additions | [config/models.py](./src/quantum_backend_v2/config/models.py) | `heartbeat_interval_seconds`, `stale_peer_ttl_seconds`, `advertisement_topic` + `heartbeat_topic` properties; `activate_listeners` defaults to `True` |
| Tests | [tests/unit/test_discovery_registry.py](./tests/unit/test_discovery_registry.py) | 13 tests: advertisement, heartbeat, stale TTL, rejoin, query interface |
| Tests | [tests/unit/test_discovery_service.py](./tests/unit/test_discovery_service.py) | 12 tests: lifecycle, drain loop, offline thread, config defaults |
| Tests | [tests/unit/test_discovery_api.py](./tests/unit/test_discovery_api.py) | 6 tests: list peers, peer detail, 404, topology counts |

## First Concrete Tasks

| Task From Migration Brief | Status | Notes |
| --- | --- | --- |
| Scaffold `backend-v2` as a Python package with the target folder layout | Done | Package, test, bootstrap, config, API, protocols, packages, and persistence foundations exist |
| Define Postgres entities and migration discipline | In progress | SQLAlchemy ORM models, Alembic scaffold, and first revision `838b0126c4fd` for `platform_users`, `workflow_definitions`, and `peer_enrollments` exist; expand revisions as the relational model grows |
| Define MongoDB collections and projection strategy | In progress | Beanie document models, target selection, and startup-time `init_beanie` wiring exist; `PeerCapabilityDocument` and `TopologyProjectionDocument` are now upserted from live discovery events |
| Define durable local peer log format | Done | `PeerLogRecord` plus JSONL-backed append-only `LocalPeerLogStore` are implemented |
| Define protocol schemas and versioning rules | In progress | Base protocol descriptor models exist; family-specific protocols are still pending |
| Build a thin FastAPI app with no business state in `app.state` | Done | Current app keeps the API edge thin and injects dependencies explicitly |
| Build a `py-libp2p` bootstrap module | Done | Real `py-libp2p` bootstrap with `new_host(...)`, sqlite peerstore, listener activation, GossipSub pubsub, heartbeat scheduling, and advertisement transport |
| Build first-class discovery and heartbeat services | Done | `DiscoveryService` + `LibP2pNetworkThread` + `PeerRegistry` — live gossip transport, TTL enforcement, stale handling, and rejoin all implemented |
| Add peer enrollment model and trust-tier design | In progress | Captured in migration brief; persistence and API implementation are pending |
| Define peer-published quantum service manifest, signing, and approval workflow | In progress | Manifest models exist; signing and approval enforcement are pending |
| Define benchmark data model for quantum-vs-classical runs | In progress | Benchmark metadata exists; run/result/provenance models are pending |
| Define swarm-aware package placement and seeding metadata | Pending | Not started |

## Immediate Next Moves (Phase 4)

1. Define the `ReservationEvent` log model in Postgres — append-only, replayable, with transition states: `REQUESTED → ACCEPTED → COMMITTED → CANCELLED → EXPIRED`.
2. Define the `ExecutionEvent` log model — captures fragment dispatch, progress, completion, and failure transitions durably.
3. Build a `ReservationService` that reconstructs conflict state from the event log instead of in-memory maps.
4. Build a `RuntimeRecoveryService` that replays the event log on process startup to rebuild the execution runtime's view of inflight work.
5. Design the fallback and retry orchestration flow for failed fragments (fits into Phase 4 + the swarm model in Phase 6).
