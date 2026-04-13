# Milestone 3: Autonomous Research and Drug Discovery Platform

Back to [Future Roadmap](../FUTURE_ROADMAP.md)

Previous: [Milestone 2: Bring Your Own Node Network](02-bring-your-own-node-network.md)

Next: [Milestone 4: Torrent-Native Service Network](04-torrent-native-service-network.md)

## Mission

Turn the platform into a serious scientific execution and discovery system that can power labs, simulations, and drug discovery workflows directly.

This is the milestone where the platform stops being only infrastructure and starts becoming a scientific engine in its own right.

## End State

At the end of this milestone, the platform should be able to:

- orchestrate end-to-end scientific workflows instead of isolated jobs
- support drug discovery pipelines as first-class product capabilities
- support financial modelling and business valuation workflows for S&P 500 companies
- run simulation-heavy and data-heavy research workflows
- preserve provenance and reproducibility for every run
- provide collaboration surfaces for researchers, teams, and labs
- create outputs that can be reviewed, compared, exported, and reused

## What This Milestone Means

This milestone is intentionally ambitious.

The platform should not only "help researchers run code."

It should begin to perform the actual work of:

- target discovery support
- molecular candidate generation
- screening and ranking
- business valuation and financial model evaluation
- simulation orchestration
- optimization loops
- scientific report generation
- experimental planning support

## Research Domains To Support

| Domain | Example workloads | Expected outputs |
| --- | --- | --- |
| drug discovery | molecular generation, docking, scoring, hit triage, multi-stage ranking | candidate lists, ranked compounds, supporting evidence |
| financial modelling | DCF pipelines, comparable-company analysis, factor analysis, scenario modelling, earnings sensitivity analysis | valuation ranges, model outputs, scenario reports, investment memos |
| computational chemistry | quantum chemistry workflows, conformer generation, property estimation | energy surfaces, structure analyses, property reports |
| simulations | distributed simulation pipelines, parameter sweeps, sensitivity analyses | run matrices, validated summaries, comparison reports |
| lab operations | experiment planning, sample tracking, protocol execution support | reproducible experimental records and handoff packages |
| academic research | benchmark studies, collaborative experiments, reproducible result bundles | publishable artifacts and experiment traceability |

## Capability Pillars

| Pillar | Why it matters | Major outputs |
| --- | --- | --- |
| scientific workflow engine | research is multi-stage, not single-task | workflow graphs, chained runs, checkpoints, branching |
| domain service catalog | discovery needs specialized capabilities | docking services, simulation services, ranking services, inference services |
| provenance graph | scientific trust requires lineage | dataset lineage, model lineage, run lineage, report lineage |
| discovery intelligence layer | the platform should reason, not only schedule | ranking loops, adaptive experimentation, hypothesis scoring |
| research collaboration UX | labs need shared context | projects, notebooks, comparisons, review flows, reports |
| safety and validation layer | discovery claims must be defensible | validation suites, benchmark sets, human review, policy gates |

## Detailed Feature Plan

## 1. Scientific Workflow Engine

The orchestration system should evolve into a workflow engine capable of:

- multi-stage workflows
- branching and conditional execution
- checkpointing
- resumable experiments
- parameter sweeps
- optimization loops
- human approval gates
- hybrid compute plans across peer nodes and managed infrastructure

### Workflow examples

The platform should eventually support workflows such as:

1. ingest target and assay data
2. generate candidate molecules
3. filter by constraints
4. run docking or scoring services
5. run follow-up simulations for top candidates
6. rank based on combined evidence
7. generate a lab-ready report and candidate package

### Example financial modelling loop

The platform should also eventually support workflows such as:

1. ingest SEC filings, earnings calls, and structured market data
2. normalize financial statements across a chosen S&P 500 company or peer basket
3. build or update DCF, comps, and scenario models
4. run assumption sweeps on revenue growth, margins, discount rates, and terminal values
5. compare outputs against historical ranges and peer sets
6. generate valuation ranges with assumption provenance
7. produce an investment or research memo with machine-readable model artifacts

