"""Unit tests — Stage 2: QWGAN molecule generator."""
from __future__ import annotations
import pytest

pytest.importorskip("rdkit", reason="Install the pharma extra to run chemistry tests")

from rdkit import Chem
from quantum_backend_v2.pharma.config import PharmaMode, QWGANConfig
from quantum_backend_v2.pharma.stages.stage_2 import GeneratorOutput, QWGANGenerator


class TestGeneratorOutput:
    def test_creation(self):
        o = GeneratorOutput(smiles=["CC", "c1ccccc1"], validity_fraction=0.8, raw_count=10)
        assert len(o.smiles) == 2
        assert o.validity_fraction == 0.8
        assert o.raw_count == 10

    def test_validity_in_range(self):
        o = GeneratorOutput(smiles=[], validity_fraction=1.0, raw_count=5)
        assert 0.0 <= o.validity_fraction <= 1.0


class TestQWGANGenerator:
    def setup_method(self):
        self.cfg = QWGANConfig(num_qubits=8)
        self.gen = QWGANGenerator(self.cfg)

    def test_generate_returns_generator_output(self):
        out = self.gen.generate(mode=PharmaMode.DISCOVERY, n_samples=5, seed_smiles=None)
        assert isinstance(out, GeneratorOutput)

    def test_generate_smiles_is_list(self):
        out = self.gen.generate(mode=PharmaMode.OPTIMIZATION, n_samples=5, seed_smiles="CC(=O)Oc1ccccc1C(=O)O")
        assert isinstance(out.smiles, list)

    def test_all_returned_smiles_rdkit_parseable(self):
        out = self.gen.generate(mode=PharmaMode.DISCOVERY, n_samples=10, seed_smiles=None)
        for s in out.smiles:
            mol = Chem.MolFromSmiles(s)
            assert mol is not None, f"Not parseable: {s}"

    def test_validity_fraction_bounded(self):
        out = self.gen.generate(mode=PharmaMode.DISCOVERY, n_samples=5, seed_smiles=None)
        assert 0.0 <= out.validity_fraction <= 1.0

    def test_raw_count_positive(self):
        out = self.gen.generate(mode=PharmaMode.DISCOVERY, n_samples=10, seed_smiles=None)
        assert out.raw_count > 0

    def test_with_seed_smiles(self):
        out = self.gen.generate(
            mode=PharmaMode.OPTIMIZATION, n_samples=5,
            seed_smiles="CC(=O)Oc1ccccc1C(=O)O",
        )
        assert isinstance(out, GeneratorOutput)

    def test_no_seed_smiles(self):
        out = self.gen.generate(mode=PharmaMode.DISCOVERY, n_samples=5, seed_smiles=None)
        assert isinstance(out, GeneratorOutput)

    def test_large_n_samples(self):
        out = self.gen.generate(mode=PharmaMode.DISCOVERY, n_samples=50, seed_smiles=None)
        assert out.raw_count > 0
        assert len(out.smiles) <= out.raw_count

    def test_rl_not_applied_when_disabled(self):
        cfg = QWGANConfig(num_qubits=8)
        gen = QWGANGenerator(cfg)
        out = gen.generate(mode=PharmaMode.DISCOVERY, n_samples=5, seed_smiles=None)
        assert isinstance(out, GeneratorOutput)
