# Quantum Pharma: Implementation Design Specification

**Date:** 2026-05-09
**Status:** Approved for implementation
**Parent spec:** `quantum-pharma-docking-design.md`
**Approach:** First-Class Workflow Integration (Approach 1)

---

## 1. Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Quantum backend | PennyLane + Qiskit simulation on distributed peers | No IBM runtime access; simulators are scientifically valid |
| Parallelism boundary | Fragment-per-peer (Option B) | Exercises WorkflowDAG + FragmentAssignment; genuine distributed parallelism |
| QWGAN strategy | Pretrained weights + target fine-tune (Option C) | 2-4 min warmup concurrent with preprocessing; target-aware generation |
| Frontend aesthetic | Distinct scientific visual (Option B) | MoleculeCard, radar charts, energy diagrams |
| Iterative mode | V1 includes scaffold hopping + warm-start DC-QAOA | The novel research contribution lives here |
| Stage 2 algorithm | DC-QAOA (not vanilla QAOA) | 3x faster convergence at p=1 vs p=3 |
| VQE embedding | DMET (impurity + bath) | Halves qubit count from ~12 to ~6-8 per fragment |
| VQE ansatz | UCCSD (swappable to LUCJ for V2 hardware) | AnsatzFactory pattern for future-proofing |
| Stage -1 enhancement | Multi-agent RL (QED/LogP/SA agents) | Higher ADMET pass rate from generation stage |
| Benchmarking | MOSES-compatible metrics on all discovery runs | Directly comparable to published GAN literature |

---

## 2. Architecture Overview

### 2.1 Backend Additions

**Existing files touched (4 total — surgical changes only):**
- `workflows/models.py` — add `PHARMA_DOCKING` to `WorkflowType`, `REFINING` to `WorkflowRunStatus`, new `PharmaWorkflowConfig`
- `bootstrap/application.py` — wire `PharmaOrchestrator` into lifespan
- `api/routers/__init__.py` — register pharma router
- `persistence/mongodb.py` — add `FragmentDescriptorDocument`

**New domain module:** `backend/src/quantum_backend_v2/pharma/`

```
pharma/
  __init__.py
  models.py              # PharmaJob, PharmaCandidate, DockingPose, ADMETResult, etc.
  pipeline.py            # PharmaOrchestrator — builds DAG, drives ExecutionService
  config.py              # VQEConfig, QAOAConfig, QWGANConfig
  stages/
    __init__.py
    stage_neg1.py        # QWGAN generation + multi-agent RL (PennyLane + PyTorch)
    stage_0.py           # VQE descriptors with DMET embedding (PennyLane + PySCF)
    stage_1.py           # Lipinski + electronic filter (RDKit)
    stage_2.py           # DC-QAOA fragment docking (PennyLane)
    stage_3.py           # VQC binding affinity scoring (PennyLane)
    stage_4.py           # ADMET gate + scaffold hopping (RDKit)
  cache.py               # MongoDB fragment descriptor cache
  dmet.py                # DMET bath construction (PySCF wrapper)
  ansatz_factory.py      # UCCSD / LUCJ / HEA ansatz builder
  qubo_builder.py        # QUBO matrix construction + QUBO→Ising conversion
  rl_agents.py           # Multi-agent RL for QWGAN property balancing
  weights/
    qgan_vae_weights.pt  # Pretrained VAE encoder/decoder (MOSES/ZINC trained)
    qgan_circuit.npz     # Pretrained quantum generator rotation angles (15 qubits)
    vqc_weights.npz      # Pretrained VQC scoring weights (Davis+KIBA trained)
```

**New API router:** `api/routers/pharma.py` at `/api/v1/pharma`

### 2.2 Frontend Additions

New feature module: `frontend/src/features/pharma/`
New routes: `(main)/pharma/`, `(main)/pharma/[jobId]/`, `(main)/pharma/history/`
All existing routes, features, and API endpoints are untouched.

---

## 3. Data Models (`pharma/models.py` + `pharma/config.py`)

### 3.1 Configuration Models

