# Backend V2 Migration Review

Date: 2026-04-19
Status: Proposed migration brief for `backend-v2/`

## Purpose

This document turns the current backend review into an actionable migration brief for `backend-v2`.

This is not a cosmetic cleanup of `backend/`.
This is a redesign toward a **quantum-first, decentralized, peer-extensible platform** that is:

- very developer friendly
- very AI-agent friendly
- strongly protocol-driven
- durable by default
- swarm-ready by design
- credible for scientific and financial benchmarking

It should use the full power of:

- `FastAPI`
- `py-libp2p`
- Postgres on Neon
- MongoDB
- strong protocol contracts
- strong observability and provenance

## Vision

`backend-v2` should become the backend foundation for a platform that:

- lets any eligible user eventually add their own peer or device into the network
- scales past a fixed cluster into an indefinitely extensible peer fabric
- supports quantum-led applications, not only infrastructure demos
- proves its value with reproducible quantum-vs-classical benchmarks
- evolves naturally into the roadmap milestones around:
  - production platform
  - bring-your-own-node network
  - scientific and financial applications
  - torrent-native swarm distribution
  - self-healing distributed coordination

## Strategic Alignment With The Roadmap

This migration brief is intentionally aligned with:

- `docs/FUTURE_ROADMAP.md`
- Milestone 1: production SDK and platform
- Milestone 2: bring your own node network
- Milestone 3: autonomous research and scientific workflows
- Milestone 4: torrent-native service network
- Milestone 5: hydra-style resilience

That means `backend-v2` should not optimize only for current POC behavior.
It should be shaped so later milestones do not force a second architectural rewrite.

## Executive Summary

The current `backend/` contains useful ideas, but it is still too centralized in behavior, too dependent on in-memory runtime state, and too overloaded in its API composition.

The main migration goals are:

1. remove all source-of-truth in-memory coordination state
2. keep the external API very developer friendly and AI-agent friendly
3. make `py-libp2p` the real execution and network substrate
4. support open peer enrollment and indefinite network extension
5. adopt a hybrid persistence model with Neon Postgres plus MongoDB
6. design for torrent-like distribution of packages, artifacts, and datasets
7. make quantum-first workloads and quantum-vs-classical benchmarks first-class product concerns

## Review Of Current Backend

### What is good in `backend/`

- The domain language is already useful: planning, runtime, reservation, discovery, persistence.
- The docs describe a stronger architecture than the current implementation.
- The project already treats quantum capabilities as network services.
- There is already a libp2p thesis to preserve and expand.

### What is wrong in `backend/`

#### 1. Too much critical state still depends on process memory

Plans, live reservation reasoning, and parts of runtime progress are still too close to in-memory ownership.

Impact:

- weak restart recovery
- weak multi-process or multi-coordinator evolution
- low trust in operational correctness

#### 2. The API layer is too overloaded

The API file currently acts as:

- HTTP boundary
- composition root
- runtime bootstrap
- discovery bootstrap
- topology tool
- feature host

Impact:

- poor developer ergonomics
- poor AI-agent ergonomics
- hidden coupling
- high fear-of-change

#### 3. Discovery is not yet strong enough for a real open network

Discovery freshness and runtime registry behavior are not yet robust enough for a world where foreign peers can join, sleep, disconnect, and rejoin.

Impact:

- stale peer risk
- unclear peer lifecycle behavior
- weak fit for future BYON milestone

#### 4. Reservation and execution durability are not strong enough

The runtime is not yet built around replayable, durable, reconstructable state.

Impact:

- fragile recovery
- low confidence under faults
- hard path toward swarm and hydra evolution

#### 5. The data plane is too small for the real future of the project

The current persistence model is still POC-shaped.

Impact:

- weak provenance
- weak scientific credibility
- weak support for workflow products
- weak support for financial and scientific benchmark publication

## Non-Negotiable Backend V2 Rules

