# Program Sequencing and Dependency Plan

Back to [Future Roadmap](../FUTURE_ROADMAP.md)

## Purpose

This document explains how the five major milestones fit together, what must be built first, what can run in parallel, and what should not be attempted too early.

The main goal is to prevent the roadmap from turning into five disconnected wish lists.

## The Recommended Order

The program should move in this order:

1. Production SDK and Platform
2. Bring Your Own Node Network
3. Autonomous Research and Drug Discovery Platform
4. Torrent-Native Service Network
5. Hydra Self-Healing Network

This is the most defensible order because:

- M1 creates the APIs, contracts, trust model, and operator workflows
- M2 turns the platform into a real heterogeneous network
- M3 gives the network a commercially and scientifically important purpose
- M4 upgrades distribution and replication across that network
- M5 turns the distributed system into a resilient organism instead of a brittle mesh

## Program-Level Dependency Matrix

| Capability | First appears in | Depends on | Reused by |
| --- | --- | --- | --- |
| versioned APIs and SDK contracts | M1 | current POC stabilization | M2, M3, M4, M5 |
| auth, orgs, permissions, auditability | M1 | stable platform backend | M2, M3, M5 |
| workflow definitions and job metadata model | M1 | stable orchestration API | M3, M5 |
| operator dashboard and admin console | M1 | platform backend and observability | M2, M3, M5 |
| node enrollment and peer identity | M2 | M1 trust and API foundation | M3, M4, M5 |
| execution sandbox and device capability benchmark | M2 | M1 packaging and runtime contracts | M3, M4, M5 |
| peer heartbeat, trust, and reputation | M2 | M1 data model and observability | M3, M4, M5 |
| scientific workflow engine | M3 | M1 workflow contracts, M2 peer network | M4, M5 |
| domain service catalog for discovery workloads | M3 | M1 platform, M2 peer execution | M4, M5 |
| dataset, model, and experiment provenance graph | M3 | M1 data plane | M4, M5 |
| service packaging and swarm distribution | M4 | M2 peer network, M3 artifacts and models | M5 |
| decentralized indexing and replication | M4 | M2 peer identity and discovery | M5 |
| multi-coordinator replication and failover | M5 | M1 control plane, M2 network, M4 replication layer | final system |
| self-healing job recovery and topology repair | M5 | all previous milestones | final system |

## What Can Run In Parallel

Some workstreams can begin early even if the milestone is not yet complete.

### Workstreams that can start during M1

- node identity design for M2
- service/package format design for M4
- experiment provenance model for M3
- early chaos-testing philosophy for M5

### Workstreams that can start during M2

- scientific service taxonomy for M3
- artifact and model packaging design for M4
- peer trust and reputation scoring research for M5

### Workstreams that can start during M3

- swarm distribution of models and datasets for M4
- multi-site scientific collaboration and replication experiments for M5

## What Must Not Be Started Too Early

These are high-risk traps.

### Do not build multi-coordinator consensus too early

If the single-platform and single-network model are not yet stable, consensus will multiply confusion instead of removing it.

### Do not over-engineer token or incentive systems before network utility exists

The project first needs trusted participation, valuable workloads, and service demand. Economics can wait.

### Do not claim drug discovery capability without reproducibility and provenance

Scientific credibility depends on traceability, validation, and measurable workflow quality.

### Do not build a torrent extension before package integrity is strong

Service swarms are only useful if packages, artifacts, and datasets are signed, verifiable, and safe to execute.

## Cross-Milestone Platform Tracks

These tracks run across the whole roadmap.

### 1. Identity, trust, and governance

This begins in M1 and expands through M5.

It includes:

- user identity
- organization and project ownership
- node identity
- service signing
- package integrity
- policy enforcement
- reputation and trust scoring
- auditability

### 2. Execution substrate

This begins in the current POC and becomes much broader.

It includes:

- job orchestration
- workflow definitions
- node-side runtimes
- sandboxing
- checkpointing
- rehydration
- distributed scheduling
- execution lineage

### 3. Scientific data plane

This becomes essential in M3 and expands later.

It includes:

- datasets
- models
- experiment runs
- artifact lineage
- result validation
- provenance graphs
- scientific reports

### 4. Distribution layer

This starts as simple platform delivery, then becomes peer distribution and finally a swarm layer.

It includes:

- SDK release channels
- service package distribution
- dataset replication
- model weight distribution
- content-addressed artifacts
- decentralized indexes

### 5. Resilience layer

This begins with basic observability and ends with self-healing autonomy.

It includes:

- health checks
- retry and fallback
- peer heartbeat
- topology repair
- replicated control plane
- healing policies
- automated failure recovery

## Program Gates Between Milestones

The program should not move forward only because time passed.

Each milestone needs hard exit gates.

### Gate to leave M1

- SDKs are stable enough for external developers
- operators can deploy and observe the platform
- identity, auth, and audit basics exist
- backend and frontend feel like one coherent product

### Gate to leave M2

- non-expert users can add devices as nodes
- node identity and trust are good enough to avoid chaos
- the scheduler understands heterogeneous device capability
- nodes can disconnect and rejoin without corrupting orchestration state

### Gate to leave M3

- the platform can run complete scientific workflows, not just isolated tasks
- drug discovery and simulation flows have reproducible outputs
- provenance is strong enough for serious review
- the research UX is compelling for labs and applied teams

### Gate to leave M4

- service packages and artifacts are swarm-distributable
- decentralized discovery is stable
- replication and integrity guarantees are trustworthy
- peer-assisted distribution provides meaningful efficiency gains

### Gate to leave M5

- no single coordinator failure should collapse the platform
- job recovery is automatic for major failure classes
- node loss, service loss, and coordinator loss all have healing paths
- the system is measurably more resilient than the pre-Hydra architecture

## Suggested Program Phases

| Phase | Main objective | Primary milestones |
| --- | --- | --- |
| Phase A | make the current project externally usable | M1 |
| Phase B | open the network to real-world peer participation | M2 |
| Phase C | give the network scientific and commercial purpose | M3 |
| Phase D | scale distribution through swarm mechanics | M4 |
| Phase E | remove single points of failure and make the network regenerative | M5 |

## Strategic Risks Across The Full Program

### 1. Platform drift

If SDK, backend, and frontend evolve independently, the product becomes hard to trust.

### 2. Peer chaos

Opening the network too early without strong trust and sandboxing could create a brittle or unsafe node ecosystem.

### 3. Scientific overclaim

If the project markets research outcomes faster than it builds reproducibility, credibility will suffer.

### 4. Decentralization theater

Adding torrent or swarm language without real service and artifact advantages will make the architecture look ornamental.

### 5. Resilience complexity explosion

Hydra-like recovery is valuable only if it reduces operational risk rather than creating a hard-to-debug distributed maze.

## Decision Heuristics

When choosing between two roadmap options, prefer the one that:

- improves developer usability
- strengthens provenance and trust
- makes peer participation easier without weakening safety
- improves resilience in a measurable way
- advances real scientific workflows instead of surface polish alone

## Related Milestone Docs

- [Milestone 1: Production SDK and Platform](01-production-sdk-and-platform.md)
- [Milestone 2: Bring Your Own Node Network](02-bring-your-own-node-network.md)
- [Milestone 3: Autonomous Research and Drug Discovery Platform](03-autonomous-research-and-drug-discovery-platform.md)
- [Milestone 4: Torrent-Native Service Network](04-torrent-native-service-network.md)
- [Milestone 5: Hydra Self-Healing Network](05-hydra-self-healing-network.md)