```python
class PharmaMode(str, Enum):
    OPTIMIZATION = "optimization"
    DISCOVERY = "discovery"

class AnsatzType(str, Enum):
    UCCSD = "uccsd"
    LUCJ = "lucj"       # V2 hardware path — config-ready in V1
    HEA = "hea"         # Hardware-efficient fallback

class VQEConfig(BaseModel):
    ansatz: AnsatzType = AnsatzType.UCCSD
    embedding: Literal["full", "dmet"] = "dmet"
    basis_set: str = "sto-3g"
    shots: int = 1024
    optimizer: str = "cobyla"
    max_iterations: int = 200

class QAOAConfig(BaseModel):
    layers: int = 1                  # DC-QAOA needs p=1 only
    use_counterdiabatic: bool = True
    cd_alpha: float = 0.5            # Counterdiabatic driving strength
    optimizer: str = "cobyla"
    max_iterations: int = 150
    shots: int = 1024

class QWGANConfig(BaseModel):
    num_qubits: int = 15
    latent_dim: int = 128
    entangling_layers: int = 3
    finetune_epochs: int = 15
    use_rl_agents: bool = True
    rl_objectives: list[str] = ["qed", "logp", "sa"]
    gradient_penalty_lambda: float = 10.0

class TargetProperties(BaseModel):
    max_molecular_weight: float = 500.0
    min_qed: float = 0.5
    max_logp: float = 5.0
    custom_constraints: dict[str, Any] = {}

class PharmaWorkflowConfig(BaseModel):
    """Pharma docking workflow config — slots alongside FinancialWorkflowConfig."""
    mode: PharmaMode
    target_pdb_id: str
    initial_ligand_smiles: str | None = None       # Required for OPTIMIZATION
    target_properties: TargetProperties | None = None  # Required for DISCOVERY
    max_iterations: int = 5
    candidate_count: int = 100
    vqe: VQEConfig = VQEConfig()
    qaoa: QAOAConfig = QAOAConfig()
    qwgan: QWGANConfig = QWGANConfig()
    vqc_shots: int = 1024
    iterative: bool = True
```

### 3.2 Domain Models

```python
class MolecularFragment(BaseModel):
    fragment_id: str
    smiles: str
    parent_ligand_smiles: str
    atom_indices: tuple[int, ...]
    adjacent_fragments: tuple[str, ...]
    rotatable_bonds: int

class VQEDescriptors(BaseModel):
    fragment_id: str
    homo_energy_ev: float
    lumo_energy_ev: float
    homo_lumo_gap_ev: float
    chemical_hardness_ev: float
    esp_charges: list[float]
    ground_state_energy_hartree: float
    qubit_count: int
    gate_count: int
    vqe_iterations: int
    cached: bool = False
    dmet_impurity_size: int | None = None

class QUBOPlacement(BaseModel):
    fragment_id: str
    grid_site_index: int
    binary_variable_assignment: list[int]
    interaction_energy_kcal: float
    clash_penalty: float
    bond_geometry_penalty: float

class DockingPose(BaseModel):
    ligand_smiles: str
    fragment_placements: list[QUBOPlacement]
    total_qubo_energy: float
    rmsd_angstrom: float | None = None
    qaoa_approximation_ratio: float
    qaoa_params_beta: list[float]
    qaoa_params_gamma: list[float]
    dc_qaoa_alpha: float

class VQCScore(BaseModel):
    ligand_smiles: str
    binding_affinity_kcal: float
    confidence_interval: tuple[float, float]   # From quantum shot noise
    quantum_shot_variance: float
    pose_rank: int

class ADMETResult(BaseModel):
    ligand_smiles: str
    molecular_weight: float
    logp: float
    tpsa: float
    hbd: int
    hba: int
    synthetic_accessibility: float
    qed_score: float
    lipinski_violations: int
    herg_risk: bool
    cyp450_soft_spots: list[int]               # Atom indices with high HOMO density
    passes: bool
    failure_reasons: list[str]

class ScaffoldIteration(BaseModel):
    iteration: int
    input_smiles: str
    output_smiles: str
    reason_for_hop: str
    replaced_fragment_id: str
    replacement_fragment_smiles: str
    warm_start_beta: list[float]
    warm_start_gamma: list[float]

class MOSESMetrics(BaseModel):
    fcd: float       # Fréchet ChemNet Distance
    snn: float       # Similarity to Nearest Neighbor
    frag: float      # Fragment similarity
    scaf: float      # Scaffold similarity
    int_div: float   # Internal diversity
    filters: float   # % passing MCF + PAINS filters
    novelty: float   # % not in training set
    validity: float  # % chemically valid SMILES

class PharmaCandidate(BaseModel):
    rank: int
    smiles: str
    docking_pose: DockingPose
    vqc_score: VQCScore
    admet: ADMETResult
    descriptors: list[VQEDescriptors]
    scaffold_history: list[ScaffoldIteration]

class PharmaJobResult(BaseModel):
    mode: PharmaMode
    target_pdb_id: str
    candidates: list[PharmaCandidate]
    moses_metrics: MOSESMetrics | None = None
    total_runtime_seconds: float
    cache_hit_rate: float
    iterations_used: int
    fragments_distributed: dict[str, str]      # fragment_id → peer_id
```

