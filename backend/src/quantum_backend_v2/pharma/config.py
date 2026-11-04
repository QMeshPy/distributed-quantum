"""Configuration models for the pharma docking pipeline."""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PharmaMode(str, Enum):
    OPTIMIZATION = "optimization"
    DISCOVERY = "discovery"


class AnsatzType(str, Enum):
    UCCSD = "uccsd"
    LUCJ = "lucj"   # V2 hardware path — config-ready, not active in V1
    HEA = "hea"     # Hardware-efficient fallback


class VQEConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ansatz: AnsatzType = AnsatzType.UCCSD
    embedding: Literal["full", "dmet"] = "dmet"
    basis_set: str = "sto-3g"
    active_orbitals: int = Field(default=4, ge=2, le=6)  # qubits = 2x this; 4 orbitals = 8 qubits
    shots: int = Field(default=1024, ge=1)
    optimizer: str = "cobyla"
    max_iterations: int = Field(default=200, ge=1)


class QAOAConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    layers: int = Field(default=1, ge=1)
    use_counterdiabatic: bool = True
    cd_alpha: float = Field(default=0.5, ge=0.0, le=2.0)
    optimizer: str = "cobyla"
    max_iterations: int = Field(default=150, ge=1)
    shots: int = Field(default=1024, ge=1)


class QWGANConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    num_qubits: int = Field(default=15, ge=4, le=25)
    latent_dim: int = Field(default=128, ge=16)
    entangling_layers: int = Field(default=3, ge=1)
    finetune_epochs: int = Field(default=15, ge=1)
    use_rl_agents: bool = True
    rl_objectives: list[str] = Field(default_factory=lambda: ["qed", "logp", "sa"])
    gradient_penalty_lambda: float = Field(default=10.0, ge=0.0)


class TargetProperties(BaseModel):
    model_config = ConfigDict(extra="forbid")
    max_molecular_weight: float = Field(default=500.0, ge=50.0)
    min_qed: float = Field(default=0.5, ge=0.0, le=1.0)
    max_logp: float = Field(default=5.0)
    custom_constraints: dict[str, Any] = Field(default_factory=dict)


class PharmaWorkflowConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: PharmaMode
    target_pdb_id: str = Field(min_length=3, max_length=10)
    initial_ligand_smiles: str | None = None
    target_properties: TargetProperties | None = None
    max_iterations: int = Field(default=5, ge=1, le=20)
    candidate_count: int = Field(default=100, ge=10, le=500)
    vqe: VQEConfig = Field(default_factory=VQEConfig)
    qaoa: QAOAConfig = Field(default_factory=QAOAConfig)
    qwgan: QWGANConfig = Field(default_factory=QWGANConfig)
    vqc_shots: int = Field(default=1024, ge=1)
    iterative: bool = True
