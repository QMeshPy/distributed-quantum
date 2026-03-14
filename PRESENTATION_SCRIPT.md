# Presentation Script

This file follows [`PRESENTATION_DECK.md`](PRESENTATION_DECK.md) in the exact same slide order.

Use it like this:

- keep [`PRESENTATION_DECK.md`](PRESENTATION_DECK.md) open in your presentation window
- keep this file open beside it while recording
- move one slide at a time and read the matching section below

## Slide 1: Presentation Deck

Hello, my name is [your name], and this presentation is about distributed quantum services.

The core idea is that quantum capabilities should not always be treated as one monolithic backend. Instead, they can be exposed as network-visible services and coordinated as a distributed systems problem.

This project focuses on orchestration, reliability, durable execution, and interpretable quantum results.

## Slide 2: The Problem

Most quantum software assumes one circuit, one backend, and one execution context.

That model is useful for algorithm development, but it is too narrow for future infrastructure. In practice, we should expect heterogeneous services, variable fidelity, uneven availability, and network-level coordination requirements.

So the question this project asks is: how should a system discover, plan, reserve, execute, and interpret distributed quantum capabilities instead of assuming one static backend?

## Slide 3: Project Thesis

This project is not primarily a local simulator.

It is a distributed quantum services coordinator.

A client submits an OpenQASM-like circuit. The coordinator discovers available services across a peer-to-peer coordination layer, normalizes and fragments the circuit, plans execution against a live registry, executes fragments with reservation, retry, and fallback, persists the full lifecycle, and finally returns detailed quantum analysis.

So the main contribution is not just execution. The contribution is orchestration.

## Slide 4: Layered Architecture

This diagram shows the system as a stack of layers.

At the top is the client layer. That represents the interfaces a researcher or application would use, such as tools, notebooks, or experiment pipelines.

Below that is the API layer. That is the ingestion surface for job submission, status retrieval, and streaming updates.

Below the API layer is the orchestration core. This is where the main decision-making happens: job lifecycle management, normalization, dependency analysis, planning, and runtime execution.

Below that is the coordination layer. This layer handles distributed discovery, advertisements, and transport between the coordinator and service nodes.

Then we have the distributed quantum nodes themselves. These represent the execution roles that can participate in the network.

At the bottom is the persistence layer. That stores jobs, reservations, registry state, and execution events.

The arrows matter here. They show that client requests flow downward through the stack, while durable state supports both orchestration and coordination. The diagram is meant to show separation of concerns: interface, control logic, distributed transport, execution roles, and persistent state are not collapsed into one component.

## Slide 5: Client Layer and Inputs

At the client layer, the important point is that this system is designed to sit behind multiple research-facing interfaces.

That can include SDKs, CLI workflows, notebooks, and experiment pipelines.

The current submission contract is OpenQASM-like circuit text, which is enough to drive the orchestration pipeline. Architecturally, though, this layer can support richer front-end tooling over time.

## Slide 6: API Layer

The API layer is the system entry point.

Its responsibilities include circuit submission, job tracking, plan inspection, service discovery queries, fidelity queries, and streaming job updates.

The implemented surfaces are the health endpoint, the circuit submission endpoint, the job status endpoint, the plan inspection endpoint, the service listing endpoint, the fidelity metrics endpoint, and the job-stream WebSocket.

This layer also includes baseline controls such as authentication, rate limiting, and structured operational logging.

## Slide 7: Why This Matters

This matters because future quantum ecosystems are unlikely to consist of one perfectly centralized resource with one static interface.

It is much more realistic to expect multiple services, varying quality, heterogeneous capabilities, and dynamic routing needs.

So the research value here is in service discovery, quality-aware placement, resilience, lifecycle management, and the study of distributed versus centralized coordination models.

## Slide 8: System Overview

This diagram is the top-level workflow map.

Start on the left with the client or researcher. The client sends an OpenQASM-like circuit into the coordinator API.

From there, the request flows into the Job Manager, which owns the lifecycle of the job. The circuit then moves through normalization and planning. The planner consults the service registry, and that registry is continuously updated by a discovery loop.