---

## 4. Pipeline Orchestration (`pharma/pipeline.py`)

### 4.1 PharmaOrchestrator Lifecycle

```
submit(config) → WorkflowRun(status=SUBMITTED, type=PHARMA_DOCKING)
plan()         → WorkflowDAG with fragment-per-peer topology
execute()      → Walk DAG topologically via ExecutionService
refine()       → On ADMET fail: scaffold hop, rebuild partial DAG, warm-start
finalize()     → Aggregate results, persist MongoDB, mark COMPLETED
```

### 4.2 DAG Topology (Fragment-per-Peer)

For a ligand with N fragments across P peers:

```
Stage 0: N parallel VQE nodes (1 per fragment → different peers)
    ↓ all complete
Stage 1: 1 filter node (coordinator — pure Python)
    ↓ passes
Stage 2: N parallel DC-QAOA nodes (1 per fragment → different peers)
    ↓ all complete
Stage 2.5: 1 merge node (coordinator — assembles full pose)
    ↓
Stage 3: 1 VQC scoring node (single peer — needs full ligand)
    ↓
Stage 4: 1 ADMET gate node (coordinator)
    ↓
    PASSES → COMPLETED
    FAILS  → REFINING → scaffold hop → re-enter Stage 2 warm-start
```

Discovery mode prepends Stage -1: `candidate_count / P` generation nodes per peer.

### 4.3 Iterative Scaffold Hopping (REFINING State)

When ADMET fails and `config.iterative == True`:
1. Identify failing criterion (e.g., TPSA = 152, threshold = 140)
2. BRICS decompose → find fragment responsible for failing metric
3. Query RDKit fragment library for replacement (lower metric contribution, Tanimoto > 0.6)
4. Construct new SMILES via fragment substitution
5. Persist `ScaffoldIteration` to `WorkflowRun.output_snapshot`
6. Rebuild partial DAG — only modified fragment needs re-docking
7. Warm-start DC-QAOA: initialize (β, γ, α) from previous iteration
8. Transition: `REFINING → RUNNING → AWAITING_FRAGMENTS → AGGREGATING`
9. On `max_iterations` exhausted: `FAILED` with per-criterion failure reasons

Warm-start saves ~3s/fragment vs cold-start (~5s/fragment).

### 4.4 Fragment Descriptor Cache (`pharma/cache.py`)

MongoDB collection `fragment_descriptors`:
- **Key:** canonical SMILES (RDKit canonicalization — isomer-aware)
- **Value:** full `VQEDescriptors` + `computed_at`, `source_job_id`
- **TTL:** none (quantum chemistry results are deterministic)
- **Scope:** cross-user, cross-job, cross-mode accumulation

Cache check before every VQE dispatch:
```python
hits = await db.fragment_descriptors.find(
    {"canonical_smiles": {"$in": canonical_smiles_list}}
).to_list()
```
Fragments not in cache are dispatched to peers. Results cached after completion.

Cache hit rate dynamics: ~1000 jobs → P(hit) ≈ 0.6 (from spec Section 9.5 model).

---

## 5. Stage Implementations

### 5.1 Stage -1: Quantum GAN Generation (Discovery Mode Only)

**Papers:** Baglio et al. 2026 (arXiv:2603.22399) + QCA-MolGAN 2025

**Algorithm:**
1. Load pretrained VAE weights (`qgan_vae_weights.pt`) — encoder + decoder
2. Load pretrained quantum generator angles (`qgan_circuit.npz`) — 15-qubit circuit
3. Extract target binding site descriptors from PDB (pocket volume, charge, H-bond capacity)
4. Fine-tune 15 rotation angles on coordinator: 10-15 epochs conditioned on target descriptors
5. Multi-agent RL: 3 agents (QED, LogP, SA) each adjust angle subsets via policy gradient
6. Sample latent vectors → PennyLane `default.qubit` → decode via VAE → SMILES
7. RDKit validity filter (expect ~99.7% valid per Baglio et al.)
8. Compute MOSES metrics for the generated batch