1. No source-of-truth state lives only in memory.
2. In-memory data may exist only as disposable cache, request-local state, or recomputable view.
3. If a process dies, the system must be able to rebuild execution truth from durable records and peer-visible events.
4. API handlers must stay thin, typed, explicit, and easy to test.
5. `py-libp2p` is not a side adapter. It is the real decentralized substrate.
6. Every important network behavior must have an explicit protocol contract and version.
7. Open peer participation must be designed in from the start, even if rollout is phased.
8. Developer and AI-agent ergonomics are first-class architecture concerns, not documentation afterthoughts.
9. Quantum-first workload support must be built with benchmark credibility, reproducibility, and classical baselines.
10. Decentralization should increase capability, not create distributed confusion.

## No In-Memory Source Of Truth

The user requirement here is clear: keep nothing authoritative in memory.

For `backend-v2`, this means:

- no authoritative plan cache
- no authoritative reservation conflict state in process memory
- no authoritative peer registry that cannot be rebuilt
- no authoritative execution progress map that disappears on restart
- no "live only" workflow ownership logic

Allowed in-memory usage:

- request-scope variables
- short-lived read-through caches
- memoized projections that can be dropped instantly
- protocol parsing buffers
- ephemeral execution workers that always write durable state before advancing system truth

Rule:

If losing process memory changes business truth, the design is wrong.

## Developer And AI-Agent Friendliness

`backend-v2` should feel easy to:

- understand
- navigate
- test
- automate
- patch safely
- extend with agents and tools

### Project-level DX rules

- small modules with clear ownership
- narrow files instead of giant god files
- typed request and response models everywhere
- explicit interfaces and protocol schemas
- predictable folder layout
- zero magic globals
- minimal hidden side effects at import time
- one obvious composition root per runtime mode
- rich local docs close to the code
- easy local bring-up
- easy fixture and fake-peer setup
- deterministic integration harnesses

### AI-agent friendliness rules

- every important module should have a clear responsibility
- protocol definitions should live in one place
- event schemas should be machine-readable and testable
- examples should exist for wire messages and state transitions
- bootstrap code should be shallow and explicit
- there should be no giant `app.py` or giant `main.py` sinkhole
- tests should be runnable in slices
- fake adapters and simulated peers should be first-class
- generated OpenAPI and typed clients should be stable

## FastAPI-First API Design

We should use the full power of FastAPI, but we should use it correctly.

### FastAPI should own

- thin routers
- versioned endpoints
- dependency injection
- auth dependencies
- response models
- validation
- exception mapping
- websocket and event-stream surfaces
- generated OpenAPI
- SDK generation inputs
- test overrides
- lifespan wiring

### FastAPI should not own

- durable orchestration logic
- long-lived state machines
- hidden background durability flows
- peer-network coordination logic
- business truth that only exists in app state

### API design rules

- stable versioned routes
- idempotency support
- pagination and filtering
- correlation IDs
- project and org scoping
- consistent error model
- agent- and SDK-friendly shapes
- minimal surprise in request/response contracts

## Centralized vs Decentralized Split

### Remains centralized

- user identities
- authentication
- sessions and token issuance
- API keys
- organization and project ownership
- user-owned private metadata
- admin policy
- audit policy decisions
- quota policy
- trust policy decisions

These need a clear trust boundary and strong consistency.

### Must be decentralized

- service advertisement
- peer discovery
- peer heartbeat propagation
- reservation negotiation
- fragment execution
- capability gossip
- quality propagation
- topology awareness
- package distribution
- dataset and artifact distribution
- fallback and reroute messaging
- peer-assisted fetch and replication

## Py-Libp2p First Policy

`backend-v2` should treat `py-libp2p` as a primary systems primitive.

We should heavily use it for:

- pubsub-based advertisements
- pubsub-based quality and health events
- peer streams for reservation prepare / commit / cancel
- peer streams for fragment execution
- peer streams for execution state sync
- peer identity and peer metadata
- peer-assisted artifact and package transfer
- swarm-aware discovery
- content-addressed or package-addressed retrieval flows

### Important design note

`py-libp2p` should not be treated as the primary database.

Its role is:

- transport
- discovery
- gossip
- replication path
- peer-assisted distribution path
- decentralized control and data movement substrate

Durable truth should still live in persistent stores and durable local peer logs.

## Open Peer Network Requirement

This project must assume that future users outside the core team can add their own peer to the network.

