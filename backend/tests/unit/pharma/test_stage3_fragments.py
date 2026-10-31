"""Unit tests — Stage 3: BRICS fragment decomposer."""
from __future__ import annotations
import pytest

pytest.importorskip("rdkit", reason="Install the pharma extra to run chemistry tests")

from rdkit import Chem
from quantum_backend_v2.pharma.models import MolecularFragment
from quantum_backend_v2.pharma.stages.stage_3 import FragmentDecomposer


ASPIRIN     = "CC(=O)Oc1ccccc1C(=O)O"
IBUPROFEN   = "CC(C)Cc1ccc(cc1)C(C)C(=O)O"
BENZENE     = "c1ccccc1"
TAXOL_LIKE  = "O=C(O)c1ccccc1NC(=O)c1ccccc1"


class TestFragmentDecomposer:
    def setup_method(self):
        self.d = FragmentDecomposer()

    def test_decompose_returns_list(self):
        frags = self.d.decompose(ASPIRIN)
        assert isinstance(frags, list)

    def test_returns_molecular_fragments(self):
        frags = self.d.decompose(ASPIRIN)
        for f in frags:
            assert isinstance(f, MolecularFragment)

    def test_fragment_ids_unique(self):
        frags = self.d.decompose(IBUPROFEN)
        ids = [f.fragment_id for f in frags]
        assert len(ids) == len(set(ids))

    def test_fragment_smiles_non_empty(self):
        frags = self.d.decompose(ASPIRIN)
        for f in frags:
            assert f.smiles != ""

    def test_fragment_smiles_parseable(self):
        frags = self.d.decompose(IBUPROFEN)
        for f in frags:
            mol = Chem.MolFromSmiles(f.smiles)
            assert mol is not None, f"Not parseable: {f.smiles}"

    def test_parent_ligand_smiles_set(self):
        frags = self.d.decompose(ASPIRIN)
        for f in frags:
            assert f.parent_ligand_smiles == ASPIRIN

    def test_rotatable_bonds_non_negative(self):
        frags = self.d.decompose(IBUPROFEN)
        for f in frags:
            assert f.rotatable_bonds >= 0

    def test_at_least_one_fragment(self):
        frags = self.d.decompose(ASPIRIN)
        assert len(frags) >= 1

    def test_taxol_like_no_crash(self):
        frags = self.d.decompose(TAXOL_LIKE)
        assert isinstance(frags, list)
        assert len(frags) >= 1

    def test_invalid_smiles_raises(self):
        with pytest.raises(ValueError, match="Invalid SMILES"):
            self.d.decompose("NOT_VALID!!!")

    def test_benzene_fallback(self):
        # Benzene cannot BRICS-split further; should return itself as fallback
        frags = self.d.decompose(BENZENE)
        assert len(frags) >= 1

    def test_batch_decompose(self):
        for smi in [ASPIRIN, IBUPROFEN, BENZENE, TAXOL_LIKE]:
            frags = self.d.decompose(smi)
            assert isinstance(frags, list)
            assert len(frags) >= 1