**Quantum circuit (per Baglio et al.):**
```
|ψ_gen(z)⟩ = U_ent^(3) · U_ent^(2) · U_ent^(1) · ∏ R_Y(θ_i(z)) |0⟩^⊗15
```
where θ_i(z) = W_i^T z + b_i (style-based noise re-uploading at every layer).

**Distribution:** Fine-tuning + RL on coordinator (~150s total); sampling split across peers.

### 5.2 Stage 0: VQE with DMET Embedding

**Papers:** Anurag et al. 2026 (PMID 42017200) + Kirsopp et al. 2021 (arXiv:2110.08163)

**Algorithm:**
1. Check MongoDB cache by canonical fragment SMILES
2. On cache miss: 3D embed fragment (RDKit) + MMFF94 minimization
3. Compute molecular integrals (PySCF, STO-3G, frozen-core approximation)
4. DMET decomposition: impurity = binding-relevant atoms, bath = bulk
5. Build impurity Hamiltonian in second quantization
6. Z₂ tapering for symmetry reduction (~50% qubit reduction per Anurag et al.)
7. Jordan-Wigner mapping to qubit Hamiltonian
8. VQE: UCCSD ansatz, COBYLA optimizer, PennyLane `default.qubit`, 1024 shots
9. Extract: HOMO energy (eV), LUMO energy (eV), HOMO-LUMO gap (eV),
   chemical hardness η = (LUMO - HOMO)/2, ESP partial charges
10. Cache `VQEDescriptors` to MongoDB

**Qubit budget:** ~6-8 qubits/fragment (after DMET + Z₂ tapering, down from ~12).
**Runtime:** ~2s/fragment (down from ~5s with full Hamiltonian).

**AnsatzFactory pattern** (`pharma/ansatz_factory.py`):
```python
def build_ansatz(config: VQEConfig, n_qubits: int, n_electrons: int):
    if config.ansatz == AnsatzType.UCCSD:
        return qml.UCCSD(...)        # Active in V1
    elif config.ansatz == AnsatzType.LUCJ:
        return build_lucj_ansatz(...)  # V2 hardware path, config-ready
    elif config.ansatz == AnsatzType.HEA:
        return build_hea_ansatz(...)   # Hardware-efficient fallback
```

### 5.3 Stage 1: Lipinski + Electronic Filter

**Algorithm:** Pure Python + RDKit (runs on coordinator, no quantum).

**Criteria:**
- Lipinski Rule of Five: MW ≤ 500, LogP ≤ 5, HBD ≤ 5, HBA ≤ 10
- Electronic gate: HOMO-LUMO gap > 4 eV (stability), chemical hardness > 2 eV
- QED ≥ `config.target_properties.min_qed` (discovery mode)
- Max 1 Lipinski violation allowed (lenient for lead-like compounds)

**Throughput:** 100 RL-biased candidates → ~25 pass (vs ~15 without RL).

### 5.4 Stage 2: DC-QAOA Fragment Docking

**Papers:** Stavros et al. March 2025 + Yanagisawa et al. 2024 (PMID 38785647)

**Algorithm:**
1. Parse PDB → extract binding pocket grid (Biopython + 3D coordinate discretization)
2. For each fragment: enumerate placement sites (~10-20 grid positions)
3. Build QUBO matrix Q with 4 terms (Yanagisawa formulation):
   - Interaction: protein-fragment Van der Waals + electrostatic energy
   - Clash: fragment-fragment steric overlap penalty
   - Bond geometry: covalent bond constraint between adjacent fragments
   - One-hot: each fragment placed at exactly one site
4. QUBO → Ising conversion: x = (1-σ^z)/2
   - h_i = -Q_ii/2 - (1/2)Σ_{j≠i} Q_ij
   - J_ij = Q_ij/4
5. Counterdiabatic Hamiltonian (DC-QAOA, Stavros et al.):
   - H_CD = iα[H_M, H_C] / ||[H_M, H_C]||
6. DC-QAOA circuit (p=1 layer):
   - e^{-iγH_C} · e^{-iαH_CD} · e^{-iβH_M}
7. Optimize (β, γ, α) via COBYLA on PennyLane `default.qubit`
8. Measure → bitstring → decode to fragment placement
9. **Warm-start (iterative mode):** initialize (β, γ, α) from previous iteration

