# Real Options Pricing Module — Design Spec

**Date:** 2026-05-02  
**Authors:** Soham Bhoir, Manusheel Gupta  
**Status:** Approved for implementation

---

## 1. Problem Statement

This module is a completely new, parallel feature to the existing portfolio optimization module. It brings quantum-accelerated pricing of real options (corporate-level strategic decisions: expand, delay, abandon, patent) alongside standard financial options (European call/put). The quantum method is Quantum Amplitude Estimation (IQAE), providing a theoretical quadratic speedup over classical Monte Carlo. Classical Black-Scholes provides the baseline for comparison.

**Key research grounding:**
- Woerner & Egger (2019) — canonical QAE derivatives pricing pipeline
- Suzuki et al. (2020, *npj Quantum Information*) — Iterative QAE (no QPE ancillas needed on NISQ)
- EPJ Quantum Technology (Feb 2025) — mRQAE + direct encoding for negative payoffs
- Hok & Leitao (Jan 2026, arXiv:2601.04049) — end-to-end QAE with NIG distribution; 10–100x fewer queries than Monte Carlo on real equities

---

## 2. Supported Option Types

All eight reduce to the same mathematical structure: `E[F(S_T)]` for a payoff function `F`. Only `F` and how `S` is interpreted changes. The Damodaran XLS files (`dataset/damodaran/options/`) confirm the exact input parameters and B-S mappings for each type.

| Option Type | Source file | Payoff `F(S)` | B-S S maps to | B-S K maps to |
|---|---|---|---|---|
| European Call (short-term) | `optst.xls` | `max(S - K, 0)` | Stock price | Strike price |
| European Call (long-term) | `optlt.xls` | `max(S - K, 0)` | Stock price | Strike price |
| Option to Expand | `expand.xls` | `max(PV_expanded - Investment, 0)` | PV of expansion | Investment cost |
| Option to Delay | `delay.xls` | `max(V_project - Investment, 0)` | PV of cash flows | Investment needed |
| Option to Abandon | `abandon.xls` | `max(Salvage - PV_continue, 0)` | PV of continuing cash flows | Salvage value |
| Patent / R&D Project | `project.xls` | `max(PV_product - Dev_cost, 0)` | PV of net cashflows | R&D/dev cost |
| Natural Resource | `natres.xls` | `max(PV_reserves - Dev_cost, 0)` | PV of reserves (price × qty − royalties) | Development cost |
| Financial Flexibility | `flexval.xls` | `max(Reinvestment_need - Capacity, 0)` | Avg reinvestment need (% of firm value) | Max capacity from internal financing |

**Short-term vs long-term European options are two separate modes** in the input panel (short-term uses days and dividend schedule; long-term uses years and a dividend yield).

---

## 3. Quantum Method

### 3.1 Architecture: A–Q–IQAE Pipeline

Three cleanly separated components, designed for Phase 2 upgrade without rewrite:

```
┌─ State prep A ──────────────────┐
│  LogNormalDistribution (Phase 1) │  ← encodes S_T distribution into |ψ⟩
│  NIG via cosine series (Phase 2) │
└──────────────────────────────────┘
         │
         ▼
┌─ Payoff oracle Q ───────────────┐
│  Comparator + linear approx.    │  ← encodes F(S_T) as rotation on ancilla
│  Direct encoding (Phase 2)      │
└──────────────────────────────────┘
         │
         ▼
┌─ Estimation ────────────────────┐
│  IterativeAmplitudeEstimation   │  ← Qiskit's IQAE, no QPE ancillas
│  → E[F(S_T)] = option price     │
└──────────────────────────────────┘
```

**Phase 1** (implement now): `LogNormalDistribution` + standard comparator circuit + IQAE.  
**Phase 2** (upgrade path, same interface): NIG distribution + direct encoding + mRQAE.  
The `StatePrep` and `PayoffOracle` are injected into the solver as separate objects — swapping them out requires no changes to the estimation layer.

### 3.2 Quantum Greeks

Quantum Greeks are computed via **finite difference on the quantum circuit** (parameter shift):

```python
Delta  = [V(S₀+δ) - V(S₀-δ)] / (2δ)        # 2 extra IQAE runs
Gamma  = [V(S₀+δ) - 2V(S₀) + V(S₀-δ)] / δ² # uses the 3 runs above
Vega   = [V(σ+δ) - V(σ-δ)] / (2δ)           # 2 extra IQAE runs (vary σ)
Theta  = classical Black-Scholes ∂V/∂t        # closed-form only
```

Total: **5 IQAE circuit runs** per option job (price + Delta/Gamma + Vega). All 5 run inside the same background task. Theta is classical only (time discretization makes quantum theta impractical at NISQ scale).

### 3.3 Circuit Parameters

