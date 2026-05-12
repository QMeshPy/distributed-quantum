# Unitary Foundation Microgrant Application

**Program**: Unitary Foundation Microgrant  
**Amount**: $4,000  
**Deadline**: Rolling  
**Status**: 🟡 In Progress  
**Form URL**: https://unitaryfund.typeform.com/to/j0kAOd  
**Applied**: _not yet_  
**Decision**: _pending_

---

## Application Answers

---

### Q1. What is your name?

> Soham Bhoir

---

### Q2. What's your main contact email?

> _[your email here]_

---

### Q3. What is your project name?

> **QuantumLab: An Autonomous Distributed Quantum Research Platform for Open Science**

---

### Q4. Proposal Abstract _(max 1000 characters)_

> QuantumLab is an open-source autonomous research platform powered by distributed quantum compute. Researchers visit the platform, pick an experiment — drug discovery (protein docking, ligand binding), financial modeling (portfolio optimization, options pricing, risk analysis) — and run it directly, with zero environment setup. The platform handles everything: it discovers peer nodes over py-libp2p, builds a dependency DAG from the circuit, routes fragments to matching service nodes, executes over real P2P streams, then reconstructs the full quantum state via Qiskit and returns statevectors, counts, entanglement entropy, and domain-specific results.
>
> Unlike cloud QPU platforms (IBM, Braket) which are centralized and closed, or simulators (QuNetSim) which use fake transports, QuantumLab is open, peer-to-peer, and ships real working experiments today. The grant funds adding two new experiment domains and publishing the platform with open benchmarks on Metriq so any researcher worldwide can run quantum experiments without a lab.

_(~980 characters)_

---

### Q5. Link to video proposal

> _[Record a ~2 min video walking through: what the platform is, how it helps researchers, and your background. Upload to YouTube (unlisted) or Loom and paste link here.]_
>
> **Script outline for your video:**
>
> - **0:00–0:20** — "Hi, I'm Soham. I'm building QuantumLab — an open platform where researchers run quantum experiments directly, without any environment setup. You pick an experiment, and the platform handles the rest."
> - **0:20–0:50** — "We already have two working experiment domains. In drug discovery, researchers run quantum-assisted protein docking and ligand binding. In finance, they run QAOA-based portfolio optimization and quantum options pricing. No config, no cloud accounts, just pick and run."
> - **0:50–1:20** — "Under the hood, the platform is powered by a distributed quantum compute network over py-libp2p. Nodes advertise gate capabilities via pubsub. A coordinator plans and dispatches circuit fragments over real P2P streams. After execution, Qiskit reconstructs the quantum state and returns the full result."
> - **1:20–1:45** — "No other open platform lets researchers run real quantum experiments across a peer-to-peer compute network like this — not IBM Quantum, not Braket, not any simulator. This is the missing open infrastructure layer for quantum science."
> - **1:45–2:00** — "The $4k grant covers building two more experiment domains and publishing everything openly so any researcher in the world can use it."

---

### Q6. What existing project is closest to yours?

> **IBM Quantum / Amazon Braket** — cloud platforms where researchers run quantum experiments, but both are centralized, proprietary, require accounts, and don't expose the execution infrastructure.
>
> **QuNetSim** (ETH Zurich / KIT) — closest open-source analogue, a quantum network simulator for research. But it uses a fully simulated transport layer, has no real experiments (drug discovery, finance), and is a simulator library, not a platform researchers can directly use.
>
> QuantumLab differs from both in three fundamental ways:
>
> 1. **Real working experiments, not demos.** The platform ships drug discovery (quantum protein docking via QAOA, ligand binding energy estimation) and financial modeling (portfolio optimization, quantum options pricing, CVaR risk) as first-class experiments researchers can run today — not toy circuits.
> 2. **Genuine P2P compute, not centralized cloud.** Execution runs over real py-libp2p streams across a peer-to-peer node network. Any node can join the compute pool. No single operator controls the infrastructure.
> 3. **Zero setup for researchers.** IBM and Braket still require environment configuration, SDK installation, and account setup. QuantumLab is a platform — arrive and run.

---

### Q7. How will you use the funding?

> The $4,000 grant covers approximately **3 months of part-time focused developer time** structured as follows:
>
> | Deliverable | Time | Cost |
> |-------------|------|------|
> | Two new experiment domains (e.g. quantum chemistry / VQE molecular simulation + quantum ML classifier) built on the existing platform infrastructure | 6 weeks | ~$1,800 |
> | Open benchmark dataset: structured results from all experiment domains (drug discovery, finance, new domains) with reproducible execution configs | 3 weeks | ~$800 |
> | Researcher onboarding: documentation, zero-setup Docker environment, and experiment gallery so any researcher can arrive and run without asking questions | 3 weeks | ~$700 |
> | Cloud compute credits for multi-node libp2p scenarios (AWS Lightsail) during benchmarking | ongoing | ~$700 |
>
> No equipment purchases. No travel. All outputs are open-source (MIT license) and open-publication.

---

### Q8. If funded, how many months will it take you to complete your project?

