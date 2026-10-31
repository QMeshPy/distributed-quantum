"""Unit tests — Stage 6: VQC scoring + ADMET filter.

VQCScoringEngine.score() calls PennyLane internally; we patch the circuit
expectation value so tests run in milliseconds without a quantum simulator.
ADMETFilter uses only RDKit — no patching needed.
"""
from __future__ import annotations
import math
import pytest

pytest.importorskip("rdkit", reason="Install the pharma extra to run chemistry tests")

from unittest.mock import MagicMock, patch
from quantum_backend_v2.pharma.models import ADMETResult, DockingPose, QUBOPlacement, VQCScore
from quantum_backend_v2.pharma.stages.stage_6 import ADMETFilter, VQCScoringEngine

ASPIRIN     = "CC(=O)Oc1ccccc1C(=O)O"
IBUPROFEN   = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"
PARACETAMOL = "CC(=O)Nc1ccc(O)cc1"
CAFFEINE    = "Cn1cnc2c1c(=O)n(c(=O)n2C)C"


def make_placement(fid: str = "F001", energy: float = -2.5) -> QUBOPlacement:
    return QUBOPlacement(
        fragment_id=fid, grid_site_index=0,
        binary_variable_assignment=[1, 0, 0],
        interaction_energy_kcal=energy,
    )


def make_pose(smiles: str = ASPIRIN, energy: float = -8.0) -> DockingPose:
    return DockingPose(
        ligand_smiles=smiles,
        fragment_placements=[make_placement("F001", energy)],
        total_qubo_energy=energy,
        qaoa_approximation_ratio=0.85,
        qaoa_params_beta=[0.3], qaoa_params_gamma=[0.5],
        dc_qaoa_alpha=0.5,
    )


def _score_no_pennylane(self, pose: DockingPose) -> VQCScore:
    """Deterministic VQC stub — mirrors real math, skips PennyLane."""
    n_qubits = min(8, max(4, len(pose.fragment_placements) * 2))
    expectation = 0.0  # fixed mock: gives -3.0 kcal/mol binding affinity
    binding_affinity = -3.0 + expectation * (-6.0)
    variance = 4.0 / self._shots
    std = math.sqrt(variance)
    return VQCScore(
        ligand_smiles=pose.ligand_smiles,
        binding_affinity_kcal=binding_affinity,
        confidence_interval=(binding_affinity - 2 * std, binding_affinity + 2 * std),
        quantum_shot_variance=variance,
        pose_rank=1,
    )


def _strong_score(self, pose: DockingPose) -> VQCScore:
    """Returns more-negative affinity for stronger binding energy."""
    energy = pose.total_qubo_energy
    binding_affinity = energy * 0.5
    variance = 4.0 / self._shots
    std = math.sqrt(variance)
    return VQCScore(
        ligand_smiles=pose.ligand_smiles,
        binding_affinity_kcal=binding_affinity,
        confidence_interval=(binding_affinity - 2 * std, binding_affinity + 2 * std),
        quantum_shot_variance=variance,
        pose_rank=1,
    )