| Parameter | Value | Notes |
|---|---|---|
| Price qubits | 5 | 2^5 = 32 discretization points (NISQ-safe) |
| Objective qubits | 1 | Ancilla qubit |
| Total qubits | 6–8 | Depends on option type |
| Backend | `BasicSimulator` | Statevector simulation, no real hardware |
| IQAE epsilon | 0.01 | 1% accuracy target |
| IQAE alpha | 0.05 | 95% confidence |
| Shots | 1024 | Per IQAE iteration |

---

## 4. Classical Baselines

**Primary:** Black-Scholes closed-form for all option types. Real options map to equivalent B-S parameters as shown in Section 2.

**Secondary:** Binomial tree (from `bstobin.xls` methodology) — shows the equivalence between B-S and binomial lattice, useful for validating the result and showing convergence. Displayed alongside B-S in the comparison report.

```python
# Black-Scholes mapping examples
BS_expand   = bs_call(S=pv_expanded,    K=investment,  T=T, r=r, sigma=sigma)
BS_delay    = bs_call(S=pv_cashflows,   K=investment,  T=T, r=r, sigma=sigma)
BS_abandon  = bs_put( S=pv_continuing,  K=salvage,     T=T, r=r, sigma=sigma)
BS_patent   = bs_call(S=pv_product,     K=dev_cost,    T=T, r=r, sigma=sigma)
BS_natres   = bs_call(S=pv_reserves,    K=dev_cost,    T=T, r=r, sigma=sigma)
BS_flexval  = bs_call(S=reinvest_pct,   K=capacity,    T=1, r=r, sigma=sigma)
```

---

## 5. Backend Architecture

### New files (no changes to existing financial module):

```
backend-v2/quantum-backend-v2/src/quantum_backend_v2/
├── api/
│   ├── routers/
│   │   └── options.py          ← new: FastAPI routes /api/v1/options
│   └── models/
│       └── options.py          ← new: Pydantic request/response models
├── application/
│   ├── real_options_pricing.py ← new: A–Q–IQAE solver + B-S baseline
│   └── parity.py               ← extend: add OptionsJobService class
└── persistence/
    └── postgres.py             ← extend: add OptionsJobRecord table
```

### `OptionsJobRequest` (input model)

```python
class OptionsJobRequest(BaseModel):
    option_type: Literal["european_call", "european_put", "expand", "delay", "abandon", "patent"]
    # Common params
    current_value: float       # S₀ (current asset/project value)
    strike_or_cost: float      # K (strike price or investment cost)
    time_to_expiry: float      # T in years
    volatility: float          # σ (annual)
    risk_free_rate: float      # r (annual)
    # Real option extras (optional, relevant by type)
    pv_expanded: float | None = None   # for expand
    salvage_value: float | None = None # for abandon
    pv_patent: float | None = None     # for patent
```

### `OptionsAnalysisResult` (output model)

```python
class OptionsAnalysisResult(BaseModel):
    # Pricing
    quantum_price: float
    classical_price: float          # Black-Scholes
    price_difference_pct: float
    # Greeks (quantum via finite diff, classical via B-S formula)
    quantum_delta: float
    classical_delta: float
    quantum_gamma: float
    classical_gamma: float
    quantum_vega: float
    classical_vega: float
    classical_theta: float          # quantum theta not computed
    # Circuit metadata
    num_qubits: int
    num_iqae_runs: int              # always 5
    shots_per_run: int
    epsilon: float
    confidence_interval: list[float]  # [lower, upper]
    circuit_depth: int
    # Speedup evidence
    classical_mc_samples_equivalent: int   # how many MC samples IQAE replaced
    quadratic_speedup_factor: float        # M_mc / M_iqae
```

### `OptionsJobService` in `parity.py`

Same pattern as `FinancialJobService`: `submit()` creates the `OptionsJobRecord` and fires a background task, `process()` runs the solver and updates the record.

### Database: `OptionsJobRecord` in `postgres.py`

```python
class OptionsJobRecord(Base):
    __tablename__ = "options_jobs"
    id = Column(String, primary_key=True)          # "opt-{uuid4}"
    status = Column(String)                         # pending/running/done/failed
    option_type = Column(String)
    request_payload = Column(JSON)
    result_payload = Column(JSON, nullable=True)
    error = Column(String, nullable=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
```

### Router registration

Register in `app.py`:
```python
from quantum_backend_v2.api.routers.options import router as options_router
app.include_router(options_router, prefix="/api/v1/options")
```

---

## 6. Frontend Architecture

### New files:

```
frontend-v2/src/
├── app/
│   ├── (main)/options/page.tsx          ← new: entry point, renders OptionsAnalyticsClient
│   └── api/options/
│       ├── route.ts                     ← new: POST + GET proxy
│       └── [jobId]/route.ts             ← new: GET single job proxy
├── data/
│   └── damodaran-industries.ts          ← new: 96-industry σ lookup (static, from equity.xls)
├── types/options.ts                     ← new: TypeScript types mirroring backend models
└── components/options/
    ├── options-analytics-client.tsx     ← new: orchestrator (polling, state)
    ├── options-hero.tsx                 ← new: page header + description
    ├── options-input-panel.tsx          ← new: form inputs for all 8 option types + industry σ picker
    ├── options-job-card.tsx             ← new: job history row
    ├── options-job-progress.tsx         ← new: live progress while running
    └── options-result-dashboard.tsx     ← new: full result visualization
```