That discovery loop communicates with the coordination fabric, and the fabric communicates with the quantum service nodes.

There is also a separate runtime path in the middle of the diagram. The Job Manager drives the Runtime Executor, the runtime handles reservation and remote invocation, and those actions go back through the coordination fabric to reach service nodes.

Finally, after execution, the quantum analysis engine builds the result payload, and the durable state store captures jobs, plans, registry state, and results.

The point of this diagram is that ingestion, planning, discovery, execution, analysis, and persistence are all explicit and separated.

## Slide 9: Three Planes

This diagram shows the architecture as three interacting planes.

The control plane is where the system decides what should happen. That includes API ingestion, job lifecycle management, normalization, planning, registry consultation, and reservation logic.

The execution plane is where distributed work actually happens. That includes discovery, stream-based invocation, runtime scheduling, retries, and fallback behavior.

The data plane is what makes the whole system durable and inspectable. That includes the job store, the runtime event store, registry snapshots, and quantum result analysis artifacts.

The reason this diagram is useful is that it makes clear this project is not a single execution routine. It is a systems architecture with separate decision, execution, and state responsibilities.

## Slide 10: End-to-End Workflow

This sequence diagram walks through the full execution path.

First, the client submits a circuit to the coordinator API. The API creates a job, and the Job Manager persists the initial queued state.

Then the planner compiles the circuit and queries the registry for feasible services. The registry returns a capability snapshot, and the planner produces an execution plan. The Job Manager persists that plan and the updated lifecycle state.

Next comes the execution loop. For each dependency-ready fragment, the runtime asks the registry to reserve a target node. If the reservation succeeds, the runtime sends the fragment through the coordination fabric to a service node. The node returns success or failure, the fabric relays that response, and the runtime persists a fragment-level event.

Once fragment execution is complete, the runtime hands the plan and execution outcomes to the quantum analysis stage. That stage builds the final result payload. The completed result is then persisted, and the client can retrieve it through the API.

The diagram is useful because it shows the exact ordering of submission, planning, reservation, invocation, persistence, analysis, and result delivery.

## Slide 11: Service Discovery and Registry

This diagram explains how the registry is populated.

On the left, multiple service nodes advertise their capabilities into a discovery topic. Those advertisements are consumed by a discovery worker.

Before the registry is updated, the advertisements pass through schema validation. That step matters because the planner should not trust arbitrary or malformed network claims.

After validation, the coordinator updates a freshness-aware registry. That registry then becomes the local source of truth for both the planner and the runtime.

The registry snapshot is also persisted. That means the current network view is queryable, durable, and recoverable rather than existing only in memory.

## Slide 12: Circuit Compilation Pipeline

This diagram shows how a circuit becomes an execution plan.

The process starts with an OpenQASM-like input. That input is normalized into an internal circuit representation.

From there, the system builds a dependency DAG. That DAG captures execution order constraints and potential parallelism.

The DAG is then converted into fragments. Those fragments are the units the planner will place onto candidate services.

After that, candidate scoring evaluates which nodes are suitable for each fragment. Finally, the planner emits an execution plan with concrete assignments.

The key point is that the system never treats the submitted circuit as raw text to dispatch directly. There is a full compilation and routing pipeline in between.

## Slide 13: Example Distributed Service Vocabulary

This slide introduces the service vocabulary the coordinator understands.

Examples include bell-pair creation, controlled operations, teleportation, syndrome extraction, distillation, and measurement-feedforward style behavior.

The right way to present this is to say these are service abstractions used for coordination. Some map closely to direct gate-level behavior, while others represent higher-level distributed quantum operations.

Some of the higher-level semantics are intentionally simplified in the current proof of concept, but the important point is that the orchestration layer can reason about them as distributed services.

## Slide 14: Distributed Quantum Node Roles

This slide explains the roles the architecture can support.

Those roles include hardware-backed execution nodes, simulation nodes, optimization services, and transpilation or mapping services.

For the current proof of concept, the embedded nodes are generic service nodes used to validate orchestration behavior.

So the present implementation demonstrates the orchestration pattern, while the broader architecture is designed to grow into richer heterogeneous execution roles.