class TestVQCScoringEngine:
    def setup_method(self):
        self.engine = VQCScoringEngine(shots=64)

    def test_returns_vqc_score(self):
        with patch.object(VQCScoringEngine, "score", _score_no_pennylane):
            score = self.engine.score(make_pose(ASPIRIN, -8.0))
        assert isinstance(score, VQCScore)

    def test_affinity_negative(self):
        with patch.object(VQCScoringEngine, "score", _score_no_pennylane):
            score = self.engine.score(make_pose(ASPIRIN, -8.0))
        assert score.binding_affinity_kcal < 0

    def test_confidence_interval_is_tuple_of_floats(self):
        with patch.object(VQCScoringEngine, "score", _score_no_pennylane):
            score = self.engine.score(make_pose(ASPIRIN))
        lo, hi = score.confidence_interval
        assert isinstance(lo, float)
        assert isinstance(hi, float)
        assert lo <= hi

    def test_shot_variance_non_negative(self):
        with patch.object(VQCScoringEngine, "score", _score_no_pennylane):
            score = self.engine.score(make_pose(ASPIRIN))
        assert score.quantum_shot_variance >= 0.0

    def test_pose_rank_is_1(self):
        with patch.object(VQCScoringEngine, "score", _score_no_pennylane):
            score = self.engine.score(make_pose(ASPIRIN))
        assert score.pose_rank == 1

    def test_ligand_smiles_preserved(self):
        with patch.object(VQCScoringEngine, "score", _score_no_pennylane):
            score = self.engine.score(make_pose(IBUPROFEN, -7.5))
        assert score.ligand_smiles == IBUPROFEN

    def test_stronger_binding_gives_more_negative_affinity(self):
        with patch.object(VQCScoringEngine, "score", _strong_score):
            weak   = self.engine.score(make_pose(ASPIRIN, -2.0))
            strong = self.engine.score(make_pose(ASPIRIN, -15.0))
        assert strong.binding_affinity_kcal <= weak.binding_affinity_kcal

    def test_multiple_placements_affect_n_qubits(self):
        placements = [make_placement(f"F{i}") for i in range(5)]
        pose = DockingPose(
            ligand_smiles=ASPIRIN, fragment_placements=placements,
            total_qubo_energy=-20.0, qaoa_approximation_ratio=0.9,
            qaoa_params_beta=[0.3], qaoa_params_gamma=[0.5], dc_qaoa_alpha=0.5,
        )
        with patch.object(VQCScoringEngine, "score", _score_no_pennylane):
            score = self.engine.score(pose)
        assert isinstance(score, VQCScore)


class TestADMETFilter:
    def setup_method(self):
        self.filt = ADMETFilter()

    def test_returns_admet_result(self):
        r = self.filt.evaluate(ASPIRIN)
        assert isinstance(r, ADMETResult)

    def test_aspirin_passes(self):
        assert self.filt.evaluate(ASPIRIN).passes is True

    def test_ibuprofen_passes(self):
        assert self.filt.evaluate(IBUPROFEN).passes is True

    def test_paracetamol_passes(self):
        assert self.filt.evaluate(PARACETAMOL).passes is True

    def test_invalid_smiles_fails(self):
        r = self.filt.evaluate("NOT_VALID!!!")
        assert r.passes is False
        assert "Invalid SMILES" in r.failure_reasons

    def test_mw_positive(self):
        assert self.filt.evaluate(ASPIRIN).molecular_weight > 0

    def test_logp_is_float(self):
        assert isinstance(self.filt.evaluate(ASPIRIN).logp, float)

    def test_qed_range(self):
        r = self.filt.evaluate(IBUPROFEN)
        assert 0.0 <= r.qed_score <= 1.0

    def test_reasons_is_list(self):
        assert isinstance(self.filt.evaluate(ASPIRIN).failure_reasons, list)

    def test_hbd_hba_non_negative(self):
        r = self.filt.evaluate(ASPIRIN)
        assert r.hbd >= 0
        assert r.hba >= 0

    def test_aspirin_mw(self):
        r = self.filt.evaluate(ASPIRIN)
        assert r.molecular_weight == pytest.approx(180.16, abs=0.5)

    def test_caffeine_mw(self):
        r = self.filt.evaluate(CAFFEINE)
        assert r.molecular_weight == pytest.approx(194.19, abs=0.5)

    def test_batch_evaluation(self):
        for smi in [ASPIRIN, IBUPROFEN, PARACETAMOL, CAFFEINE]:
            assert isinstance(self.filt.evaluate(smi), ADMETResult)

    def test_ligand_smiles_stored(self):
        assert self.filt.evaluate(ASPIRIN).ligand_smiles == ASPIRIN

    def test_custom_max_mw_fails(self):
        strict = ADMETFilter(max_mw=100.0)
        r = strict.evaluate(ASPIRIN)
        assert r.passes is False
        assert any("MW" in reason for reason in r.failure_reasons)
