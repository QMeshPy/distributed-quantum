"""Unit tests — Stage 1: Lipinski filter (requires VQEDescriptors)."""
from __future__ import annotations
import pytest

pytest.importorskip("rdkit", reason="Install the pharma extra to run chemistry tests")

from quantum_backend_v2.pharma.models import VQEDescriptors
from quantum_backend_v2.pharma.stages.stage_1 import FilterResult, LipinskiFilter


ASPIRIN     = "CC(=O)Oc1ccccc1C(=O)O"
IBUPROFEN   = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"
PARACETAMOL = "CC(=O)Nc1ccc(O)cc1"
INVALID     = "NOT_VALID!!!"


def make_desc(gap_ev: float = 8.0, hardness: float = 4.0) -> VQEDescriptors:
    return VQEDescriptors(
        fragment_id="F001",
        homo_energy_ev=-9.0, lumo_energy_ev=-1.0, homo_lumo_gap_ev=gap_ev,
        chemical_hardness_ev=hardness, esp_charges=[0.0, 0.1, -0.1],
        ground_state_energy_hartree=-230.0, qubit_count=6, gate_count=80,
        vqe_iterations=100,
    )


class TestLipinskiFilter:
    def setup_method(self):
        self.f = LipinskiFilter()
        self.good_desc = make_desc()

    def test_aspirin_passes(self):
        r = self.f.evaluate(ASPIRIN, self.good_desc)
        assert r.passes is True

    def test_ibuprofen_passes(self):
        r = self.f.evaluate(IBUPROFEN, self.good_desc)
        assert r.passes is True

    def test_paracetamol_passes(self):
        r = self.f.evaluate(PARACETAMOL, self.good_desc)
        assert r.passes is True

    def test_invalid_smiles_fails(self):
        r = self.f.evaluate(INVALID, self.good_desc)
        assert r.passes is False
        assert len(r.failure_reasons) > 0

    def test_low_homo_lumo_gap_fails(self):
        reactive_desc = make_desc(gap_ev=1.0, hardness=0.5)
        r = self.f.evaluate(ASPIRIN, reactive_desc)
        assert r.passes is False
        assert any("gap" in reason.lower() or "eV" in reason for reason in r.failure_reasons)

    def test_low_hardness_fails(self):
        soft_desc = make_desc(gap_ev=8.0, hardness=0.5)
        r = self.f.evaluate(ASPIRIN, soft_desc)
        assert r.passes is False

    def test_filter_result_type(self):
        r = self.f.evaluate(ASPIRIN, self.good_desc)
        assert isinstance(r, FilterResult)

    def test_mw_populated(self):
        r = self.f.evaluate(ASPIRIN, self.good_desc)
        assert r.molecular_weight > 0

    def test_logp_is_float(self):
        r = self.f.evaluate(IBUPROFEN, self.good_desc)
        assert isinstance(r.logp, float)

    def test_hbd_hba_non_negative(self):
        r = self.f.evaluate(ASPIRIN, self.good_desc)
        assert r.hbd >= 0
        assert r.hba >= 0

    def test_batch_filter(self):
        candidates = [
            (ASPIRIN, self.good_desc),
            (IBUPROFEN, self.good_desc),
            (INVALID, self.good_desc),
        ]
        passing = self.f.batch_filter(candidates)
        assert len(passing) == 2
        passed_smiles = [s for s, _ in passing]
        assert ASPIRIN in passed_smiles
        assert IBUPROFEN in passed_smiles

    def test_batch_filter_all_fail(self):
        reactive = make_desc(gap_ev=0.5, hardness=0.2)
        candidates = [(ASPIRIN, reactive), (IBUPROFEN, reactive)]
        passing = self.f.batch_filter(candidates)
        assert len(passing) == 0

    def test_aspirin_mw_approx(self):
        r = self.f.evaluate(ASPIRIN, self.good_desc)
        assert r.molecular_weight == pytest.approx(180.16, abs=0.5)