That means `backend-v2` must be built for:

- foreign peers
- untrusted or semi-trusted peers
- heterogeneous devices
- changing network conditions
- indefinite extension of the network

### This changes architecture immediately

We cannot assume:

- a fixed embedded peer list
- a centrally curated tiny node set
- stable always-on peer behavior
- homogeneous hardware
- implicit trust

### Therefore backend-v2 needs

- node enrollment flow
- peer identity model
- node ownership model
- project-scoped and org-scoped participation rules
- trust tiers
- sandboxing model
- capability attestation
- peer reputation
- drain / sleep / disconnect / rejoin lifecycle support

## Trust And Peer Enrollment Model

### Suggested peer trust tiers

- `PLATFORM_MANAGED`
- `ORG_MANAGED`
- `USER_CONTRIBUTED`
- `PUBLIC_UNTRUSTED`
- `QUARANTINED`

### Suggested peer lifecycle

- `ENROLLING`
- `PENDING_APPROVAL`
- `READY`
- `BUSY`
- `IDLE`
- `SLEEPING`
- `DEGRADED`
- `DISCONNECTED`
- `REJOINING`
- `QUARANTINED`

### Enrollment model

1. user authenticates centrally
2. user receives enrollment token or join authorization
3. node agent bootstraps secure identity
4. node advertises capability and benchmark profile
5. control plane applies policy and trust rules
6. peer joins the decentralized network with bounded permissions

## Peer-Published Quantum Services

Each peer should eventually be able to publish its own quantum services into the network for contribution.

This is an important product and architecture decision.
The network should not only discover peers.
It should discover **peer-published services** that can be:

- authored by a contributor
- signed by the publisher
- approved or policy-gated by the platform
- replicated through the swarm
- installed on other peers
- benchmarked against classical alternatives
- made discoverable as first-class network objects

### What a peer-published quantum service is

A peer-published quantum service is a portable service package that declares:

- service identity
- publisher identity
- version
- runtime type
- quantum capability category
- optional classical baseline category
- hardware and software requirements
- security and sandbox requirements
- input and output schema
- benchmark metadata
- trust and visibility metadata
- package integrity data

### Examples

- a custom variational quantum circuit optimizer
- a quantum portfolio simulation service
- a quantum chemistry scoring primitive
- a financial risk scenario quantum heuristic
- a hybrid quantum-classical calibration service
- a benchmark-only service that exposes a reproducible quantum-vs-classical task

### Required publication workflow

1. publisher authenticates through the central identity layer
2. publisher builds and signs a service package
3. package metadata is registered in the control plane
4. policy checks validate trust, compatibility, and allowed runtime class
5. package manifest is announced into the peer network
6. peers fetch, seed, and optionally install the package
7. service becomes queryable in discovery and schedulable by the planner

### Why this matters

This turns the system from:

- a platform with fixed built-in services

into:

- a network where contributors can expand the quantum capability surface themselves

That is much more aligned with:

- open peer participation
- long-term ecosystem growth
- research collaboration
- grant-worthy infrastructure building

### Safety rule

Peer-published services must never mean "arbitrary unreviewed remote code runs everywhere".

They need:

- signed manifests
- runtime class restrictions
- sandboxing
- policy approval
- compatibility checks
- provenance
- auditability
- quarantine path

### Scheduler implication

The scheduler should eventually reason not only about:

- which peer can run a service

but also:

- which peers already host or seed the service package
- which peers can fetch it fastest
- which peer-published services are trusted for a given workflow
- which service variant gives the best quantum-vs-classical benchmark value

## Torrent-Native Direction

The future roadmap is right to treat the torrent model as more than "file sharing".

`backend-v2` should prepare for a swarm-native layer for:

- service packages
- workflow bundles
- model weights
- datasets
- artifact bundles
- cached execution inputs
- reusable scientific assets

### Required design principles

- content-addressing where possible
- signed packages and manifests
- chunked transfer
- resumable transfer
- background seeding
- replication metadata
- locality-aware planning
- peer-assisted fetch

### Hybrid model

Central control plane should own:

- trust and policy
- ownership metadata
- package approval
- visibility controls

Swarm layer should own:

