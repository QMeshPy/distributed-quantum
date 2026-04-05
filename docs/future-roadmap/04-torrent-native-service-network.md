# Milestone 4: Torrent-Native Service Network

Back to [Future Roadmap](../FUTURE_ROADMAP.md)

Previous: [Milestone 3: Autonomous Research and Drug Discovery Platform](03-autonomous-research-and-drug-discovery-platform.md)

Next: [Milestone 5: Hydra Self-Healing Network](05-hydra-self-healing-network.md)

## Mission

Extend the network beyond direct request routing so it can distribute services, execution packages, models, datasets, and artifacts in a torrent-inspired swarm.

The key idea is simple:

the network should not only share files and not only share compute.

It should share **services**.

## What This Milestone Means

This milestone does not mean "bolt a BitTorrent client onto the side."

It means the project grows a swarm-native distribution layer for:

- service packages
- model weights
- datasets
- execution bundles
- artifact replicas
- updates and cached scientific assets

## End State

At the end of this milestone:

- services can be packaged, signed, published, replicated, and fetched through the network
- large scientific assets can be distributed peer-to-peer instead of only through central storage
- nodes can seed useful services and artifacts for others
- service discovery can include both capability lookup and swarm availability
- the platform can use peer-assisted distribution to scale faster and cheaper

## Capability Pillars

| Pillar | Why it matters | Major outputs |
| --- | --- | --- |
| service package format | service sharing needs a portable unit | signed service manifests, runtime bundle format, compatibility metadata |
| swarm distribution | central artifact delivery will not scale forever | peer-assisted download, chunking, seeding, replication |
| decentralized indexing | services need discoverable addresses | service URIs, content IDs, manifests, DHT or index integration |
| integrity and trust | service sharing must remain safe | signatures, package verification, policy checks, malware and policy scanning |
| swarm-aware scheduling | planner should care about where artifacts already live | locality-aware planning, cache-aware routing, replication hints |

## Detailed Feature Plan

## 1. Service Package Format

The platform needs a canonical service package definition that includes:

- service identity
- version
- owner
- runtime type
- capability declaration
- resource requirements
- dependency manifest
- integrity signature
- compatibility metadata
- execution policy metadata

### Service package examples

A package may represent:

- a molecule scoring service
- a docking runtime bundle
- a simulation worker image
- a ranking model bundle
- a scientific helper toolchain

## 2. Swarm Distribution Of Packages And Artifacts

The distribution layer should support:

- chunked transfer
- parallel fetch from multiple peers
- background seeding
- local caching
- prioritized replication
- resumable downloads
- partial availability awareness

### Assets that should become swarm-distributable

- service bundles
- model weights
- datasets and dataset shards
- workflow templates
- run artifact bundles
- large result packages

## 3. Addressing And Discovery

The platform needs a new addressing model for swarm-native assets.

### Addressable entities

- service packages
- artifacts
- model versions
- dataset versions
- composite workflow bundles

### Addressing goals

- content-addressed when possible
- version-aware
- human-referenceable when needed
- resolvable from platform APIs and peer network paths

This can eventually evolve into magnet-like service references, but the important thing is that a service becomes a portable, discoverable network object.

## 4. Hybrid Discovery Model

The system should likely use a hybrid model rather than pure centralization or pure swarm logic.

### Control-plane responsibilities

- service policy
- trust and permissions
- package approval
- ownership metadata
- visibility controls

### Swarm responsibilities

- package replication
- chunk exchange
- local caching
- seeding
- peer-assisted transfer

This lets the platform stay trustworthy while still gaining the benefits of swarm distribution.

## 5. Swarm-Aware Scheduling

Once services and artifacts are distributed across peers, scheduling should change.

The planner should consider:

- where the needed package already exists
- where model or dataset shards already live
- whether a node can fetch what it needs quickly
- which peers are reliable seeders
- whether replication should happen before execution

This is where the swarm layer becomes an execution advantage, not just a networking novelty.

## 6. Peer Replication And Caching Policies

The platform should define policies for:

- hot service replication
- model caching on capable peers
- dataset sharding
- eviction and storage pressure
- priority pinning for critical assets
- regional or project-local replication rules

## 7. Publish And Install Workflow

For developers and operators, the swarm layer should feel like a product feature.

### Expected experience

1. publish service package
2. sign and register package
3. platform validates policy and compatibility
4. network begins replication
5. nodes fetch package as needed or prefetch based on policy
6. operators can inspect availability and seed health

## 8. Integrity, Safety, And Policy

Service sharing is only valuable if it is safe.

The platform should enforce:

- signed packages
- dependency verification
- allow and deny policies
- compatibility checks before execution
- provenance of who published and who seeded
- quarantine of suspicious packages

## 9. Economic And Resource Controls

Even if token models are deferred, the platform still needs controls for:

- storage consumption
- replication budgets
- bandwidth budgets
- package priority
- per-project distribution rules

This matters especially for very large scientific assets.

## 10. User And Operator Experience

The frontend should gain:

- service package registry
- package version pages
- availability and seeding views
- swarm health views
- dataset distribution views
- replication policy controls
- artifact pin and unpin actions

## Delivery Phases Inside Milestone 4

### M4-A Package foundation

- canonical service package format
- signing and verification
- publish and install workflow

### M4-B Peer-assisted artifact distribution

- chunked transfer
- resumable downloads
- caching and seeding

### M4-C Swarm indexing and discovery

- decentralized service and artifact lookup
- availability-aware discovery

### M4-D Scheduler integration

- package locality awareness
- replication-aware planning
- cache-aware routing

### M4-E Platform registry and operator controls

- package registry UI
- swarm health views
- policy controls

## Success Metrics

This milestone is successful when:

- large assets can be distributed through peers efficiently
- service packages are portable and verifiable
- scheduler performance improves from locality awareness
- operators can understand swarm availability and integrity
- the swarm layer reduces reliance on central delivery paths

## Exit Criteria

Do not declare M4 complete until all are true:

1. service packages have a stable portable format
2. packages and artifacts can be replicated peer-to-peer
3. integrity checks are strong and enforceable
4. swarm availability is visible to the platform and scheduler
5. the swarm layer measurably improves service and artifact distribution

## What M4 Unlocks

M4 unlocks:

- a large-scale service-sharing network
- efficient distribution of scientific assets
- the replication substrate needed for Hydra behavior in M5

