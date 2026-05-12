# Documentation Navigator

> Know exactly where to go in under a minute.

---

## Pick Your Path

### I want to understand the system architecture
**→** [`ARCHITECTURE.md`](ARCHITECTURE.md)

Full end-to-end architecture, component breakdown, Mermaid diagrams, state machines.

### I want the research paper (QAOA + portfolio optimization)
**→** [`research/RESEARCH_PAPER_DRAFT.md`](research/RESEARCH_PAPER_DRAFT.md)

~15,000 words · 9 sections · publication-ready. All experiments, benchmarks, and findings.

### I want implementation/technical notes
**→** [`technical/IMPLEMENTATION_NOTES.md`](technical/IMPLEMENTATION_NOTES.md)

Complete optimization journey — bottleneck discovery, Phase 1 fix, Phase 2 failure, Phase 3 pivot.

### I want mathematical proofs
**→** [`research/MATHEMATICAL_APPENDIX.md`](research/MATHEMATICAL_APPENDIX.md)

~8,000 words of rigorous derivations: QUBO→Ising, parameter-shift rule, Amdahl's Law proofs.

### I want the current quantum scaling strategy
**→** [`research/QUANTUM_SCALING_STRATEGY.md`](research/QUANTUM_SCALING_STRATEGY.md)

Why we pivoted from speed tricks to scaling demonstration. Crossover predictions, success criteria.

### I want to understand what failed
**→** [`technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md`](technical/GRADIENT_OPTIMIZATION_POSTMORTEM.md)

Honest analysis: parameter-shift gradients were 2–3× slower. Root cause: 8× evaluation overhead.

### I want to deploy the platform
**→** [`../DEPLOYMENT-MANUAL.md`](../DEPLOYMENT-MANUAL.md) then [`LIGHTSAIL-DEPLOYMENT.md`](LIGHTSAIL-DEPLOYMENT.md)

### I want to understand finance theory and the quantum use case
**→** [`FINANCIAL_MODELING_FOUNDATIONS.md`](FINANCIAL_MODELING_FOUNDATIONS.md)

Track A (corporate finance) vs Track B (quantum finance optimization) — which problem fits quantum.

### I want the long-term product roadmap
**→** [`FUTURE_ROADMAP.md`](FUTURE_ROADMAP.md)

5-milestone evolution: SDK platform → open node network → research engine → service swarm → self-healing.

### I want alternative quantum finance problems (backup plan)
**→** [`research/ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md`](research/ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md)

Option pricing QAE (proven 100× speedup), credit risk, yield curves.

---

## Research Summary (30-second read)

**Question**: Can quantum optimize portfolios faster than classical?

| Scale | Classical | Quantum | Winner |
|---|---|---|---|
| ≤ 20 assets | **Fast** | 50–100× slower | Classical |
| ≥ 40 assets | Exponential | ~Constant | **Quantum** |

**Bottleneck**: 97% of quantum runtime is classical COBYLA parameter search — not the quantum circuit.

**Key insight**: Advantage comes from *scaling behavior*, not raw speed.

---

## Folder Structure

```
docs/
├── START_HERE.md                         ← YOU ARE HERE
├── ARCHITECTURE.md                       ← System architecture (deep dive)
├── design.md                             ← Design rationale and tradeoffs
├── requirements.md                       ← Functional / non-functional requirements
├── FINANCIAL_MODELING_FOUNDATIONS.md     ← Finance theory and quantum use case framing
├── FUTURE_ROADMAP.md                     ← Long-term 5-milestone roadmap
├── IPFS_INTEGRATION_STRATEGIC_VISION.md  ← VAULT / IPFS vision (Phase 2)
├── LIGHTSAIL-DEPLOYMENT.md               ← Lightsail-specific deployment guide
├── QAE_ENHANCEMENT_NOTE.md               ← Quantum Amplitude Estimation extension
├── ipfs-progress.md                      ← VAULT Phase 1 task tracker
│
├── research/                             ← Publication materials
│   ├── RESEARCH_PAPER_DRAFT.md           Main paper
│   ├── MATHEMATICAL_APPENDIX.md          Formal proofs
│   ├── QUANTUM_SCALING_STRATEGY.md       Scaling hypothesis
│   ├── ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md
│   └── DATASET_DOWNLOAD_STRATEGY.md
│
├── technical/                            ← Implementation details
│   ├── IMPLEMENTATION_NOTES.md           Optimization journey
│   ├── GRADIENT_OPTIMIZATION_POSTMORTEM.md
│   ├── QAOA_OPTIMIZATION_RESEARCH.md     Literature survey
│   └── BENCHMARK.md                      Original benchmark analysis
│
└── future-roadmap/                       ← Per-milestone roadmap docs
    ├── 00-sequencing-and-program-plan.md
    ├── 01-production-sdk-and-platform.md
    ├── 02-bring-your-own-node-network.md
    ├── 03-autonomous-research-and-drug-discovery-platform.md
    ├── 04-torrent-native-service-network.md
    └── 05-hydra-self-healing-network.md
```

---

## Read by Goal

| Goal | Start Here |
|---|---|
| Write thesis/paper | `research/RESEARCH_PAPER_DRAFT.md` → `research/MATHEMATICAL_APPENDIX.md` |
| Replicate experiments | `technical/IMPLEMENTATION_NOTES.md` → `../backend/scripts/` |
| Understand quantum advantage | `research/QUANTUM_SCALING_STRATEGY.md` → `research/MATHEMATICAL_APPENDIX.md` §F |
| Understand system internals | `ARCHITECTURE.md` → `design.md` |
| Make product/advisor decisions | `research/QUANTUM_SCALING_STRATEGY.md` → `research/ALTERNATIVE_QUANTUM_FINANCE_PROBLEMS.md` |
| Deploy to production | `../DEPLOYMENT-MANUAL.md` → `LIGHTSAIL-DEPLOYMENT.md` |

---

## Key Research Contributions

1. **First detailed QAOA bottleneck analysis** in a financial application
2. **Amdahl's Law proof** showing distributed execution gives ≤1.03× speedup when 97% is serial
3. **Transparent failure documentation** — gradient optimization postmortem with root cause
4. **Scaling characterization** — quantum advantage crossover at N=40–50 assets

---

<div align="center">

**[← Main README](../README.md)** · **[Research Paper →](research/RESEARCH_PAPER_DRAFT.md)** · **[Architecture →](ARCHITECTURE.md)**

</div>
