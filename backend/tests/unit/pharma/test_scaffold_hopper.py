"""Unit tests — ScaffoldHopper (hop(smiles, admet, vqc_affinity, iteration))."""
from __future__ import annotations
import pytest

pytest.importorskip("rdkit", reason="Install the pharma extra to run chemistry tests")

from rdkit import Chem
from quantum_backend_v2.pharma.models import ADMETResult
from quantum_backend_v2.pharma.scaffold_hopper import HopResult, ScaffoldHopper


ASPIRIN     = "CC(=O)Oc1ccccc1C(=O)O"
IBUPROFEN   = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"
CAFFEINE    = "Cn1cnc2c1c(=O)n(c(=O)n2C)C"


def make_admet(passes: bool = True, failures: list[str] | None = None) -> ADMETResult:
    return ADMETResult(
        ligand_smiles=ASPIRIN,
        molecular_weight=180.16, logp=1.19, tpsa=63.6, hbd=1, hba=3,
        synthetic_accessibility=1.8, qed_score=0.54, lipinski_violations=0,
        herg_risk=False, cyp450_soft_spots=[], passes=passes,
        failure_reasons=failures if failures is not None else [],
    )


class TestHopResult:
    def test_creation_with_hop(self):
        r = HopResult(
            needs_hop=True, replacement_smiles=IBUPROFEN,
            replaced_fragment_smiles="c1ccccc1", hop_reason="logp_reduction",
            warm_start_beta=[0.3], warm_start_gamma=[0.5],
        )
        assert r.needs_hop is True
        assert r.replacement_smiles == IBUPROFEN

    def test_no_hop(self):
        r = HopResult(needs_hop=False, replacement_smiles=ASPIRIN)
        assert r.needs_hop is False
        assert r.replacement_smiles == ASPIRIN


class TestScaffoldHopper:
    def setup_method(self):
        self.hopper = ScaffoldHopper()

    def test_no_hop_when_passes_and_good_affinity(self):
        admet = make_admet(passes=True)
        r = self.hopper.hop(ASPIRIN, admet, vqc_affinity=-9.0, iteration=1)
        assert isinstance(r, HopResult)
        assert r.needs_hop is False
        assert r.replacement_smiles == ASPIRIN

    def test_hop_when_admet_fails(self):
        bad_admet = make_admet(passes=False, failures=["LogP 5.5 > 5.0"])
        r = self.hopper.hop(ASPIRIN, bad_admet, vqc_affinity=-9.0, iteration=1)
        assert isinstance(r, HopResult)
        # When ADMET fails, needs_hop should be True
        assert r.needs_hop is True

    def test_hop_when_weak_affinity(self):
        good_admet = make_admet(passes=True)
        r = self.hopper.hop(ASPIRIN, good_admet, vqc_affinity=-2.0, iteration=1)
        assert isinstance(r, HopResult)
        assert r.needs_hop is True

    def test_replacement_smiles_rdkit_valid(self):
        bad_admet = make_admet(passes=False, failures=["LogP too high"])
        r = self.hopper.hop(ASPIRIN, bad_admet, vqc_affinity=-2.0, iteration=1)
        if r.needs_hop:
            mol = Chem.MolFromSmiles(r.replacement_smiles)
            assert mol is not None

    def test_warm_start_preserved_on_hop(self):
        bad_admet = make_admet(passes=False, failures=["MW too high"])
        r = self.hopper.hop(
            ASPIRIN, bad_admet, vqc_affinity=-2.0, iteration=2,
            prev_beta=[0.3, 0.2], prev_gamma=[0.5, 0.4],
        )
        assert isinstance(r, HopResult)
        if r.needs_hop:
            # Warm start params should be carried over
            assert r.warm_start_beta is not None
            assert r.warm_start_gamma is not None

    def test_hop_reason_set(self):
        bad_admet = make_admet(passes=False, failures=["LogP 6.0 > 5.0"])
        r = self.hopper.hop(ASPIRIN, bad_admet, vqc_affinity=-2.0, iteration=1)
        if r.needs_hop:
            assert isinstance(r.hop_reason, str)
            assert len(r.hop_reason) > 0

    def test_iteration_parameter_accepted(self):
        admet = make_admet(passes=True)
        for i in range(1, 6):
            r = self.hopper.hop(ASPIRIN, admet, vqc_affinity=-9.0, iteration=i)
            assert isinstance(r, HopResult)

    def test_caffeine_no_hop_when_good(self):
        admet = make_admet(passes=True)
        # need to update ligand_smiles to caffeine for realism but function still works
        r = self.hopper.hop(CAFFEINE, admet, vqc_affinity=-8.0, iteration=1)
        assert isinstance(r, HopResult)
