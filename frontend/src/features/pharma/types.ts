export type PharmaMode = "optimization" | "discovery";

export type PharmaJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface PharmaSubmitPayload {
  mode: PharmaMode;
  target_pdb_id: string;
  initial_ligand_smiles?: string;
  max_iterations?: number;
  candidate_count?: number;
}

export interface PharmaSubmitResponse {
  job_id: string;
  status: string;
  submitted_at: string;
}

export interface ADMETResult {
  ligand_smiles: string;
  molecular_weight: number;
  logp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  synthetic_accessibility: number;
  qed_score: number;
  lipinski_violations: number;
  herg_risk: boolean;
  passes: boolean;
  failure_reasons: string[];
}

export interface VQCScore {
  ligand_smiles: string;
  binding_affinity_kcal: number;
  confidence_interval: [number, number];
  quantum_shot_variance: number;
  pose_rank: number;
}

export interface QUBOPlacement {
  fragment_id: string;
  grid_site_index: number;
  binary_variable_assignment: number[];
  interaction_energy_kcal: number;
  clash_penalty: number;
  bond_geometry_penalty: number;
}

export interface DockingPose {
  ligand_smiles: string;
  fragment_placements: QUBOPlacement[];
  total_qubo_energy: number;
  rmsd_angstrom: number | null;
  qaoa_approximation_ratio: number;
  dc_qaoa_alpha: number;
  qaoa_params_beta: number[];
  qaoa_params_gamma: number[];
}

export interface ScaffoldIteration {
  iteration: number;
  input_smiles: string;
  output_smiles: string;
  reason_for_hop: string;
  replacement_fragment_smiles: string;
}

export interface VQEDescriptor {
  fragment_id: string;
  homo_energy_ev: number;
  lumo_energy_ev: number;
  homo_lumo_gap_ev: number;
  chemical_hardness_ev: number;
  ground_state_energy_hartree: number;
  exact_energy_hartree: number | null;
  vqe_starts: number;
  qubit_count: number;
  gate_count: number;
  vqe_iterations: number;
  cached: boolean;
}

export interface MOSESMetrics {
  fcd: number;
  snn: number;
  frag: number;
  scaf: number;
  int_div: number;
  filters: number;
  novelty: number;
  validity: number;
}

export interface PharmaCandidate {
  rank: number;
  smiles: string;
  docking_pose: DockingPose;
  vqc_score: VQCScore;
  admet: ADMETResult;
  descriptors: VQEDescriptor[];
  scaffold_history: ScaffoldIteration[];
}

export interface PharmaJobResult {
  mode: PharmaMode;
  target_pdb_id: string;
  candidates: PharmaCandidate[];
  moses_metrics?: MOSESMetrics;
  total_runtime_seconds: number;
  cache_hit_rate: number;
  iterations_used: number;
  fragments_distributed: Record<string, string>;
}


export type PipelineLogLevel = "stage" | "iter" | "vqe" | "score" | "admet" | "refine" | "success" | "error" | "info";

export interface PipelineLogEntry {
  ts: string;
  level: PipelineLogLevel;
  stage: string | null;
  message: string;
}
export interface PharmaJob {
  job_id: string;
  status: PharmaJobStatus;
  state: string;
  mode: PharmaMode;
  target_pdb_id: string;
  submitted_at: string;
  completed_at?: string;
  result?: PharmaJobResult;
  error?: string;
  log_lines?: PipelineLogEntry[];
}