- distribution
- caching
- replication
- seeding
- peer-assisted delivery

## Torrent-Inspired Architectural Principles Beyond Files

We should not copy torrents only at the "download a file in chunks" level.

The more valuable inspiration is architectural.

### 1. Swarming for services, workflows, and evidence

We should generalize the swarm idea from files to:

- service packages
- workflow bundles
- benchmark inputs
- execution artifacts
- evidence packs

This means many peers can contribute to one logical execution ecosystem, not just one file transfer.

### 2. Magnet-style references for services and workflows

The network should support compact references to:

- service packages
- workflow templates
- benchmark packs
- artifact bundles

Peers can resolve metadata and payloads later from the network.
That reduces coupling to central metadata delivery and makes packages portable.

### 3. Extension-negotiated protocols

Like BitTorrent extension negotiation, we should keep a very small durable core and negotiate optional capabilities over explicit protocol extensions.

This is useful for:

- new gate families
- new benchmark payloads
- package exchange features
- trust metadata
- proof and evidence exchange formats

### 4. Rarest-first for scarce capabilities

BitTorrent protects swarm health by prioritizing rare pieces.

We should adapt that idea to:

- rare service packages
- rare model bundles
- rare dataset shards
- rare specialized quantum capabilities

That turns swarm health into a scheduling primitive.

### 5. Endgame mode for latency-sensitive execution

When the system is waiting on a tiny number of critical fragments or verification steps, it should be allowed to speculatively duplicate them across multiple peers and accept the first valid result.

This could become a major differentiator for:

- tail-latency reduction
- resilient scientific workflows
- benchmark reliability

### 6. Super-seeding for new service rollout

When a new peer-published service enters the network, origin peers should distribute it strategically to create new seeders quickly instead of wasting bandwidth on redundant transfers.

This is especially useful for:

- new quantum service releases
- model updates
- benchmark pack publication

### 7. Peer exchange for service-network growth

Peers should tell other peers about:

- reliable neighbors
- active seeders
- good executors
- peers hosting specific service packages

That helps the network evolve more organically and reduces over-reliance on central discovery.

### 8. Merkleized verification for artifacts and benchmarks

We should use Merkle-style verification for:

- service bundles
- datasets
- artifact bundles
- benchmark traces
- reproducibility packs

That lets peers validate partial content and publish proofs, not just trust opaque blobs.

### 9. Wantlists and predictive prefetch

Peers should be able to announce the packages, blocks, model shards, and artifact pieces they expect to need soon.

That enables:

- prefetching
- low-latency startup
- smarter package placement

### 10. Swarm-aware scheduling

The planner should care about:

- where service packages already live
- which peers are currently seeding them
- where artifacts are cached
- whether data movement or execution movement is cheaper

This is much more powerful than simple node capability matching.

### 11. Locality-aware micro-swarms

The network should support temporary execution swarms scoped by:

- organization
- workflow
- benchmark family
- dataset
- region or lab

This gives better locality, better caching, and better reproducibility.

### 12. Contribution-aware reputation

Peers should earn better scheduling priority not only by uptime, but also by:

- seeding useful service packages
- preserving benchmark artifacts
- serving rare capabilities
- producing reproducible results

That creates a healthier network without requiring token economics on day one.

## Grant-Worthy Differentiation

The strongest story here is not "BitTorrent for quantum files".

The stronger story is:

- torrent-inspired swarm mechanics generalized to services, workflows, datasets, artifacts, and evidence
- open peer-contributed quantum service publishing
- verifiable quantum-vs-classical benchmark execution over a decentralized network
- reproducible scientific and financial workflow artifacts

This combination is a much stronger funding and research angle than a normal decentralized compute pitch.

## Quantum-First Product Direction

This is a quantum decentralized project.
That should show up in the architecture and product strategy.

The platform should not become "generic distributed compute with a quantum skin".

It should be built so that:

- quantum workflows are first-class
- quantum services are discoverable and composable
- quantum execution evidence is preserved
- quantum-vs-classical comparisons are first-class artifacts

## Quantum Vs Classical Benchmark Requirement

For scientific and financial workflows, every major domain workflow should support:

- quantum-led path
- classical baseline path
- same dataset or same input snapshot
- same output schema
- comparable metrics
- provenance and reproducibility

### Benchmark outputs we should preserve

- latency
- cost estimate
- success rate
- output quality metrics
- final score or valuation outcome
- input dataset version
- model version
- peer/node execution path
- assumption set
- reproducibility snapshot

### Why this matters

The platform should earn trust with reproducible evidence, not claims.

That is especially important if we want the work to be:

- publishable
- defensible
- reusable by serious research and engineering teams

## Financial Modelling And Scientific Workflow Direction

The roadmap already points toward financial modelling and broader scientific workflows.

`backend-v2` should prepare for:

- workflow graphs
- parameter sweeps
- scenario analysis
- scientific provenance
- financial model provenance
- model and artifact registries
- report bundles
- comparison dashboards

### Financial workflows should support

- filing ingestion
- statement normalization
- DCF generation
- scenario and sensitivity analysis
- comparable-company analysis
- valuation memo generation
- machine-readable output artifacts
- quantum-vs-classical comparison packs

## Target Backend V2 Shape

Recommended top-level structure:

```text
backend-v2/
  backend-migration.md
  pyproject.toml
  README.md
  src/quantum_backend_v2/
    api/
      routers/
      deps/
      models/
      errors/
      streaming/
    identity/
    application/
    domain/
    protocols/
    libp2p/
    discovery/
    planning/
    reservations/
    runtime/
    quality/
    packages/
    artifacts/
    workflows/
    provenance/
    persistence/
      postgres/
      mongodb/
      local_logs/
    observability/
    bootstrap/
    experiments/
    sdk_contracts/
  tests/
    unit/
    integration/
    network/
    e2e/
    fixtures/
```

## Recommended Major Boundaries

### `api/`

Purpose:

- very thin external boundary
- stable developer-facing platform contract
- clean typed models

### `identity/`

Centralized concerns only:

- users
- orgs
- projects
- tokens
- API keys
- role checks

### `application/`

Use-case orchestration only:

- submit workflow
- enroll peer
- query run
- approve package
- start benchmark

### `protocols/`

Versioned network contracts for:

- advertisements
- heartbeat
- reservations
- execution
- quality propagation
- package exchange
- artifact exchange
- peer sync

### `libp2p/`

Concrete `py-libp2p` integration:

- host lifecycle
- pubsub topics
- stream handlers
- peer identity bootstrap
- DHT or index integration later

### `discovery/`

First-class discovery service:

- peer registry materialization
- TTL enforcement
- freshness logic
- capability query surfaces

### `planning/`

Pure logic:

- normalization
- DAGs
- fragments
- cost model
- locality-aware and quality-aware assignment

### `reservations/`

Durable network-aware reservation system:

- event model
- prepare / commit / cancel / expire
- conflict resolution from durable state

### `runtime/`

Distributed execution engine:

- dependency scheduling
- retries
- fallback
- checkpointing
- recovery

### `quality/`

First-class telemetry:

- fidelity
- link quality
- node health
- reliability score inputs

### `packages/`

Swarm-ready package model:

- service bundle manifests
- peer-published quantum service packages
- signatures
- compatibility metadata
- publish, approve, install, and seed workflow
- fetch and replication metadata

### `artifacts/`

Results and large assets:

- execution bundles
- report bundles
- scientific artifacts
- benchmark bundles

### `provenance/`

Lineage and evidence:

- workflow lineage
- model lineage
- dataset lineage
- run lineage

## Persistence Strategy: Neon Postgres + MongoDB + Peer Logs

The persistence model should be hybrid on purpose.

## Role 1: Neon Postgres

Neon Postgres should be the **transactional system of record** for strongly relational and policy-sensitive platform state.

Suggested ownership:

- users
- organizations
- projects
- API keys
- service accounts
- workflow definitions
- workflow runs
- job ownership
- plan headers and plan snapshots
- idempotency records
- package approval records
- policy state
- quotas
- audit logs
- peer enrollment records
- trust decisions

### Why Neon fits well

- standard Postgres semantics
- strong relational integrity
- easy fit for FastAPI and typed service layers
- branching is excellent for preview environments, migrations, testing, and AI-agent dev workflows
- pooled connections are useful for high-concurrency API traffic

