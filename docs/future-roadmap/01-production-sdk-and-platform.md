# Milestone 1: Production SDK and Platform

Back to [Future Roadmap](../FUTURE_ROADMAP.md)

Next: [Milestone 2: Bring Your Own Node Network](02-bring-your-own-node-network.md)

## Mission

Turn the current proof of concept into a real platform that external developers, operators, and organizations can use without needing to understand the internals of the research prototype.

This milestone is where the project stops being "an interesting distributed systems demo" and starts becoming "a platform people can build on."

## End State

At the end of this milestone, the project should feel like a cohesive product with:

- stable public APIs
- official SDKs
- production-grade backend deployment patterns
- a coherent frontend platform console
- user, org, project, and permission models
- durable observability, auditing, and operations flows
- packaging, documentation, and release discipline

## What This Milestone Changes

Today, the system is primarily an orchestration proof of concept.

After this milestone, it becomes:

- a developer platform
- an operator platform
- a deployable service
- a foundation for everything that follows

## Primary Personas

### Developer

Needs a stable SDK, good docs, typed APIs, examples, and predictable behavior.

### Platform operator

Needs deployment tooling, dashboards, monitoring, access control, and failure visibility.

### Team administrator

Needs user management, projects, access boundaries, audit logs, and billing or quota hooks.

### Research engineer

Needs reproducible job submission, workflow definitions, artifact capture, and debuggable results.

## Capability Pillars

| Pillar | Why it matters | Major outputs |
| --- | --- | --- |
| SDK layer | makes the platform usable by developers | Python SDK, TypeScript SDK, CLI, examples, generated types |
| platform backend | creates stable contracts and lifecycle management | versioned API, auth, projects, workflows, artifacts, quotas |
| operator frontend | makes the system navigable and operable | platform console, job explorer, node explorer, audit views |
| data and artifact plane | makes results durable and usable | job history, artifacts, datasets, logs, metrics, lineage |
| trust and security | makes the platform safe enough to expose | authn, authz, secrets, audit, signed requests, tenancy boundaries |
| production operations | makes the platform deployable | CI/CD, environments, migration process, backups, incident workflows |

## Detailed Feature Plan

## 1. SDK Layer

### Python SDK

The Python SDK should support:

- authentication and session configuration
- circuit and workflow submission
- job polling and websocket streaming
- artifact upload and download
- experiment execution helpers
- strongly typed responses and errors
- idempotent request helpers
- retries, timeouts, and trace context propagation
- notebook-friendly ergonomics

### TypeScript SDK

The TypeScript SDK should support:

- browser-safe API access patterns where appropriate
- server-side platform automation
- typed workflow submission
- streaming job events
- artifact operations
- admin and organization management surfaces
- UI-ready types that match frontend needs directly

### CLI

The CLI should support:

- login and profile selection
- project creation and switching
- workflow submission from files
- job inspection
- plan inspection
- node and service inspection
- artifact sync
- experiment launches
- incident-friendly export commands

### Developer experience requirements

The SDK layer should also include:

- official examples
- quickstarts
- local emulator or dev mode
- semantic versioning
- deprecation policy
- changelog discipline
- generated API references

## 2. Platform Backend

### API evolution

The backend should expand from raw orchestration endpoints into a platform API with:

- versioned REST endpoints
- websocket or event-stream channels
- stable error contract
- idempotency keys
- pagination and filtering
- correlation IDs
- organization and project scoping

### Identity and access

Required additions:

- users
- organizations
- projects
- API keys
- service accounts
- role-based access control
- audit logs for sensitive actions

### Workflow model

The current job model should evolve into a richer workflow model with:

- workflow definitions
- workflow runs
- reusable templates
- parameter sets
- environment profiles
- execution policies
- retention policies

### Artifact model

The platform needs a first-class artifact layer for:

- result bundles
- execution traces
- plan snapshots
- logs
- circuit source
- serialized model inputs and outputs
- scientific artifacts added later in M3

### Tenancy and quotas

The backend should support:

- project-level resource quotas
- rate limits per org or API key
- job retention windows
- artifact storage quotas
- execution concurrency limits
- node usage policy hooks for later milestones

## 3. Frontend Platform Console

The frontend should evolve from a demo dashboard into a platform console with clear areas:

### Workspace shell

- account switcher
- organization switcher
- project navigation
- environment selector
- notifications
- quick actions

### Job and workflow surfaces

