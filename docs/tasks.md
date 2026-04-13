# Implementation Plan: Distributed Quantum Services (Python POC)

This task plan is requirement-driven and optimized for a research POC that can evolve into production architecture.

Long-horizon roadmap note:

- use this file for the current proof-of-concept implementation sequence
- use [FUTURE_ROADMAP.md](FUTURE_ROADMAP.md) for the detailed multi-milestone future platform plan
- use [future-roadmap/00-sequencing-and-program-plan.md](future-roadmap/00-sequencing-and-program-plan.md) for milestone ordering and dependencies

## 1. Milestone Summary

1. **M0 Foundation**: project scaffold, config, logging, CI checks
2. **M1 Discovery Plane**: advertisement, discovery, registry freshness
3. **M2 Planning Plane**: circuit IR, DAG compiler, cost-based assignment
4. **M3 Coordination Plane**: reservation protocol + runtime orchestration
5. **M4 API + Persistence**: job API, SQLite persistence, restart recovery
6. **M5 Evaluation Plane**: experiment harness and baseline comparison
7. **M6 Hardening**: reliability, observability, documentation closure

---

## 2. Milestone Details

### M0 Foundation

Goal: establish a reliable Python codebase with testing and configuration.

- [x] Create project skeleton under `src/quantum_coordinator/`
- [x] Add `pyproject.toml` with runtime/dev dependencies
- [x] Add `Makefile` targets: `install`, `lint`, `format`, `test`, `run`
- [x] Add typed config loader with env overrides
- [x] Add structured logging with correlation IDs
- [x] Add CI test/lint/type-check workflow

Deliverables:
- executable empty app with health endpoint and config validation

Requirement mapping:
- FR-011, FR-012, NFR-004, NFR-005

Exit criteria:
- `make lint` and `make test` pass
- invalid config fails startup with clear message

### M1 Discovery Plane

Goal: service nodes can advertise capabilities and coordinator can maintain a fresh registry.

- [x] Define advertisement schema + validator
- [x] Implement libp2p adapter interfaces (`PubSubAdapter`, `PeerAdapter`, optional `DHTAdapter`)
- [x] Implement service advertisement publisher on service node side
- [x] Implement discovery subscriber on coordinator side
- [x] Implement registry TTL/staleness handling
- [x] Persist current registry snapshot to SQLite
- [x] Add integration test with 3+ nodes exchanging advertisements

Deliverables:
- queryable service registry with freshness guarantees

Requirement mapping:
- FR-001, FR-002, FR-008, FR-010

Exit criteria:
- coordinator discovers nodes and removes stale nodes by TTL
- integration test demonstrates dynamic join/leave behavior

### M2 Planning Plane

Goal: compile circuits to distributed execution plans using explicit cost model.

- [x] Implement circuit ingestion + normalization to IR
- [x] Implement dependency DAG builder
- [x] Implement fragment abstraction and feasibility checks
- [x] Implement scoring engine with configurable weights (`w_lat`, `w_fail`, `w_ent`, `w_load`)
- [x] Implement planner output with primary + fallback assignments
- [x] Add deterministic mode (seeded) for reproducible planning
- [x] Add unit/property tests for planner invariants

Deliverables:
- compiler producing validated execution plans from benchmark circuits

Requirement mapping:
- FR-003, FR-004, FR-008, NFR-001

Exit criteria:
- same seeded input gives same plan
- infeasible circuits return actionable error reasons

### M3 Coordination Plane

Goal: execute plans safely with reservation, retries, and fallback.

- [x] Define reservation request/response contract
- [x] Implement reservation state machine (`REQUESTED -> PREPARED -> COMMITTED -> ...`)
- [x] Implement runtime dependency scheduler for plan fragments
- [x] Implement gate execution protocol adapter
- [x] Implement retry policy with bounded exponential backoff + jitter
- [x] Implement fallback selection and re-reservation path
- [x] Persist reservation and fragment execution events
- [x] Add failure-injection tests: timeout, reject, node drop, quality degradation

Deliverables:
- runtime that completes or fails with detailed fragment-level diagnostics