## Slide 15: Planning and Placement Logic

This diagram shows the planning problem as candidate scoring.

A fragment begins at the top. That fragment has multiple possible candidate nodes.

For each candidate, the planner considers multiple cost dimensions, such as latency-like cost, fidelity-related risk, entanglement-related cost, and load cost.

Those cost factors feed into the final selection stage, which produces a primary assignment plus fallback assignments.

The important thing to say here is that this is placement logic, not naive dispatch. The planner is evaluating tradeoffs across a live distributed topology and preserving alternatives if the preferred path later becomes unavailable.

## Slide 16: Runtime Execution Model

This diagram explains what happens once a fragment is ready to run.

Execution starts with a dependency-ready fragment. The runtime first tries to reserve a candidate node.

If the reservation is accepted, the runtime invokes the fragment over a directed peer-to-peer request stream.

If the reservation is rejected, the runtime tries a fallback node. If the invocation succeeds, the runtime records a success event.

If the invocation times out or fails, the runtime enters retry logic. If retries remain, it tries again. If retries are exhausted, it moves to fallback. If no fallback remains, the fragment reaches terminal failure.

This diagram shows that execution is both dependency-aware and failure-aware. That is a key reason this system is an orchestrator rather than a simple dispatcher.

## Slide 17: Job Lifecycle

This state diagram shows the lifecycle of the overall job.

The job starts in queued, moves to compiling, then reserving, then executing, and finally ends in either completed or failed.

The value of this diagram is that it makes the lifecycle explicit. A distributed system should not jump directly from submission to completion with no visible intermediate state.

Every major transition is persisted, which supports observability, traceability, and restart recovery.

## Slide 18: Reservation Lifecycle

This state diagram shows the lifecycle of a reservation itself.

A reservation begins as requested. It can move to prepared, then either be committed or rejected. Once committed, it can be executed, expire, or be canceled.

The main thing to emphasize is that planning and reservation are different. Planning decides where something should run. Reservation decides whether that choice is actually usable at the moment execution needs it.

That separation makes the system much closer to a realistic distributed execution environment.

## Slide 19: Coordination Protocol

This slide gives the protocol sequence in plain language.

First, the client submits a job. Then the circuit is normalized and fragmented. The planner assigns primary and fallback candidates. The orchestrator sends a reservation request. The target node accepts or rejects. The runtime schedules dependency-ready fragments. Execution responses are persisted. Finally, the job state and result are exposed through API and streaming surfaces.

There are two clarifications worth stating here.

First, discovery is broadcast-style. Nodes advertise themselves to the network.

Second, execution is directed. A fragment is sent to a specific chosen node rather than being broadcast blindly.

That distinction helps the audience understand that discovery and execution are separate coordination problems.

## Slide 20: Persistence and Recovery

This diagram shows what state is persisted and how recovery works.

Job submissions flow into the job store. Discovery updates flow into the registry snapshot store. Runtime events flow into the runtime event store.

The bottom half of the diagram shows recovery. When the coordinator restarts, it loads persisted state, recovers unfinished jobs, and restores its registry view.

The reason this matters is that the system persists more than final answers. It persists the operational history required for restart recovery, debugging, and experiment traceability.

## Slide 21: Reliability Features

This slide summarizes the resilience story.

The planner is deterministic, which supports reproducible experiments. The runtime supports fallback execution and retry policies. Scheduling respects DAG dependencies. Discovery can prune stale services. And persisted state allows job recovery after restart.

The listed failure scenarios are also important: timeouts, execution rejection, node drop, and quality degradation are already handled as first-class distributed systems events.

So the reliability contribution is not theoretical. It is built directly into the orchestration model.

## Slide 22: Quantum Result Pipeline

This diagram explains how the final quantum result is built.

The execution plan and fragment results both feed into the quantum analysis engine.

From that analysis stage, the result fans out into multiple output views: counts, full probabilities, measured probabilities, statevector, observable expectations, reduced density matrices, Bloch vectors, entanglement entropy, fidelity summaries, and top basis states.

The diagram matters because it shows that the final response is not just a pass or fail bit. The system produces a structured quantum interpretation on top of the distributed execution trace.