### Neon-specific usage guidance

- use pooled connections for normal API traffic
- use direct connections for migrations and sensitive admin operations
- use Neon branches for:
  - preview stacks
  - integration test environments
  - migration rehearsals
  - agent-driven isolated dev sandboxes

## Role 2: MongoDB

MongoDB should be the **flexible document, telemetry, provenance, and event projection store**.

Suggested ownership:

- peer capability documents
- topology projections
- provenance graph documents
- benchmark result documents
- workflow intermediate evidence documents
- scientific and financial artifact metadata
- high-volume telemetry projections
- query-optimized read models for operator and research views

### Good MongoDB fits

- document-heavy workflow evidence
- evolving schema domains
- lineage and graph-adjacent views
- benchmark comparison documents
- operator-facing projections

### MongoDB time-series guidance

MongoDB time-series collections are a strong fit for:

- fidelity measurements
- link-quality measurements
- node health metrics
- benchmark telemetry

But we should design carefully.

Because time-series collections do not support change streams, we should not make them the only event source for live reactive pipelines.

Recommended pattern:

1. write durable raw event to an append-only normal collection or event bus projection
2. fan out or compact into time-series collections for analytics
3. build live subscriptions from change-stream-friendly collections where needed

## Role 3: Durable Local Peer Logs

Each peer should maintain durable local append-only logs for:

- received protocol events
- reservation transitions
- execution transitions
- package fetch and install history
- peer sync checkpoints

These logs support:

- replay
- crash recovery
- peer rejoin
- partial offline operation

## Role 4: Py-Libp2p Distribution Layer

`py-libp2p` is not the primary database, but it should carry and replicate:

- capability events
- quality events
- reservation messages
- execution messages
- package manifests
- chunk transfer coordination
- artifact availability metadata

## Storage Rules

### Postgres is authoritative for

- identity
- policy
- ownership
- transactional workflow metadata
- audit and quota logic

### MongoDB is authoritative for

- flexible documents
- benchmark and provenance read models
- telemetry analytics
- workflow evidence bundles and projections

### Local peer logs are authoritative for

- peer-local replay and recovery history
- last durable network-seen state before sync reconciliation

### Py-libp2p is authoritative for neither

It is the network substrate, not the canonical long-term database.

## Data Model Principles

1. every important state change should be durable
2. every cross-peer protocol should have a durable event representation
3. replay should be possible
4. projections can be rebuilt
5. no operator-critical view should depend on a hidden in-memory cache

## Proposed Service Model

### 1. Central Identity Gateway

Responsibilities:

- user auth
- org and project scoping
- token issuance
- policy checks
- peer enrollment authorization

### 2. API Gateway / Platform API

Responsibilities:

- stable developer-facing contract
- SDK-friendly endpoints
- workflow submission
- benchmark submission
- artifact and package APIs

### 3. Coordinator Peer

Responsibilities:

- planning
- dispatch
- durable orchestration
- execution aggregation
- recovery

### 4. Worker / Service Peer

Responsibilities:

- advertise capabilities
- publish and host approved peer-owned quantum services
- reserve and execute fragments
- seed packages and artifacts
- report health and quality

### 5. Quantum Service Publication Layer

Responsibilities:

- register peer-published service manifests
- validate signatures and metadata
- apply policy approval and visibility rules
- expose publishable services to discovery and scheduling
- track installs, seeders, and hosting peers

### 6. Package / Artifact Swarm Layer

Responsibilities:

- distribute bundles
- seed assets
- support chunked and resumable transfer
- provide locality hints

## Protocol-First Design

All network behaviors should be formalized before deep implementation.

### Required first protocol families

- service advertisement protocol
- service publication and manifest protocol
- heartbeat and health protocol
- reservation prepare / commit / cancel protocol
- fragment execution protocol
- quality update protocol
- package manifest protocol
- chunk transfer protocol
- peer state sync protocol

Each protocol should define:

- version
- schema
- validation rules
- error contract
- retry expectations
- persistence expectations

## FastAPI And SDK Design Requirements