**Why DC-QAOA beats vanilla QAOA:** p=1 DC-QAOA achieves same approximation ratio as
p=3 vanilla QAOA because the counterdiabatic term H_CD suppresses diabatic transitions,
effectively compressing the adiabatic path. Validated on 14-17 node docking instances
(Stavros et al. 2025) — largest published docking instances as of this writing.

**Distribution:** Each fragment's QUBO is independent → 1 fragment per peer.
**Runtime:** ~5s/fragment (down from ~15s with vanilla p=3 QAOA).

### 5.5 Stage 3: VQC Binding Affinity Scoring

**Paper:** Choppara & Lokesh 2025 (PMID 40857188) — Q-BAFNet simplified

**Algorithm:**
1. Compute 2048-bit Morgan fingerprint for full ligand (RDKit)
2. PCA → 15 features (ligand representation)
3. Compute binding site fingerprint → 15 features (protein representation)
4. Concatenate → 30-feature input vector
5. Angle-encode: 15 qubits, R_Y(feature_i) · R_Z(feature_{i+15}) per qubit
6. 3 variational layers: parameterized single-qubit rotations + CNOT entangling
7. Measure ⟨Z₀⟩ → linear map to ΔG_bind (kcal/mol)
8. Shot noise → confidence interval:
   - σ² = Var(Z₀) = ⟨Z₀²⟩ - ⟨Z₀⟩²
   - CI = [μ - 1.96σ/√N, μ + 1.96σ/√N]

This is the first pipeline to expose shot-noise uncertainty as confidence intervals
(not as noise to suppress) — a novel contribution per spec Section 9.4.

**Pretrained weights:** `vqc_weights.npz` trained offline on Davis + KIBA datasets.
**Runtime:** ~5s/ligand (single peer — full ligand required, not distributable).

### 5.6 Stage 4: ADMET Gate + Scaffold Hopping

**Papers:** Lipinski 1997, Bickerton et al. 2012 (QED)

**ADMET evaluation (RDKit descriptors):**
- MW, LogP, TPSA, HBD, HBA, synthetic accessibility score
- QED score
- hERG risk flag: LogP > 3.5 AND MW > 400
- CYP450 soft spots: VQE HOMO electron density > 0.15 threshold on atom → vulnerable to CYP450 oxidation

**Scaffold hopping (on ADMET failure):**
1. Identify first failing criterion
2. BRICS decompose ligand → identify fragment contributing most to violation
3. Query RDKit fragment library for replacements:
   - Lower contribution to failing metric
   - Structural similarity Tanimoto > 0.6 (preserves scaffold identity)
   - Synthetic accessibility score < 6
4. Select top replacement, construct new SMILES (BRICS reassembly)
5. Create `ScaffoldIteration` record with warm-start parameters
6. Persist to `WorkflowRun.output_snapshot`
7. Transition to `REFINING`

---

## 6. API Surface (`api/routers/pharma.py`)

### 6.1 Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/pharma/submit` | POST | Submit optimization or discovery job |
| `/api/v1/pharma/jobs/{id}` | GET | Poll status + partial results |
| `/api/v1/pharma/jobs/{id}/result` | GET | Full result (COMPLETED only) |
| `/api/v1/pharma/jobs/{id}/cancel` | POST | Cancel running job |
| `/api/v1/pharma/cache/stats` | GET | Fragment cache hit rate, size, top fragments |
| `/api/v1/pharma/jobs` | GET | List jobs (paginated, filtered by mode/status) |

### 6.2 Request Schemas

**Optimization mode:**
```json
{
  "mode": "optimization",
  "target_pdb_id": "6LU7",
  "initial_ligand_smiles": "CC(C)Cc1ccc(cc1)C(C)C(O)=O",
  "max_iterations": 5,
  "iterative": true
}
```

**Discovery mode:**
```json
{
  "mode": "discovery",
  "target_pdb_id": "6LU7",
  "target_properties": {"max_molecular_weight": 500, "min_qed": 0.5},
  "candidate_count": 100
}
```

### 6.3 Job Status Response

```json
{
  "job_id": "pharma_abc123",
  "status": "running",
  "current_stage": "stage_2_docking",
  "progress_pct": 45,
  "fragments_total": 12,
  "fragments_completed": 5,
  "iteration": 0,
  "peer_assignments": {"frag_001": "peer_A", "frag_002": "peer_B"},
  "estimated_remaining_seconds": 45,
  "partial_results": {"vqe_descriptors_completed": 4}
}
```

---

## 7. Frontend Design

### 7.1 Route Structure