- job list with filters
- workflow template library
- run detail page
- live execution timeline
- fragment and plan explorer
- artifact and result viewer
- failure triage surface

### Node and service surfaces

- service catalog
- node health pages
- service availability heatmaps
- fidelity and quality trend views
- reservation conflict views
- topology explorer

### Admin surfaces

- user management
- API key management
- project settings
- audit log viewer
- quota dashboard
- policy management

### Research-friendly UX

Even in M1, the console should begin supporting:

- saved sample workflows
- run comparison
- export for notebooks or reports
- shareable run pages

## 4. Data Plane Upgrades

The platform backend should stop thinking only in terms of "jobs and SQLite rows" and start thinking in terms of durable platform state.

### Data stores and persistence improvements

This milestone should decide and implement:

- the durable metadata store
- artifact/object storage
- retention and archival behavior
- migration discipline
- backup and restore workflows
- environment-specific database topology

### Recommended durable entities

By the end of M1, the platform should persist:

- organizations
- users
- projects
- workflows
- workflow runs
- execution plans or plan snapshots
- artifacts
- audit records
- node identities
- service histories

### Observability data

The platform should also emit and retain:

- structured logs
- platform metrics
- queue depth
- compile latency
- orchestration latency
- retry counts
- failure reason distributions
- node health summaries

## 5. Security And Trust Baseline

Security in this milestone does not need to solve every later decentralized problem, but it must stop being demo-only.

### Required controls

- robust authn
- role-based authz
- request signing where appropriate
- secret management
- key rotation workflows
- input validation hardening
- package and dependency scanning
- audit trail for admin and destructive operations

### Platform trust groundwork for later milestones

This milestone should also define:

- the canonical node identity format
- service identity and signing model
- trust boundaries between users, projects, and nodes
- policy model for allowed workloads and execution classes

## 6. Production Operations

### Deployment

The platform needs:

- containerized deployment
- environment configs for local, staging, and production
- reproducible migrations
- release pipeline
- rollback playbooks

### Reliability operations

- health checks
- readiness and liveness behavior
- incident runbooks
- alerting baselines
- backup verification
- recovery drills

### Developer platform operations

- preview environments for major changes
- smoke tests after deployment
- API contract tests
- SDK compatibility tests

## 7. Documentation Package

M1 is also the milestone where documentation becomes a product asset.

Required docs:

- getting started guides
- SDK docs
- API reference
- operator runbook
- admin guide
- troubleshooting guide
- architecture update for the production platform shape

## Architecture Changes Required

This milestone likely forces the system to adopt:

- stronger API versioning discipline
- a richer domain model than the current job-centric one
- durable plan persistence rather than in-memory only plan inspection
- a clearer separation between public platform APIs and internal orchestration modules
- a formal artifact store
- more explicit service boundaries inside the backend

## Delivery Phases Inside Milestone 1

### M1-A Contract hardening

- version API surfaces
- freeze canonical request and response models
- define SDK-generation strategy
- define platform entity model

### M1-B Developer platform

- ship Python SDK
- ship TypeScript SDK
- ship CLI
- publish examples and local dev workflow

### M1-C Operator platform

- build platform console
- add admin and audit views
- add workflow and run management surfaces

### M1-D Production hardening

- environment and deployment model
- observability stack
- backup and restore
- migration and rollback discipline

### M1-E Commercial and team readiness

- orgs and projects
- quotas
- API keys
- permissions
- usage accounting hooks

## Success Metrics

This milestone is successful when:

- external developers can build against the SDK without reading core backend code
- the frontend feels like a product console, not a lab-only demo
- platform deployments are reproducible
- key operational failures are visible and diagnosable
- job, plan, artifact, and audit history are durable
- user and project boundaries are enforceable

## Exit Criteria

Do not declare M1 complete until all are true:

1. the backend exposes stable platform APIs
2. at least one official SDK is mature and pleasant to use
3. the frontend supports real operator workflows
4. plans and artifacts are durably inspectable
5. security and audit controls are good enough for external users
6. deploy, upgrade, and rollback procedures are documented and tested

## What M1 Unlocks

M1 unlocks everything else.

In particular:

- M2 depends on M1 trust, identity, packaging, and operator controls
- M3 depends on M1 workflow, artifact, and provenance foundations
- M4 depends on M1 service packaging and API contracts
- M5 depends on M1 control plane discipline and observability

