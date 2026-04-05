# Milestone 2: Bring Your Own Node Network

Back to [Future Roadmap](../FUTURE_ROADMAP.md)

Previous: [Milestone 1: Production SDK and Platform](01-production-sdk-and-platform.md)

Next: [Milestone 3: Autonomous Research and Drug Discovery Platform](03-autonomous-research-and-drug-discovery-platform.md)

## Mission

Allow users to turn their own laptop, phone, workstation, lab machine, edge box, or specialized device into a trusted peer in the network.

This milestone is where the system becomes a true participant network rather than a coordinator plus a small set of embedded or centrally managed service nodes.

## End State

At the end of this milestone:

- adding a device as a node should be simple
- the platform should understand heterogeneous device capability
- the scheduler should know which workloads belong on which device classes
- nodes should be able to join, leave, sleep, recover, and rejoin safely
- trust and reputation should exist for peer-contributed capacity
- the frontend should include node onboarding, node health, and node ownership views

## What This Milestone Changes

Before M2, the platform is mostly centrally shaped.

After M2, it becomes:

- a peer network
- a contributed compute fabric
- a device-aware scheduler
- a foundation for a much larger distributed execution graph

## Supported Device Classes

| Device class | Example | Why it matters | Special constraints |
| --- | --- | --- | --- |
| laptops and desktops | MacBook, Linux laptop, Windows workstation | easiest contributor path | sleep, battery, changing networks |
| phones and tablets | Android and iOS devices | massive potential peer base | battery, mobile permissions, thermal limits |
| home lab and edge machines | Raspberry Pi, NUC, Jetson, mini-PC | always-on edge compute | smaller resources, network variability |
| lab workstations | GPU boxes, simulation nodes | higher-value scientific compute | trust, policy, scheduling priority |
| specialized devices | domain appliances and future lab hardware | domain-specific services | strict capability contracts |

## Capability Pillars

| Pillar | Why it matters | Major outputs |
| --- | --- | --- |
| node agent runtime | every user-contributed peer needs a standard runtime | desktop agent, mobile agent, headless node agent |
| peer identity | the network must know who and what a node is | node certificates, device profiles, ownership model |
| local benchmarking | scheduler quality depends on accurate capability information | startup benchmark suite, capability attestations, health probes |
| execution sandbox | contributed devices cannot run arbitrary code unsafely | constrained runtime, permission model, package isolation |
| connectivity and rejoin | consumer devices are unstable by nature | heartbeat, suspend/resume behavior, reconnect logic |
| trust and reputation | the network needs to know which peers are reliable | reliability score, quality score, policy score |
| node UX | participation must be easy for humans | onboarding flow, node dashboard, local controls |

## Detailed Feature Plan

## 1. Node Agent Runtime

The platform should ship an official node agent that can run in multiple forms:

- desktop application
- headless server daemon
- mobile node app
- containerized node runtime for self-hosted environments

The node agent should handle:

- enrollment
- secure identity bootstrap
- capability registration
- local benchmark execution
- heartbeat and health updates
- package download and execution
- result upload
- controlled shutdown
- resume after interruption

## 2. Device Enrollment And Identity

### Enrollment flow

The onboarding experience should look like:

1. user signs in
2. user chooses project or personal network scope
3. user installs or launches node agent
4. agent performs secure enrollment
5. platform issues node identity and policy bundle
6. device runs capability and health checks
7. device appears in the platform console as an available or pending node

### Identity model

Every node should have:

- node ID
- owner
- organization or project association
- device class
- trust level
- capabilities
- health profile
- execution policy profile

## 3. Local Benchmarking And Capability Discovery

The scheduler cannot treat all peers as equal.

Each node should report structured capability information such as:

- CPU characteristics
- memory profile
- GPU availability
- network latency baselines
- battery state where relevant
- storage profile
- thermal constraints
- supported runtime types
- supported service classes

Benchmarking should happen:

- at initial enrollment
- after major software updates
- on a periodic schedule
- when users explicitly rerun diagnostics

## 4. Execution Sandbox And Safety

This is one of the most important parts of M2.

Contributed nodes should not run arbitrary remote code without protection.

### Required sandboxing capabilities

- signed workload packages
- explicit runtime classes
- permission-scoped execution
- resource limits
- timeouts
- isolation boundaries
- execution logs
- policy enforcement before run

### Possible runtime classes