```
app/(main)/pharma/
  page.tsx                  # Submit form (optimize + discover tabs)
  [jobId]/page.tsx          # Full-width job detail / result page
  history/page.tsx          # Past jobs table with hover gradient

features/pharma/
  index.ts                  # Barrel exports
  types.ts                  # Frontend types (camelCase transforms)
  lib/
    pharma-transformers.ts  # snake_case → camelCase response transforms
    pharma-api.ts           # API client (submit, poll, result, cancel)
    moses-chart-data.ts     # MOSES metrics → Recharts RadarChart data
  hooks/
    use-pharma-submit.ts    # Mutation hook
    use-pharma-job.ts       # Polling hook (2s interval while running)
    use-pharma-result.ts    # Result fetch hook
  components/
    pharma-submit-form.tsx      # Tabbed form: Optimize / Discover
    molecule-card.tsx           # RDKit.js SVG + atom highlighting
    energy-level-diagram.tsx    # HOMO/LUMO horizontal bar visualization
    admet-radar-chart.tsx       # 6-axis Recharts RadarChart
    docking-affinity-card.tsx   # ΔG + confidence interval bar
    scaffold-timeline.tsx       # Horizontal iteration timeline
    moses-metrics-card.tsx      # MOSES benchmark metrics grid
    candidate-ranking-table.tsx # Top-K sortable candidates table
    fragment-distribution-map.tsx  # Peer → fragment assignment visual
    job-progress-tracker.tsx    # Horizontal stage stepper with live status
```

### 7.2 Visual Language (from DESIGN.md palette)

| Element | Color/Token | Hex |
|---|---|---|
| Page accent | `signature-forest` | `#0a2e0e` |
| LUMO energy bar | `signature-coral` | `#aa2d00` |
| HOMO energy bar | `signature-mint` | `#a8d8c4` |
| Scaffold timeline nodes | `signature-mustard` | `#d9a441` |
| ADMET pass | `success` | `#006400` |
| ADMET fail / hERG risk | `signature-coral` | `#aa2d00` |
| Card background | `canvas` | `#ffffff` |
| Card border | `hairline` | `#dddddd` |

### 7.3 Component Designs

**`MoleculeCard`**
- White canvas with `hairline` border — lab-report aesthetic
- RDKit.js 2D SVG structure (client-side SMILES rendering)
- Coral atom highlights on CYP450 soft spot indices
- SMILES string in monospace below depiction
- QED score pill badge (green > 0.6, amber 0.4-0.6, coral < 0.4)

**`EnergyLevelDiagram`**
- Two horizontal bars: HOMO (mint) and LUMO (coral)
- Gap annotation in eV with color coding: green > 6 eV, amber 4-6 eV, coral < 4 eV
- Chemical hardness value displayed below
- Compact: 200px × 120px

**`AdmetRadarChart`**
- 6 axes: MW, LogP, TPSA, HBD, HBA, Synthetic Accessibility
- Shaded ideal region (Lipinski space) in `surface-soft`
- Candidate values as `signature-forest` polygon overlay
- hERG risk warning badge below chart if triggered
- CYP450 soft spot count annotation
- Built with Recharts `RadarChart`

**`DockingAffinityCard`**
- Large number display: ΔG = -8.3 kcal/mol
- Confidence interval bar: [−8.7, −7.9] kcal/mol
- QAOA approximation ratio: gauge indicator (≥ 0.85 = green)
- Peer that computed this score shown as a small badge

**`ScaffoldTimeline`** (iterative mode only)
- Horizontal timeline: Molecule 1 → [fail reason] → Molecule 2 → ... → Success
- Each node: thumbnail SMILES abbreviation + iteration number
- Connection lines colored by failed ADMET criterion
- Final success node: forest-colored check mark

**`FragmentDistributionMap`**
- Peer nodes (A, B, C, D) as circles with fragment labels inside
- Dependency arrows between merge node and fragment nodes
- Per-peer runtime annotations

### 7.4 Submit Form

**Optimize tab:**
- Target PDB ID: text input with RCSB autocomplete
- Ligand SMILES: text input + live RDKit.js validation (red/green border feedback)
- Live 2D preview renders as you type
- Advanced (collapsible): QAOA layers, max iterations, VQE shots, ansatz choice

**Discover tab:**
- Target PDB ID: text input with RCSB autocomplete
- MW slider: 100–800 Da
- QED slider: 0.1–1.0
- LogP slider: -2–7
- Candidate count: number input (default 100)

