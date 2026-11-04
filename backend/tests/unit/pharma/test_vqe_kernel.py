"""VQE kernel: the problem a coordinator builds and the energy a peer finds must be physically right."""

from __future__ import annotations

import json

import pytest

from quantum_backend_v2.pharma.vqe_kernel import build_vqe_problem, run_vqe

CHEMICAL_ACCURACY_HARTREE = 1.6e-3


@pytest.fixture(scope="module")
def h2():
    return build_vqe_problem("[H][H]")


def test_problem_is_plain_json_a_peer_without_pyscf_can_use(h2):
    assert json.loads(json.dumps(h2)) == h2
    assert h2["n_qubits"] == 4 and h2["n_electrons"] == 2
    assert all(set(label) <= set("IXYZ") and len(label) == 4 for label, _ in h2["terms"])


def test_vqe_reaches_the_exact_ground_energy(h2):
    result = run_vqe(h2, max_iterations=200)
    assert result["energy"] == pytest.approx(h2["exact_energy"], abs=CHEMICAL_ACCURACY_HARTREE)
    # variational principle: no state can be below the exact ground state
    assert result["energy"] >= h2["exact_energy"] - 1e-9
    assert result["gates"] > 0 and result["evaluations"] > 0


def test_h2_energy_is_the_textbook_value(h2):
    # H2 / STO-3G near equilibrium is about -1.137 Ha; MMFF geometry is close but not identical
    assert -1.15 < h2["exact_energy"] < -1.10


def test_same_seed_gives_the_same_result(h2):
    first = run_vqe(h2, max_iterations=40, seed=7)
    again = run_vqe(h2, max_iterations=40, seed=7)
    assert first["energy"] == again["energy"]


def test_orbital_energies_are_real_scf_values(h2):
    assert h2["homo_ev"] < 0 < h2["lumo_ev"]


@pytest.mark.parametrize("radical", ["[CH3]", "[OH]"])
def test_open_shell_fragments_are_refused_not_faked(radical):
    with pytest.raises(ValueError, match="odd electron"):
        build_vqe_problem(radical)


def test_invalid_smiles_is_refused():
    with pytest.raises(ValueError, match="invalid SMILES"):
        build_vqe_problem("not-a-molecule")