- safe built-in service handlers
- WASM-like portable modules
- containers for trusted environments
- mobile-safe constrained task bundles

The exact runtime choices can evolve, but the security model must be explicit from the start.

## 5. Connectivity, Heartbeat, And Rejoin

Consumer devices are not stable servers.

The platform needs to normalize that reality.

### Node lifecycle states

A useful model may include:

- `ENROLLING`
- `READY`
- `BUSY`
- `IDLE`
- `SLEEPING`
- `DEGRADED`
- `DISCONNECTED`
- `QUARANTINED`
- `REJOINING`

### Required behaviors

- heartbeat at configurable intervals
- graceful drain before sleep or shutdown when possible
- stale detection
- resume after app restart
- replay of missed state after reconnect
- job handoff or failure recovery when node disappears

## 6. Trust, Reputation, And Governance

An open node network requires a clear trust model.

### Reputation dimensions

Every node should accumulate platform-visible scores for:

- uptime reliability
- execution success rate
- fidelity or result quality where applicable
- response latency
- policy compliance
- artifact integrity

### Governance controls

The platform needs controls for:

- approved versus unapproved nodes
- private project-only nodes
- public marketplace-eligible nodes later
- quarantine or block actions
- suspicious activity review
- manual and automated trust downgrades

## 7. Scheduler Evolution

The scheduler in M2 must become device-aware.

It should factor in:

- device class
- current load
- energy constraints
- network quality
- owner policy
- trust level
- workload type compatibility
- expected interruption risk

This is where planning starts shifting from "which node supports this service" to "which node should receive this work right now under real-world device constraints."

## 8. Node User Experience

If contributing a device is annoying, the network will not grow.

### Required node-owner experiences

- simple install flow
- readable local health panel
- clear statement of what the node is sharing
- start, pause, resume, stop controls
- device resource limit controls
- network usage controls
- execution history
- trust and reputation visibility
- update and maintenance flow

### Frontend additions

The platform console should add:

- "Add node" flow
- owned node inventory
- node health details
- policy and permissions page for nodes
- per-node workload history
- join token or invite flows

## 9. Mobile-Specific Strategy

Mobile support is not just "run the desktop agent on a phone."

It needs its own design.

### Mobile node constraints

- battery protection
- background execution limits
- thermal management
- metered network awareness
- safe permission model
- lightweight service classes

### Mobile-friendly workloads

The first mobile node services may be:

- light inference tasks
- small coordination tasks
- metadata services
- checkpoint relay
- low-intensity discovery participation

Heavier execution should wait until the platform learns the operating envelope.

## 10. Anti-Abuse And Safety Controls

An open peer network becomes risky fast without strong controls.

The platform needs:

- signed workload packages
- node attestation where possible
- behavioral anomaly detection
- rate-limited onboarding
- quarantine pipeline
- secure update channel
- revocation for compromised nodes

## Delivery Phases Inside Milestone 2

### M2-A Private trusted nodes

- desktop and server node agents
- project-owned nodes
- controlled enrollment
- baseline health and heartbeat model

### M2-B Heterogeneous device scheduling

- capability benchmark suite
- device-class-aware planner inputs
- resource-aware scheduling
- pause, sleep, and reconnect behavior

### M2-C Mobile and edge expansion

- mobile node app
- edge-focused lightweight runtime
- battery and thermal policies

### M2-D Trust and reputation

- reliability score
- policy score
- node quarantine
- node review workflows

### M2-E Self-service onboarding

- one-click or low-friction node joining
- owner-facing controls
- admin review and governance surfaces

## Success Metrics

This milestone is successful when:

- users can add new nodes without platform-engineering help
- the platform reliably distinguishes strong and weak nodes
- the scheduler reduces avoidable work assignment to unstable devices
- nodes can disconnect and rejoin without causing widespread corruption
- trust and governance workflows are usable by operators

## Exit Criteria

Do not declare M2 complete until all are true:

1. a supported node agent exists for at least desktop and headless environments
2. node enrollment is secure and understandable
3. the scheduler accounts for heterogeneous device quality
4. node owners can inspect and control their participation
5. nodes can sleep, drop, and return safely
6. trust and quarantine mechanisms exist

## What M2 Unlocks

M2 unlocks:

- a truly open execution fabric for M3
- much richer workload capacity for scientific discovery
- a real peer base for M4 swarm distribution
- the raw network diversity needed for M5 self-healing behavior