## Slide 23: Example Result Semantics

This slide explains how to read the result payload.

The `fragment_results` section is the operational truth. It tells us which node ran which fragment, how many attempts were needed, when execution started and ended, and what fidelity was observed.

The `quantum_result` section is the quantum interpretation. It tells us about counts over measured qubits, the full pre-measurement basis probabilities, statevector-level information, subsystem analysis, observables, entropy, fidelity, and dominant basis states.

The important distinction on this slide is between counts, probabilities, and measured probabilities. Counts are sampled over the measured qubits. Probabilities describe the full pre-measurement state. Measured probabilities give the exact marginal over only the qubits that were actually measured.

## Slide 24: Observability

This slide explains how the system can be inspected while it runs and after it finishes.

Observability surfaces include health status, the service registry view, fidelity snapshots, job-level status inspection, execution-event persistence, and WebSocket-based streaming job updates.

The reason this matters is straightforward: a distributed coordinator should be inspectable, debuggable, and auditable. Observability is part of the system design, not an afterthought.

## Slide 25: Security Posture

This slide summarizes the baseline protection model.

The current proof of concept includes API key authentication, request rate limiting, schema validation, and payload size limits.

It also lays out a path for future hardening, including stronger node identity verification, signed advertisements, and authenticated coordination channels.

So the right way to frame this is: the prototype already has baseline controls, and it has a clear path toward stronger security if the system is pushed further.

## Slide 26: What Is Implemented In This Proof Of Concept

This slide is where I would be very direct.

What is implemented already includes the API surface, WebSocket updates, durable persistence, startup recovery, service advertisement validation, freshness-aware registry management, deterministic planning, reservation, dependency-safe runtime execution, retry and fallback behavior, peer-to-peer discovery and request streams, and quantum result interpretation.

So the central orchestration platform is operational today.

## Slide 27: What Is Intentionally Simplified

This slide is important because it states the project boundaries honestly.

Some higher-level quantum-service semantics are intentionally simplified. For example, teleportation is currently approximated in the reconstruction layer, and operations like syndrome extraction and distillation are represented at the orchestration level rather than as full physical protocol implementations.

The correct framing is that the distributed systems architecture, coordination substrate, orchestration flow, persistence, and runtime behavior are implemented, while some advanced service semantics remain simplified in the current proof of concept.

That makes the claims stronger, not weaker, because it clearly separates implemented systems work from future semantic expansion.

## Slide 28: Architectural Advantages

This architecture provides decentralization, heterogeneous service participation, deterministic planning, fault tolerance, durable lifecycle tracking, and a clean separation of control, execution, and data responsibilities.

That combination makes it a strong platform for studying distributed quantum workflows as a systems problem.

## Slide 29: Main Contribution

The main contribution is the unification of quantum-service abstractions, distributed orchestration, peer-to-peer coordination, reliability-aware execution, durable state tracking, and detailed quantum interpretation in one coherent platform.

That is a much stronger claim than simply saying the system can simulate or route gates.

## Slide 30: Conceptual Comparison

This slide gives the simplest conceptual summary.

You can think of the system as workflow orchestration plus quantum circuit placement plus peer-to-peer service coordination.

The diagram is intentionally minimal because the point is conceptual synthesis. The value is in the combination of these ideas, not in any one part alone.

## Slide 31: Why This Is More Than A Simulator

This slide makes the positioning explicit.

The system is not one circuit to one backend, not one in-process execution path, and not only a quantum-state calculation.

It includes capability discovery, service placement, failure-aware orchestration, persistent lifecycle management, and post-execution quantum analysis.

That is why this should be understood as a distributed quantum services platform rather than as a simple simulator.

## Slide 32: Thank You

To conclude, this project demonstrates a credible architecture for distributed quantum services.

It shows how quantum capabilities can be discovered, planned against, reserved, executed across a distributed topology, persisted through their lifecycle, and analyzed in a structured way.

The contribution is both systems-oriented and quantum-workflow-oriented.

Most importantly, it provides a serious platform for studying how distributed quantum capabilities should be coordinated in practice.