Requirement mapping:
- FR-005, FR-006, FR-007, FR-008, FR-010, NFR-002

Exit criteria:
- transient failures are retried/fallbacked per policy
- terminal failure includes clear reason and failed fragment identity

### M4 API + Persistence

Goal: expose complete job lifecycle and durable state.

- [x] Implement `POST /api/v1/circuits/submit`
- [x] Implement `GET /api/v1/jobs/{job_id}`
- [x] Implement `GET /api/v1/services`
- [x] Implement `GET /api/v1/metrics/fidelity/{node_id}`
- [x] Implement `GET /api/v1/health`
- [x] Implement optional websocket job updates
- [x] Create SQLite schema + migrations
- [x] Implement startup recovery for unfinished jobs and registry cache
- [x] Add API key auth + rate limiting toggles

Deliverables:
- externally usable API for end-to-end job orchestration

Requirement mapping:
- FR-009, FR-010, FR-012, FR-014

Exit criteria:
- end-to-end API flow works from submit to completion
- restart recovery restores valid in-flight state

### M5 Evaluation Plane

Goal: generate publishable evidence for coordination tradeoffs.

- [ ] Implement centralized orchestration baseline mode
- [ ] Implement experiment runner with scenario matrix
- [ ] Add fault injection controls (network latency spikes, service node dropout, fidelity degradation over time)
- [ ] Record run metrics to `experiment_runs` and `experiment_results`
- [ ] Create report script/notebook comparing distributed vs centralized results
- [ ] Ensure reproducibility with run config snapshots and seed capture

Deliverables:
- experiment report artifacts (CSV/JSON + summary figures)

Requirement mapping:
- FR-013, NFR-003, NFR-005

Exit criteria:
- one-command benchmark run generates comparison artifacts
- report includes latency, success rate, retries/fallbacks, and fidelity outcomes

### M6 Hardening and Closeout

Goal: improve robustness and prepare docs for review/publication.

- [ ] Add performance tests for 10-node and 50-fragment workloads
- [ ] Tune queue and retry limits to avoid retry storms
- [ ] Add coverage gates for core modules
- [ ] Add operator runbook (start, stop, recover, inspect)
- [ ] Finalize architecture and protocol docs
- [ ] Final pass: requirement traceability check

Deliverables:
- stable POC with complete docs and test evidence

Requirement mapping:
- FR-001..FR-014, NFR-001..NFR-005

Exit criteria:
- all mapped requirements have tests/evidence
- docs and experiment outputs are internally consistent

---

## 3. Cross-Cutting Workstreams

### 3.1 Testing Strategy

- [ ] Unit tests for domain logic (planner, state machines, validators)
- [ ] Integration tests for libp2p adapter behavior
- [ ] Property tests for protocol/state invariants
- [ ] End-to-end tests for API and job lifecycle

Targets:
- >= 80% coverage for coordinator core packages
- deterministic tests for planner and runtime where applicable

### 3.2 Observability Strategy

- [ ] Define canonical log schema (JSON)
- [ ] Emit job/fragment correlation IDs in all core paths
- [ ] Track key counters and latencies
- [ ] Add debug endpoint or CLI report for active reservations and queue state

### 3.3 Risk Mitigation Tasks

- [ ] Build adapter contract tests to isolate py-libp2p changes
- [ ] Add chaos tests for intermittent connectivity
- [ ] Add stale registry simulation tests
- [ ] Add bounded resource guards (queue limits, payload size limits)

---

## 4. Suggested Execution Order (Pragmatic)

1. M0 -> M1 -> M2 (establish planning quality before full runtime)
2. M3 (make runtime robust before public API expansion)
3. M4 (expose full API once core coordination is stable)
4. M5 (evaluation and baseline comparisons)
5. M6 (hardening and final polish)

---

## 5. Definition of POC Completion

POC is complete when:
1. End-to-end distributed execution works from API submit to result retrieval.
2. Failure handling (retry/fallback) is validated with injected faults.
3. Persistence and restart recovery are verified.
4. Distributed mode is compared against centralized baseline with reproducible metrics.
5. Requirement traceability is complete and documented.
