# Requirements Document: Quantum Libp2p Coordinator (Python POC)

## 1. Purpose

This project builds a Python proof-of-concept where `py-libp2p` is the coordination layer for distributed quantum operations. Quantum gate capabilities are exposed as remotely invocable services, while the coordinator handles discovery, planning, reservation, execution sequencing, retries, and fallback.

The core research goal is to evaluate tradeoffs between:
- distributed orchestration over libp2p, and
- a centralized orchestration baseline

for latency, success rate, and final circuit fidelity under degraded network and node conditions.

## 2. Scope

### 2.1 In Scope (POC)

- Circuit ingestion from OpenQASM 2/3 (and optional Qiskit object input)
- Service advertisement and discovery over libp2p
- Distributed circuit planning with an explicit cost model
- Reservation protocol for remote gate execution windows
- Runtime orchestration with timeout/retry/fallback
- Fidelity and link-quality monitoring
- SQLite-backed persistence for jobs, reservations, and metrics
- Experiment harness to compare distributed vs centralized coordinator

### 2.2 Out of Scope (POC)

- Real quantum hardware control and hardware-specific drivers
- Cryptoeconomic incentives or token pricing
- Byzantine fault tolerance / consensus between multiple coordinators
- Production-grade multi-tenant authz model
- Full-blown quantum error correction stacks beyond mocked services

## 3. Actors

- **Client**: Submits circuits and queries job status/results.
- **Coordinator Node**: Compiles circuits, reserves resources, orchestrates execution.
- **Service Node**: Advertises capabilities and executes gate-service requests.
- **Experiment Runner**: Executes benchmark suites and records outcomes.

## 4. Assumptions and Constraints

- Language/runtime: Python 3.11+
- Networking substrate: `py-libp2p`
- Quantum operations are simulated/mocked services in POC
- All critical state changes are persisted to SQLite
- System must operate under partial failures (node loss, timeout, fidelity drop)

## 5. Functional Requirements

### FR-001 Service Advertisement

Service nodes must advertise capabilities and health in a machine-validated schema.

Acceptance criteria:
1. Advertisement includes `node_id`, `service_type`, `fidelity`, `qubit_range`, `availability`, `timestamp`, and protocol version.
2. Invalid advertisements are rejected and logged with reason.
3. Capability or fidelity changes are re-advertised within configured refresh interval.

### FR-002 Service Discovery and Registry Freshness

Coordinator must discover and maintain a fresh registry of service nodes.

Acceptance criteria:
1. Coordinator discovers services by gate type and minimum fidelity.
2. Stale entries are marked unavailable after TTL expiration.
3. Discovery queries support filtering by capability, fidelity threshold, and availability.

### FR-003 Circuit Ingestion and Normalization

Coordinator must accept client circuits and normalize to an internal IR.

Acceptance criteria:
1. OpenQASM 2 and OpenQASM 3 inputs are accepted.
2. Invalid syntax returns a structured validation error.
3. Internal IR preserves gate order, qubit mapping, and measurement instructions.

### FR-004 Distributed Compilation with Cost Model

Compiler must map circuit fragments to service nodes using a defined cost function.

Acceptance criteria:
1. Compilation partitions circuit into executable fragments and dependencies (DAG).
2. Fragment assignment minimizes configurable cost over latency, fidelity risk, and entanglement overhead.
3. If no feasible mapping exists, compiler returns actionable error identifying missing capability/constraint.

### FR-005 Reservation Protocol

Coordinator and service nodes must support reservation of gate execution windows.

Acceptance criteria:
1. Reservation request/response includes operation, time window, fidelity requirement, and correlation IDs.
2. Conflicts return rejection plus optional next-available window.
3. Expired or canceled reservations are released automatically.

### FR-006 Runtime Execution Orchestration

Coordinator runtime must execute according to compiled dependency order.