> **4 months**
>
> The core platform — distributed coordinator, P2P node network, py-libp2p fabric, Qiskit result builder, REST API, and two experiment domains (drug discovery + finance) — is already built and running. The grant funds expanding the experiment library and publishing the platform for open research use:
>
> - **Month 1**: Build new experiment domain #1 (quantum chemistry / VQE molecular simulation)
> - **Month 2**: Build new experiment domain #2 (quantum ML classifier) and run cross-domain benchmarks
> - **Month 3**: Publish benchmark results on Metriq, write researcher onboarding documentation, submit to arXiv
> - **Month 4**: Buffer for community feedback, additional experiments from early researcher users, follow-up paper

---

### Q9. Tags

> `autonomous-lab` `distributed-quantum` `quantum-platform` `open-science` `drug-discovery` `financial-modeling` `py-libp2p` `qiskit` `quantum-experiments` `peer-to-peer` `quantum-internet` `open-source`

---

### Q10. Relevant links to your work

> - **GitHub Repository**: _[add your repo URL here — make it public before submitting]_
> - **Architecture Documentation**: `/docs/ARCHITECTURE.md` — full end-to-end system design with Mermaid diagrams
> - **IPFS Strategic Vision**: `/docs/IPFS_INTEGRATION_STRATEGIC_VISION.md` — roadmap for decentralized circuit sharing and reproducibility
> - **Research Paper Draft**: `/docs/research/RESEARCH_PAPER_DRAFT.md` — in-progress academic writeup
> - **Future Roadmap**: `/docs/FUTURE_ROADMAP.md` — 5-milestone plan toward autonomous scientific discovery network

---

### Q11. What is the main country in which your project is based?

> **India**

---

### Q12. Is there anything else you'd like us to know? What else are you looking for to make your project successful?

> A few things worth noting:
>
> 1. **This is a platform, not a tool.** The distinction matters for grant framing: we are not building middleware or a library. QuantumLab is a place researchers come to run experiments. The two existing domains — drug discovery (quantum protein docking, ligand binding) and financial modeling (QAOA portfolio optimization, quantum risk analysis) — are first-class research workflows that produce real scientific outputs, not circuit demos.
>
> 2. **The core platform is already working.** This is not a speculative proposal. The distributed coordinator, P2P node network, and both experiment domains are running today. Researchers can already arrive and execute a drug discovery or finance experiment without installing anything quantum-related. The grant funds expanding the experiment library and opening the platform to the broader research community.
>
> 3. **This sits at a gap mainstream quantum grants don't fund.** IBM, Google, and Amazon fund hardware. NSF and DARPA fund algorithms. Nobody funds the open, peer-to-peer platform layer that makes quantum experiments accessible to researchers who don't have cloud QPU access, institutional accounts, or quantum engineering backgrounds. That is exactly what QuantumLab is.
>
> 4. **Long-term vision: the open autonomous quantum lab.** The roadmap leads toward a platform where researchers can design new experiments, submit them to the community, and have them run autonomously across a global peer network — the arXiv + Binder equivalent for quantum science. The Unitary Foundation's ecosystem (Metriq for benchmarks, Mitiq for error mitigation) is exactly the community we want to build alongside.
>
> 5. **What would make this most successful**: Early adopter researchers from the Unitary Foundation's network who would be willing to run an experiment on the platform and give feedback. Introductions to quantum chemistry or quantum ML researchers who have a real scientific problem that could be expressed as a quantum experiment.

---

### Q13. How will you measure impact of your project?

> Impact will be measured across three dimensions:
>
> **1. Research Accessibility (primary)**
> - [ ] ≥10 researchers from outside the project team successfully run an experiment on the platform within 3 months of public launch
> - [ ] Zero-setup verified: time from landing on README to running first experiment ≤ 15 minutes via Docker
> - [ ] ≥4 distinct experiment domains available (currently 2: drug discovery + finance; grant adds 2 more)
> - [ ] All experiments produce reproducible results: same input circuit → same Qiskit output across runs
>
> **2. Ecosystem Contribution (secondary)**
> - [ ] Benchmark results from all experiment domains submitted to Metriq
> - [ ] GitHub repository reaches ≥50 stars within 3 months of public launch
> - [ ] At least one external researcher cites, forks, or publishes results from the platform within 6 months
> - [ ] Platform used in at least one academic course or workshop demo
>
> **3. Scientific Output (tertiary)**
> - [ ] Comparative analysis of distributed vs. centralized quantum experiment execution submitted to arXiv
> - [ ] Benchmark dataset (experiment inputs, circuit plans, execution telemetry, quantum results) published with DOI
> - [ ] At least one domain-specific result (drug discovery or finance) written up as a short paper or preprint
>
> **Tools**: GitHub Insights, Metriq submission tracking, researcher onboarding survey (simple form), arXiv submission, structured result artifacts with embedded metadata.

---

## Submission Checklist

- [ ] Fill in email (Q2)
- [ ] Make GitHub repository public
- [ ] Add GitHub repo URL to Q10
- [ ] Record 2-minute video (use script outline in Q5)
- [ ] Paste video link into Q5
- [ ] Submit at: https://unitaryfund.typeform.com/to/j0kAOd

---

## Notes & Revision Log

| Date | Note |
|------|------|
| 2026-05-12 | Initial draft created from full codebase analysis and ARCHITECTURE.md deep read |
| 2026-05-12 | Reframed: platform (not tool/layer), autonomous research lab, researcher-first narrative, drug discovery + finance experiments as first-class features |