## 2. Domain Service Catalog

The platform needs a structured catalog of scientific service types.

### Drug discovery service classes

Potential first-class services include:

- target intelligence and literature extraction
- molecular generation
- synthetic feasibility estimation
- ADMET estimation
- docking and rescoring
- molecular dynamics orchestration
- property prediction
- candidate ranking and prioritization
- active learning and Bayesian optimization loops

### Financial modelling service classes

Potential first-class services include:

- filing ingestion and statement normalization
- company-specific KPI extraction
- DCF model construction
- comparable-company and precedent-transaction analysis
- scenario and sensitivity analysis
- capital structure modelling
- factor and risk decomposition
- macro overlay and forecast adjustment
- valuation narrative generation and memo drafting

### Simulation and science service classes

- parameter sweep orchestration
- PDE and numerical simulation workers
- distributed optimization services
- surrogate model training
- uncertainty estimation
- experiment comparison and sensitivity analysis

### Lab-facing service classes

- protocol planning
- sample metadata validation
- experiment run registration
- instrument data ingestion later
- report packaging and export

## 3. Provenance And Scientific Memory

This platform cannot seriously claim research value without scientific memory.

Every meaningful object should be connected in a provenance graph:

- dataset versions
- model versions
- workflow definitions
- workflow runs
- intermediate artifacts
- ranking decisions
- human approvals
- final reports

### Why this matters

For drug discovery and scientific work, teams must be able to answer:

- which dataset produced this candidate?
- which model version generated this score?
- which simulation settings produced this result?
- which node or service executed each stage?
- who approved the transition to the next stage?

For financial modelling work, teams must also be able to answer:

- which filing set or market data snapshot was used?
- which assumptions drove this valuation range?
- which model version generated this recommendation?
- which peer set or benchmark universe was selected?
- which scenario package produced this downside and upside case?

## 4. Discovery Intelligence Layer

This is where the platform itself starts "doing discovery."

The intelligence layer should support:

- candidate generation loops
- iterative screening
- score aggregation across heterogeneous services
- scenario generation and assumption stress testing
- adaptive re-routing to better models or simulations
- experiment suggestion
- hypothesis ranking
- multi-objective optimization

### Example drug discovery loop

1. generate candidate set
2. filter for drug-likeness and safety constraints
3. rank by model-based affinity estimates
4. send top set to deeper simulation services
5. compare results with historical outcomes
6. propose next candidate generation prompt or search region
7. produce a narrowed list for lab validation

This is not just job scheduling. It is an iterative discovery system.

### Example financial decision loop

1. ingest fresh company and peer data
2. update valuation models automatically
3. stress assumptions across bull, base, and bear scenarios
4. compare model outputs against historical and sector benchmarks
5. surface the assumptions with highest impact on valuation
6. recommend deeper review on companies with the most asymmetric outcome profiles
7. generate a new memo or updated watchlist package

## 5. Research Collaboration Product

The frontend should expand into a research workspace with:

- shared projects
- experiment boards
- run comparisons
- report pages
- candidate review queues
- evidence explorer
- lineage graph viewer
- export packages for collaborators

### Research team roles

The platform should understand roles such as:

- principal investigator
- platform operator
- research engineer
- computational scientist
- reviewer
- wet-lab collaborator

## 6. Drug Discovery Product Surface

If the platform itself is meant to do drug discovery, it needs explicit product modules for that domain.

### Core drug discovery modules

- target program setup
- compound library ingestion
- molecular generation workspace
- screening funnel designer
- candidate review board
- simulation escalation queue
- evidence-backed ranking page
- handoff package for experimental validation

### Handoff outputs

The platform should be able to produce:

- ranked candidate portfolio
- supporting simulation and scoring evidence
- reproducibility package
- workflow lineage bundle
- machine-readable export for downstream lab systems