Acceptance criteria:
1. Runtime executes only when predecessor dependencies are satisfied.
2. Runtime records per-fragment start/end/status and chosen service node.
3. Final result aggregates execution metadata and measurement outputs.

### FR-007 Timeout, Retry, and Adaptive Fallback

Runtime must recover from transient failures when possible.

Acceptance criteria:
1. Timeout policy supports per-operation class configuration.
2. Failed invocations retry with bounded exponential backoff.
3. On retry exhaustion, runtime attempts fallback to next feasible node plan.
4. If no fallback exists, runtime fails fast with detailed fragment-level error.

### FR-008 Fidelity and Link Monitoring

System must track service quality and react to degradation.

Acceptance criteria:
1. Fidelity/link-quality reports are ingested and persisted with timestamps.
2. Registry marks degraded nodes/links below configured thresholds.
3. Compiler and runtime consume latest quality snapshot before assignment/invocation.

### FR-009 Job API and Lifecycle

System must expose job submission and lifecycle APIs.

Acceptance criteria:
1. `POST /api/v1/circuits/submit` returns `job_id` immediately.
2. `GET /api/v1/jobs/{job_id}` reports state: `QUEUED|COMPILING|RESERVING|EXECUTING|COMPLETED|FAILED`.
3. Optional websocket stream provides near real-time job state updates.

### FR-010 Persistence and Recovery

Critical execution state must survive coordinator restarts.

Acceptance criteria:
1. Jobs, reservations, and metrics are persisted to SQLite.
2. On restart, coordinator reloads unfinished jobs and stale-aware service cache.
3. DB migrations are versioned and reversible.

### FR-011 Configuration Management

System behavior must be tunable per environment.

Acceptance criteria:
1. Config file defines timeouts, retries, thresholds, and discovery intervals.
2. Environment overrides are supported.
3. Invalid configuration fails startup with precise error messages.

### FR-012 Observability

Coordinator must provide structured operational insight.

Acceptance criteria:
1. Structured JSON logs include request/job correlation IDs.
2. Metrics cover queue depth, latency, retry counts, failure reasons, and success rate.
3. Health endpoint reflects coordinator and dependency status.

### FR-013 Experiment Harness and Baseline Comparison

Project must include an experiment harness for publishable evaluation.

Acceptance criteria:
1. Same benchmark circuits can run in distributed mode and centralized baseline mode.
2. Runs output comparable metrics: compile time, execution latency, success rate, estimated final fidelity.
3. Harness supports controlled fault injection (latency spike, node drop, fidelity degradation).

### FR-014 Security Baseline (POC)

System must provide minimum protections suitable for POC deployment.

Acceptance criteria:
1. API supports optional key-based auth.
2. API supports configurable rate limiting.
3. Inputs are size-limited and schema-validated before processing.

## 6. Non-Functional Requirements

### NFR-001 Correctness and Determinism

Given identical topology and inputs (including seeded randomness), planner output must be reproducible.

### NFR-002 Reliability

Under transient failures, runtime should recover automatically for at least one fallback attempt when feasible.

### NFR-003 Performance Targets (POC)

For benchmark circuits up to 50 operations and <= 10 service nodes:
1. P95 compile latency <= 2s on developer hardware.
2. P95 orchestration overhead per remote fragment <= 300ms (excluding simulated quantum operation duration).

### NFR-004 Test Quality

1. Unit + integration tests required for core modules.
2. Property tests required for critical protocol/state invariants.
3. Minimum 80% coverage on coordinator core packages.

### NFR-005 Documentation Quality

Design decisions, protocol contracts, and runbooks must be documented and cross-referenced with requirement IDs.

## 7. Definition of Done (POC)

The POC is complete when all are true:
1. FR-001 through FR-014 are implemented and tested.
2. NFR targets are measured and reported.
3. Experiment harness produces a reproducible comparison report against centralized baseline.
4. Documentation includes architecture, API contract, protocol contract, and execution walkthrough.
