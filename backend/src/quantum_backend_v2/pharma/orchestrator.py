"""PharmaOrchestrator: state machine coordinating all 6 stages + iterative loop."""
from __future__ import annotations

import logging
import time
from enum import Enum
from typing import Any, Callable

import numpy as np

from quantum_backend_v2.pharma.cache import FragmentCache
from quantum_backend_v2.pharma.config import PharmaMode, PharmaWorkflowConfig
from quantum_backend_v2.pharma.models import (
    DockingPose,
    MolecularFragment,
    PharmaCandidate,
    PharmaJobResult,
    ScaffoldIteration,
    VQEDescriptors,
)
from quantum_backend_v2.pharma.scaffold_hopper import ScaffoldHopper
from quantum_backend_v2.pharma.stages.stage_1 import LipinskiFilter
from quantum_backend_v2.pharma.stages.stage_2 import QWGANGenerator
from quantum_backend_v2.pharma.stages.stage_3 import FragmentDecomposer
from quantum_backend_v2.pharma.stages.stage_4 import VQEExecutor
from quantum_backend_v2.pharma.stages.stage_5 import QAOADockingOptimizer
from quantum_backend_v2.pharma.stages.stage_6 import ADMETFilter, VQCScoringEngine

logger = logging.getLogger(__name__)


class PharmaState(str, Enum):
    IDLE = "idle"
    FILTERING = "filtering"
    GENERATING = "generating"
    FRAGMENTING = "fragmenting"
    VQE_COMPUTING = "vqe_computing"
    DOCKING = "docking"
    SCORING = "scoring"
    REFINING = "refining"
    COMPLETED = "completed"
    FAILED = "failed"


