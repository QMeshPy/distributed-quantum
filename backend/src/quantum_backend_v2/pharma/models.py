"""Pharma domain models — fragments, descriptors, docking, scoring, ADMET."""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from quantum_backend_v2.pharma.config import PharmaMode


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class MolecularFragment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fragment_id: str
    smiles: str
    parent_ligand_smiles: str
    atom_indices: tuple[int, ...]
    adjacent_fragments: tuple[str, ...]
    rotatable_bonds: int = Field(default=0, ge=0)


class VQEDescriptors(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fragment_id: str
    homo_energy_ev: float
    lumo_energy_ev: float
    homo_lumo_gap_ev: float
    chemical_hardness_ev: float
    esp_charges: list[float]
    ground_state_energy_hartree: float
    qubit_count: int = Field(ge=1)
    gate_count: int = Field(ge=1)
    vqe_iterations: int = Field(ge=1)
    cached: bool = False
    dmet_impurity_size: int | None = None
    exact_energy_hartree: float | None = None  # exact ground energy of the same active space
    vqe_starts: int = Field(default=1, ge=1)  # independent VQE runs; the lowest energy is reported
    computed_at: datetime = Field(default_factory=_utc_now)


class QUBOPlacement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fragment_id: str
    grid_site_index: int = Field(ge=0)
    binary_variable_assignment: list[int]
    interaction_energy_kcal: float
    clash_penalty: float = Field(default=0.0, ge=0.0)
    bond_geometry_penalty: float = Field(default=0.0, ge=0.0)


class DockingPose(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ligand_smiles: str
    fragment_placements: list[QUBOPlacement]
    total_qubo_energy: float
    rmsd_angstrom: float | None = None
    qaoa_approximation_ratio: float = Field(ge=0.0, le=1.0)
    qaoa_params_beta: list[float]
    qaoa_params_gamma: list[float]
    dc_qaoa_alpha: float


class VQCScore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ligand_smiles: str
    binding_affinity_kcal: float
    confidence_interval: tuple[float, float]
    quantum_shot_variance: float = Field(ge=0.0)
    pose_rank: int = Field(ge=1)


class ADMETResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ligand_smiles: str
    molecular_weight: float
    logp: float
    tpsa: float
    hbd: int = Field(ge=0)
    hba: int = Field(ge=0)
    synthetic_accessibility: float
    qed_score: float = Field(ge=0.0, le=1.0)
    lipinski_violations: int = Field(ge=0)
    herg_risk: bool
    cyp450_soft_spots: list[int]
    passes: bool
    failure_reasons: list[str]


class ScaffoldIteration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    iteration: int = Field(ge=0)
    input_smiles: str
    output_smiles: str
    reason_for_hop: str
    replaced_fragment_id: str
    replacement_fragment_smiles: str
    warm_start_beta: list[float]
    warm_start_gamma: list[float]


class MOSESMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fcd: float        # Fréchet ChemNet Distance (lower is better)
    snn: float        # Similarity to Nearest Neighbor
    frag: float       # Fragment similarity
    scaf: float       # Scaffold similarity
    int_div: float    # Internal diversity
    filters: float    # % passing MCF + PAINS filters
    novelty: float    # % not in training set
    validity: float   # % chemically valid SMILES


class PharmaCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rank: int = Field(ge=1)
    smiles: str
    docking_pose: DockingPose
    vqc_score: VQCScore
    admet: ADMETResult
    descriptors: list[VQEDescriptors]
    scaffold_history: list[ScaffoldIteration] = Field(default_factory=list)


class PharmaJobResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: PharmaMode
    target_pdb_id: str
    candidates: list[PharmaCandidate]
    moses_metrics: MOSESMetrics | None = None
    total_runtime_seconds: float = Field(ge=0.0)
    cache_hit_rate: float = Field(ge=0.0, le=1.0)
    iterations_used: int = Field(ge=0)
    fragments_distributed: dict[str, str] = Field(default_factory=dict)