The roadmap is clear that this must become a real platform.

So `backend-v2` should ship toward:

- versioned API
- Python SDK support
- TypeScript SDK support
- CLI-friendly contracts
- generated types
- consistent error contracts
- notebook-friendly usage
- AI-agent-friendly usage

### API friendliness rules

- no weird polymorphic payloads without discriminators
- no hidden background side effects
- no response shape drift across similar endpoints
- status, result, and progress models should be stable and reusable
- docs must show concrete request and response examples

## Architecture Rules For Open Swarm Growth

Since the network should eventually be extendable indefinitely:

- no assumptions about fixed node count
- no assumptions about centralized artifact distribution
- no assumptions about permanent connectivity
- no assumptions about homogeneous bandwidth
- no assumptions about trusted peers by default

Therefore:

- package and artifact locality must matter
- discovery must be freshness-aware
- scheduling must account for availability volatility
- rejoin and replay must be first-class
- peer trust and sandboxing must be explicit

## Security And Sandbox Expectations

For user-contributed peers, we need:

- signed workload packages
- permission-scoped execution
- runtime classes
- resource controls
- auditability
- quarantine path
- trust downgrade path
- compatibility validation before execution

## Migration Phases

### Phase 0: Architectural foundation

Deliverables:

- package skeleton
- module boundaries
- protocol schema definitions
- persistence contracts
- clear identity boundary

### Phase 1: Developer-friendly API foundation

Deliverables:

- thin FastAPI app
- versioned routers
- auth dependency model
- reusable response and error contracts
- SDK-friendly OpenAPI discipline

### Phase 2: Durable state model

Deliverables:

- Neon Postgres schema
- MongoDB schema strategy
- local peer log format
- no in-memory source-of-truth rule enforcement

### Phase 3: Libp2p-native discovery and peer lifecycle

Deliverables:

- peer host bootstrap
- advertisement protocol
- heartbeat protocol
- peer registry materialization
- rejoin and stale handling

### Phase 4: Durable reservations and execution

Deliverables:

- replayable reservation event log
- durable execution event log
- runtime recovery logic
- failure and fallback flow

### Phase 5: Open peer enrollment

Deliverables:

- node enrollment flow
- trust tiers
- ownership model
- policy gating
- benchmark and capability registration

### Phase 6: Swarm-ready package and artifact layer

Deliverables:

- package manifests
- signing and verification
- chunked transfer
- seeding
- artifact replication metadata

### Phase 7: Quantum-first applications and benchmarks

Deliverables:

- workflow model for scientific and financial domains
- quantum-vs-classical benchmark framework
- provenance bundles
- publishable result packages

## First Concrete Tasks

1. scaffold `backend-v2` as a Python package with the target folder layout
2. define Postgres entities and migration discipline
3. define MongoDB collections and projection strategy
4. define durable local peer log format
5. define protocol schemas and versioning rules
6. build a thin FastAPI app with no business state in `app.state`
7. build a `py-libp2p` bootstrap module
8. build first-class discovery and heartbeat services
9. add peer enrollment model and trust-tier design
10. define peer-published quantum service manifest, signing, and approval workflow
11. define benchmark data model for quantum-vs-classical runs
12. define swarm-aware package placement and seeding metadata

## Success Criteria

`backend-v2` is architecturally successful when:

1. there is no authoritative in-memory coordination state
2. API code is easy for developers and agents to navigate
3. the network can grow beyond a fixed set of built-in peers
4. peer discovery, reservation, execution, and quality flows run over `py-libp2p`
5. Postgres and MongoDB have clear responsibilities instead of muddy overlap
6. torrent-like package and artifact distribution is prepared architecturally
7. quantum-first workflows and quantum-vs-classical comparisons are first-class concepts
8. the system is measurably more decentralized, more durable, and more credible than `backend/`

## Recommendation

Do not migrate file-by-file from `backend/` into `backend-v2`.

Instead:

- preserve good domain language
- preserve useful tests where possible
- redesign the data plane
- redesign the composition model
- redesign the peer model
- redesign the execution durability model
- redesign the API for long-term platform usability

`backend-v2` should be a **fresh architecture with selective reuse**, not a renamed copy.