class PharmaOrchestrator:
    """Coordinates the 6-stage quantum pharma pipeline with iterative loop."""

    def __init__(
        self,
        config: PharmaWorkflowConfig,
        cache: FragmentCache | None,
        execution_service: Any | None,
        log_callback: Callable[[str, str, str | None], None] | None = None,
        live_callback: Callable[..., None] | None = None,
    ) -> None:
        self._cfg = config
        self._cache = cache or FragmentCache(mongo_runtime=None)
        self._execution_service = execution_service
        self._log = log_callback or (lambda level, msg, stage=None: None)
        self._live = live_callback or (lambda **kw: None)
        self.state = PharmaState.IDLE
        self._job_id: str = ""
        self._scaffold_history: list[ScaffoldIteration] = []
        self._candidates: list[PharmaCandidate] = []
        self._start_time: float = 0.0
        self._fragments_distributed: dict[str, str] = {}

        # Stage instances
        self._filter = LipinskiFilter()
        self._generator = QWGANGenerator(config.qwgan)
        self._decomposer = FragmentDecomposer()
        self._vqe_executor = VQEExecutor(config.vqe, self._cache)
        self._docking = QAOADockingOptimizer(config.qaoa)
        self._scorer = VQCScoringEngine(shots=config.vqc_shots)
        self._admet = ADMETFilter()
        self._hopper = ScaffoldHopper()

    async def run(self, job_id: str) -> PharmaJobResult:
        self._job_id = job_id
        self._start_time = time.monotonic()
        self._scaffold_history = []
        self._candidates = []

        try:
            await self._run_stage_1()
            candidate_smiles = await self._run_stage_2()

            prev_beta: list[float] | None = None
            prev_gamma: list[float] | None = None
            fragments: list[MolecularFragment] = []
            descriptors: dict[str, VQEDescriptors] = {}
            docking_result = None
            vqc_score = None
            admet_result = None

            for iteration in range(self._cfg.max_iterations):
                logger.info("[%s] Iteration %d/%d", job_id, iteration + 1, self._cfg.max_iterations)
                self._log("iter", f"Iteration {iteration + 1}/{self._cfg.max_iterations}", "iteration")
                self._live(iteration=iteration + 1)

                fragments, descriptors = await self._run_stages_3_4(candidate_smiles)
                docking_result = await self._run_stage_5(
                    fragments, descriptors, prev_beta, prev_gamma
                )
                vqc_score, admet_result = await self._run_stage_6(
                    candidate_smiles[0] if candidate_smiles else "", docking_result
                )

                if docking_result:
                    prev_beta = docking_result.beta_params
                    prev_gamma = docking_result.gamma_params

                if self._check_convergence(vqc_score, admet_result):
                    logger.info("[%s] Converged at iteration %d", job_id, iteration + 1)
                    self._log("success", f"Converged at iteration {iteration + 1} — binding affinity threshold met", "iteration")
                    break

                if self._cfg.iterative and iteration < self._cfg.max_iterations - 1 and admet_result:
                    self.state = PharmaState.REFINING
                    self._live(stage="refining")
                    hop = self._hopper.hop(
                        smiles=candidate_smiles[0] if candidate_smiles else "",
                        admet=admet_result,
                        vqc_affinity=vqc_score.binding_affinity_kcal if vqc_score else -3.0,
                        iteration=iteration,
                        prev_beta=prev_beta,
                        prev_gamma=prev_gamma,
                    )
                    self._log("refine", f"Scaffold hopper: evaluating hop from current scaffold", "refining")
                    if hop.needs_hop:
                        self._scaffold_history.append(
                            ScaffoldIteration(
                                iteration=iteration,
                                input_smiles=candidate_smiles[0] if candidate_smiles else "",
                                output_smiles=hop.replacement_smiles,
                                reason_for_hop=hop.hop_reason,
                                replaced_fragment_id="",
                                replacement_fragment_smiles=hop.replaced_fragment_smiles,
                                warm_start_beta=hop.warm_start_beta or [],
                                warm_start_gamma=hop.warm_start_gamma or [],
                            )
                        )
                        self._log("refine", f"  Hop → {hop.replacement_smiles[:48] if len(hop.replacement_smiles)>48 else hop.replacement_smiles}  reason: {hop.hop_reason}", "refining")
                        candidate_smiles = [hop.replacement_smiles] + candidate_smiles[1:]

            self._build_candidates(descriptors, docking_result, vqc_score, admet_result, candidate_smiles)
            self.state = PharmaState.COMPLETED
            return self._build_result()

        except Exception as exc:
            self.state = PharmaState.FAILED
            logger.exception("[%s] Pipeline failed: %s", job_id, exc)
            raise

    async def _run_stage_1(self) -> None:
        self.state = PharmaState.FILTERING
        self._log("stage", "Stage 1 — Lipinski filter: validating seed scaffold", "filtering")
        self._live(stage="filtering")
        if self._cfg.mode == PharmaMode.OPTIMIZATION and self._cfg.initial_ligand_smiles:
            from quantum_backend_v2.pharma.models import VQEDescriptors

            dummy = VQEDescriptors(
                fragment_id="seed",
                homo_energy_ev=-6.0, lumo_energy_ev=-1.0,
                homo_lumo_gap_ev=5.0, chemical_hardness_ev=2.5,
                esp_charges=[], ground_state_energy_hartree=-200.0,
                qubit_count=4, gate_count=50, vqe_iterations=10,
            )
            result = self._filter.evaluate(self._cfg.initial_ligand_smiles, dummy)
            if not result.passes:
                logger.warning("[%s] Seed ligand pre-filter: %s", self._job_id, result.failure_reasons)

    async def _run_stage_2(self) -> list[str]:
        self.state = PharmaState.GENERATING
        self._log("stage", f"Stage 2 — QWGAN: generating candidate pool (mode={self._cfg.mode.value})", "generating")
        self._live(stage="generating")
        if self._cfg.mode == PharmaMode.OPTIMIZATION and self._cfg.initial_ligand_smiles:
            return [self._cfg.initial_ligand_smiles]
        out = self._generator.generate(
            mode=self._cfg.mode,
            n_samples=self._cfg.candidate_count,
            seed_smiles=self._cfg.initial_ligand_smiles,
        )
        return out.smiles[: self._cfg.candidate_count]

    async def _run_stages_3_4(
        self, candidate_smiles: list[str]
    ) -> tuple[list[MolecularFragment], dict[str, VQEDescriptors]]:
        self.state = PharmaState.FRAGMENTING
        self._log("stage", f"Stage 3 — fragment decomposition: {candidate_smiles[0][:40] if candidate_smiles else 'n/a'}", "fragmenting")
        self._live(stage="fragmenting")
        ligand = candidate_smiles[0] if candidate_smiles else "c1ccccc1"
        fragments = self._decomposer.decompose(ligand)

        self.state = PharmaState.VQE_COMPUTING
        self._live(stage="vqe_computing")
        descriptors: dict[str, VQEDescriptors] = {}
        for i, frag in enumerate(fragments):
            logger.info("[%s] VQE %d/%d: %s", self._job_id, i + 1, len(fragments), frag.fragment_id)
            self._log("vqe", f"Stage 4 — VQE {i + 1}/{len(fragments)}: computing HOMO-LUMO gap for {frag.fragment_id} ({frag.smiles[:28] if len(frag.smiles) > 28 else frag.smiles})", "vqe_computing")
            result = await self._vqe_executor.run(frag)
            descriptors[frag.fragment_id] = result.to_descriptors()
            self._fragments_distributed[frag.fragment_id] = "local"
            cache_note = " [cache hit]" if result.cached else f" gap={result.to_descriptors().homo_lumo_gap_ev:.2f} eV, qubits={result.to_descriptors().qubit_count}"
            self._log("vqe", f"  HOMO-LUMO{cache_note}", "vqe_computing")
            if not result.cached:
                await self._cache.put(frag.smiles, result.to_descriptors(), self._job_id)

        return fragments, descriptors

    async def _run_stage_5(
        self,
        fragments: list[MolecularFragment],
        descriptors: dict[str, VQEDescriptors],
        prev_beta: list[float] | None,
        prev_gamma: list[float] | None,
    ) -> Any:
        self.state = PharmaState.DOCKING
        self._log("stage", f"Stage 5 — QAOA docking: placing {len(fragments)} fragment(s) on binding grid", "docking")
        self._live(stage="docking")
        n_sites = max(len(fragments), 3)
        clash = np.zeros((n_sites, n_sites))
        binding_grid = np.zeros((n_sites, n_sites, 3, 3))
        return self._docking.dock(
            fragments=fragments,
            descriptors=descriptors,
            binding_site_grid=binding_grid,
            clash_matrix=clash,
            warm_start_beta=prev_beta,
            warm_start_gamma=prev_gamma,
        )

    async def _run_stage_6(self, smiles: str, docking_result: Any) -> tuple:
        self.state = PharmaState.SCORING
        self._log("stage", "Stage 6 — VQC scoring + ADMET filter", "scoring")
        self._live(stage="scoring")
        if docking_result is None or not smiles:
            return None, None
        pose = DockingPose(
            ligand_smiles=smiles,
            fragment_placements=docking_result.placements,
            total_qubo_energy=docking_result.total_energy,
            qaoa_approximation_ratio=docking_result.approximation_ratio,
            qaoa_params_beta=docking_result.beta_params,
            qaoa_params_gamma=docking_result.gamma_params,
            dc_qaoa_alpha=docking_result.dc_alpha,
        )
        vqc_score = self._scorer.score(pose)
        admet_result = self._admet.evaluate(smiles)
        if vqc_score:
            self._log("score", f"  Binding affinity: {vqc_score.binding_affinity_kcal:.2f} kcal/mol  confidence [{vqc_score.confidence_interval[0]:.2f}, {vqc_score.confidence_interval[1]:.2f}]  SMILES:{smiles}", "scoring")
            self._live(smiles=smiles, score=vqc_score.binding_affinity_kcal)
        if admet_result:
            self._log("admet", f"  ADMET {'PASS' if admet_result.passes else 'FAIL'} — MW={admet_result.molecular_weight:.1f}  LogP={admet_result.logp:.2f}  QED={admet_result.qed_score:.3f}  SA={admet_result.synthetic_accessibility:.2f}", "scoring")
            if admet_result.passes:
                self._live(admet_pass=True)
        return vqc_score, admet_result

    def _check_convergence(self, vqc_score: Any, admet_result: Any) -> bool:
        if vqc_score is None or admet_result is None:
            return False
        return admet_result.passes and vqc_score.binding_affinity_kcal < -7.0

    def _build_candidates(
        self,
        descriptors: dict[str, VQEDescriptors],
        docking_result: Any,
        vqc_score: Any,
        admet_result: Any,
        smiles_list: list[str],
    ) -> None:
        if not (vqc_score and admet_result and smiles_list and docking_result):
            return
        pose = DockingPose(
            ligand_smiles=smiles_list[0],
            fragment_placements=docking_result.placements,
            total_qubo_energy=docking_result.total_energy,
            qaoa_approximation_ratio=docking_result.approximation_ratio,
            qaoa_params_beta=docking_result.beta_params,
            qaoa_params_gamma=docking_result.gamma_params,
            dc_qaoa_alpha=docking_result.dc_alpha,
        )
        self._candidates = [
            PharmaCandidate(
                rank=1,
                smiles=smiles_list[0],
                docking_pose=pose,
                vqc_score=vqc_score,
                admet=admet_result,
                descriptors=list(descriptors.values()),
                scaffold_history=self._scaffold_history,
            )
        ]

    def _build_result(self) -> PharmaJobResult:
        elapsed = time.monotonic() - self._start_time
        total_frags = len(self._fragments_distributed)
        cached_frags = sum(
            1
            for c in self._candidates
            for d in c.descriptors
            if d.cached
        )
        return PharmaJobResult(
            mode=self._cfg.mode,
            target_pdb_id=self._cfg.target_pdb_id,
            candidates=self._candidates,
            total_runtime_seconds=elapsed,
            cache_hit_rate=cached_frags / total_frags if total_frags > 0 else 0.0,
            iterations_used=len(self._scaffold_history) + 1,
            fragments_distributed=self._fragments_distributed,
        )