### 7.5 Result Page Layout (Full-width — no max-w constraint)

```
┌──────────────────────────────────────────────────────────────────────┐
│ PageHeader: "Pharma Docking · Job abc123"         [Cancel] [Export]  │
├──────────────────────────────────────────────────────────────────────┤
│ JobProgressTracker (Stage -1 → 0 → 1 → 2 → 3 → 4 → Done)           │
├──────────────────────────────┬───────────────────────────────────────┤
│ MoleculeCard (rank 1)        │ DockingAffinityCard                   │
│ EnergyLevelDiagram           │ AdmetRadarChart                       │
├──────────────────────────────┴───────────────────────────────────────┤
│ ScaffoldTimeline (full-width — only shown if iterative mode ran)      │
├──────────────────────────────────────────────────────────────────────┤
│ CandidateRankingTable (top-K, sortable: affinity / QED / TPSA / SA)  │
├──────────────────────────────┬───────────────────────────────────────┤
│ FragmentDistributionMap      │ MOSESMetricsCard (discovery mode only) │
└──────────────────────────────┴───────────────────────────────────────┘
```

---

## 8. Dependencies

### 8.1 Backend (Python — new additions to pyproject.toml)

```toml
pennylane = ">=0.42.0"
pennylane-qiskit = ">=0.42.0"
qiskit = ">=1.3.0"
pyscf = ">=2.7.0"
rdkit = ">=2024.03"
openfermion = ">=1.6.0"
openfermionpyscf = ">=0.5"
torch = ">=2.4.0"
biopython = ">=1.84"
```

Note: `moses-bench` metrics will be implemented directly using RDKit (FCD via neural
fingerprints, SNN/Frag/Scaf via Tanimoto similarity) to avoid heavy training-dataset
dependency.

### 8.2 Frontend (new additions)

```json
"rdkit-js": "latest",
"recharts": "^2.x"
```

---

## 9. State Machine (WorkflowRunStatus additions)

```
SUBMITTED → PLANNING → RUNNING → AWAITING_FRAGMENTS → AGGREGATING
                                                            │
                                         ┌──────────────────┤
                                         │                  │
                                    ADMET passes       ADMET fails + iterative
                                         │                  │
                                    COMPLETED          REFINING ← NEW STATE
                                                            │
                                               scaffold hop + partial DAG rebuild
                                                            │
                                               RUNNING (warm-start DC-QAOA)
                                                            │
                                               loop → AWAITING_FRAGMENTS → AGGREGATING
                                                            │
                                               max_iterations exhausted?
                                                            │
                                               FAILED (per-criterion reasons)
```

The `REFINING` state persists `(β, γ, α)` and `ScaffoldIteration[]` history in
`WorkflowRun.output_snapshot`. `RuntimeRecoveryService` can resume from last completed
iteration on coordinator restart — no iteration progress is lost.

---

## 10. Competitive Landscape Summary

### 10.1 What Competitors Do (and Where They Stop)

| Competitor | What They Solve | Where They Stop |
|---|---|---|
| Quantinuum + Roche (2021) | VQE binding energy ranking (BACE1) | 1 stage, real hardware, no pipeline |
| Yanagisawa et al. (2024) | QUBO fragment docking, 1 ligand | 1 stage, no scoring, no ADMET |
| Stavros et al. (2025) | DC-QAOA docking, 14-17 nodes | 1 stage, biggest instances |
| Baglio et al. (2026) | QWGAN de novo generation | 1 stage, no docking, no scoring |
| QCA-MolGAN (2025) | QCBM + RL generation | 1 stage, better property alignment |
| Choppara & Lokesh (2025) | VQC affinity prediction | 1 stage, zero-shot superior |
| Qubit Pharmaceuticals | GPU/QM hybrid HPC platform | Centralized, 1 target at a time |

### 10.2 Our Unique Position

1. **Only full 6-stage chained quantum pipeline** in literature
2. **Only distributed P2P quantum drug discovery system** (libp2p fabric)
3. **Only ADMET-feedback → warm-start DC-QAOA iterative loop** (novel contribution)
4. **Only cross-job fragment descriptor cache** (platform-level quantum knowledge accumulation)
5. **Only dual-mode system** (optimize + discover in one platform)
6. **Only system exposing shot-noise as confidence intervals** (not suppressed as error)

### 10.3 Techniques Adopted From Competitors