## 6A. Financial Modelling Product Surface

If the platform is also meant to do financial modelling directly, it needs explicit product modules for that domain as well.

### Core financial modelling modules

- S&P 500 company universe explorer
- filing and market-data ingestion workspace
- valuation model builder
- assumption library and scenario manager
- comparable-company analysis board
- earnings and event-impact workspace
- sensitivity heatmap and downside-risk page
- memo and investment-thesis generator

### Financial modelling outputs

The platform should be able to produce:

- company valuation ranges
- base, bull, and bear case outputs
- assumption audit trail
- sensitivity matrices
- comparable-company benchmark packs
- machine-readable financial model artifacts
- analyst-ready or executive-ready memo bundles

## 7. Dataset, Model, And Artifact Platform

This milestone requires a real scientific data layer.

### Dataset capabilities

- versioned datasets
- access controls
- dataset lineage
- schema validation
- data quality checks
- dataset snapshots used per run

### Model capabilities

- model registry
- versioning
- evaluation history
- serving compatibility metadata
- rollback and promotion flows

### Artifact capabilities

- candidate sets
- docking result bundles
- simulation trajectories or summaries
- valuation models and scenario packs
- comparison reports
- publishable evidence packages

## 8. Validation, Safety, And Scientific Integrity

If the platform performs discovery workflows directly, it must include safeguards.

### Required integrity features

- benchmark suites for core scientific services
- validation datasets
- confidence scoring
- uncertainty-aware outputs
- human review gates for important decisions
- provenance-preserving exports

### Policy features

- domain-specific safety policies
- restricted workflow classes where needed
- approval requirements for high-impact runs
- data governance and access boundaries

## 9. Lab And External System Connectivity

The platform should not remain a closed island.

Later in M3, it should integrate with:

- notebook environments
- ELN and LIMS systems where relevant
- dataset repositories
- external model registries
- market-data providers and SEC filing pipelines
- simulation backends
- collaboration tools and reporting systems

## Delivery Phases Inside Milestone 3

### M3-A Scientific workflow foundation

- multi-stage workflow engine
- dataset and model registry basics
- provenance graph foundation

### M3-B Simulation and analysis platform

- simulation service types
- financial model service types
- experiment comparison
- lineage-aware reporting

### M3-C Drug discovery core

- molecule generation and screening flows
- ranking and evidence aggregation
- candidate review experience

### M3-D Financial modelling core

- DCF and comps workflows
- assumption and scenario management
- valuation and sensitivity reporting

### M3-E Discovery loops and optimization

- adaptive workflow logic
- iterative screening
- valuation stress testing and scenario search
- multi-objective optimization
- active learning style loops

### M3-F Research collaboration and publication

- collaboration surfaces
- report packages
- reproducibility bundles
- review and approval workflows

## Success Metrics

This milestone is successful when:

- the platform can run full scientific workflows instead of isolated service invocations
- researchers can trace every important result to data, models, and execution lineage
- drug discovery workflows generate ranked candidates with supporting evidence
- financial modelling workflows generate valuation ranges with assumption-level provenance
- teams can compare experiments and export reproducible result bundles
- the product meaningfully reduces time from idea to research output

## Exit Criteria

Do not declare M3 complete until all are true:

1. the platform can express and run complex scientific workflows
2. provenance is strong enough to audit discovery outcomes
3. at least one drug discovery workflow exists as a first-class product flow
4. at least one financial modelling workflow exists as a first-class product flow
5. simulation, valuation, and ranking outputs are reviewable and exportable
6. research teams can collaborate through the product, not only through raw APIs

## What M3 Unlocks

M3 gives the network its strongest reason to exist.

It unlocks:

- high-value scientific demand for peer and swarm infrastructure
- model and dataset distribution needs that justify M4
- market and financial data distribution needs that justify M4
- a criticality level where Hydra-style resilience in M5 becomes necessary