### Sidebar entry

Add to `dashboard-shell.tsx` under a new "Financial" group (or alongside existing Finance entry):

```tsx
{ href: "/options", icon: TrendingUp, label: "Options" }
```

### Options Input Panel

Dynamic form: option type selector (8 types) controls which fields appear. All fields are numeric inputs with sensible defaults matching Damodaran's example values.

**Key UX feature — Damodaran Industry σ Lookup:** A "Pick industry" dropdown (96 industries from `equity.xls` / `optlt.xls`) auto-fills the volatility field. Two σ options are offered: equity-level (more volatile) and firm-level (less volatile). The full dataset is embedded in `frontend-v2/src/data/damodaran-industries.ts` as a static constant — no API call needed.

Submit fires `POST /api/options`.

### Options Result Dashboard (tiers, top to bottom)

**Tier 1 — Stat boxes (full width):** Quantum Price | Classical Price | Price Delta (%) | Speedup Factor

**Tier 2 — Greeks comparison grid (2 columns):** Quantum vs Classical for Delta, Gamma, Vega; Theta (classical only, labeled)

**Tier 3 — Classical baselines side-by-side:** Black-Scholes price vs Binomial tree price (from `bstobin.xls` methodology) — confirms convergence, validates the quantum result

**Tier 4 — Confidence interval bar:** Visual IQAE confidence interval vs B-S point estimate

**Tier 4 — Quantum advantage evidence:** Equivalent MC samples replaced | IQAE query count | Quadratic speedup formula

**Tier 5 — Circuit metadata:** Qubits | Depth | Shots/run | IQAE runs | Epsilon | Confidence level

**Tier 6 — Circuit diagram text:** Gate count breakdown (A prep gates, Q oracle gates, IQAE ancilla gates)

---

## 7. Data Flow

```
User fills form (option type + params)
    │
    ▼
POST /api/options (Next.js proxy)
    │
    ▼
POST /api/v1/options (FastAPI)
    ├─ Creates OptionsJobRecord (status=pending)
    ├─ Returns { job_id: "opt-..." }
    └─ Fires background task
           │
           ▼
     OptionsJobService.process()
       1. Run Black-Scholes (classical) → price + Greeks
       2. Build LogNormalDistribution circuit (A)
       3. Build payoff comparator circuit (Q)
       4. Run IQAE × 5 (price, S+δ, S-δ, σ+δ, σ-δ)
       5. Compute quantum Greeks from finite differences
       6. Compute speedup factor
       7. Update OptionsJobRecord (status=done, result=payload)

Frontend polls GET /api/options/{jobId} every 2s
    │
    ▼
On status=done → render OptionsResultDashboard
```

---

## 8. Error Handling

- Negative inputs → 422 from Pydantic before any quantum circuit runs
- IQAE convergence failure → caught, stored as `error` in record, surfaced in UI
- `sigma=0` edge case → skip IQAE, return Black-Scholes only with a warning flag
- Option types where quantum and classical diverge > 5% → surface a `divergence_warning` in the result

---

## 9. What This Is Not

- No real market data ingestion — all inputs are user-provided parameters
- No multi-path / path-dependent options (Asian, American) in Phase 1
- No real quantum hardware — `BasicSimulator` only
- No Phase 2 (NIG + mRQAE) in this sprint — architecture is designed to support it

---

## 10. Key Research References

1. Woerner & Egger (2019). *Quantum risk analysis*. npj Quantum Information.
2. Suzuki et al. (2020). *Iterative quantum amplitude estimation*. npj Quantum Information. [Nature](https://www.nature.com/articles/s41534-021-00379-1)
3. Stamatopoulos et al. (2020). *Option pricing using quantum computers*. Quantum.
4. arXiv:2303.06089 — Real Option Pricing using Quantum Computers (direct reference for this module)
5. EPJ Quantum Technology vol.12, article 28 (Feb 2025) — Alternative pipeline: mRQAE + direct encoding
6. arXiv:2601.04049 (Jan 2026) — End-to-end multi-asset QAE pipeline, NIG distribution, 10–100x speedup on real equities

---

## 11. Out of Scope (Future)

- Phase 2: NIG distribution state prep + mRQAE + direct encoding (negative payoffs)
- Quantum Theta (impractical at NISQ scale)
- American / Asian / Barrier options
- Stochastic volatility models (Heston, SABR) — relevant once Phase 2 NIG is in
- Real hardware execution via IBM Quantum or IonQ