| Technique | Source | Stage | Benefit |
|---|---|---|---|
| DC-QAOA (p=1) | Stavros et al. 2025 | Stage 2 | 3× faster vs vanilla p=3 QAOA |
| DMET embedding | Quantinuum/Roche 2021 | Stage 0 | ~50% qubit reduction |
| Multi-agent RL | QCA-MolGAN 2025 | Stage -1 | Higher ADMET pass rate (~25% vs 15%) |
| LUCJ ansatz (config-ready) | April 2026 FEP paper | Stage 0 | Future hardware path |
| MOSES benchmark metrics | Baglio et al. 2026 | Stage -1 output | Directly publishable results |

---

## 11. Revised Runtime Estimates

| Stage | Vanilla Implementation | With All 5 Techniques | Delta |
|---|---|---|---|
| Stage -1 (100 candidates) | ~120s | ~150s | +30s RL (saves waste downstream) |
| Stage 0 (per fragment, 15 ligands × 4 frags) | ~5s/frag → 300s | ~2s/frag → 120s | -180s |
| Stage 1 (filter) | ~2s | ~2s | — |
| Stage 2 (per fragment) | ~15s/frag → 225s | ~5s/frag → 75s | -150s |
| Stage 3 (per ligand × 15) | ~5s × 15 = 75s | ~5s × 15 = 75s | — |
| Stage 4 + scaffold hop | ~5s/iteration | ~3s/iteration (warm-start) | -2s |
| **Total (discovery)** | **~720-840s (12-14 min)** | **~420-480s (7-8 min)** | **~40% faster** |
| **Total (optimization, 3 hops)** | **~180-300s (3-5 min)** | **~90-150s (1.5-2.5 min)** | **~50% faster** |

Note: Discovery mode in the original spec claimed 5-7 min based on serial estimates.
With fragment-per-peer parallelism (4 peers), divide Stage 0 and Stage 2 times by 4:
- Stage 0 parallel: 120s / 4 = 30s wall time
- Stage 2 parallel: 75s / 4 = ~19s wall time
- **Actual wall time (discovery, 4 peers): ~3-4 minutes**

---

## 12. Validation References

| Algorithm | Paper | Validated System | Key Result |
|---|---|---|---|
| QUBO flexible docking | Yanagisawa et al. 2024, PMID 38785647 | Aldose reductase | RMSD 1.26Å |
| DC-QAOA docking | Stavros et al. March 2025, arXiv | 14-17 node instances | Exact binding solution |
| QM/MM docking refinement | Al-Ansi et al. 2024, PMID 38875526 | 121 PDB complexes | Near-native pose selection |
| VQE resource reduction | Anurag et al. 2026, PMID 42017200 | Drug-sized molecules | ~50% qubit reduction |
| VQC affinity prediction | Choppara & Lokesh 2025, PMID 40857188 | Davis/KIBA/Metz | Zero-shot superiority |
| QWGAN generation | Baglio et al. 2026, arXiv:2603.22399 | MOSES benchmark | 99.75% novelty, 100% validity |
| QCBM + RL generation | QCA-MolGAN 2025, arXiv | Drug-likeness | Enhanced property alignment |
| DMET + VQE binding | Kirsopp et al. 2021, arXiv:2110.08163 | BACE1 inhibitors | First real-hardware binding energy |

---

## 13. Scope Boundaries

### V1 (This Implementation)
- Both execution modes: optimization + discovery
- Iterative scaffold hopping with warm-start DC-QAOA
- DC-QAOA (p=1, counterdiabatic driving)
- DMET embedding for VQE
- Multi-agent RL for QWGAN property balancing
- MOSES-compatible benchmarking output
- Fragment descriptor cache (MongoDB, cross-job)
- Full frontend: submit form, job detail, history table
- Scientific aesthetic: MoleculeCard, EnergyLevelDiagram, AdmetRadarChart, ScaffoldTimeline
- AnsatzFactory with UCCSD active and LUCJ config-ready

### V2 (Deferred)
- Real quantum hardware (IBM/IonQ) via Qiskit Runtime
- LUCJ + SQD post-processing (noise-resilient, requires real hardware)
- D-Wave quantum annealing for QUBO
- Multi-target selectivity profiling
- 3D binding pose visualization (NGL Viewer)
- Distributed QUBO partitioning across peers (beyond embarrassingly parallel Stage 2)
- Grover search for virtual screening (libraries > 10K molecules)
- Quantum Amplitude Estimation for binding energy lower bounds
