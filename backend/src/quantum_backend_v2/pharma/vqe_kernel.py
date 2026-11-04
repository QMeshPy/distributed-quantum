"""Active-space VQE for one molecular fragment, split in two so a laptop without PySCF can run it.

`build_vqe_problem` needs RDKit + PySCF + OpenFermion and runs on the coordinator.
`run_vqe` needs only numpy, scipy and PennyLane and runs on any peer.
The problem between them is plain JSON (Pauli strings + coefficients).
"""

from __future__ import annotations

import time
from typing import Any

from quantum_backend_v2.pharma.qml_lock import QML_LOCK

HARTREE_TO_EV = 27.211386


def build_vqe_problem(
    smiles: str, *, basis: str = "sto-3g", active_orbitals: int = 4
) -> dict[str, Any]:
    """Run RHF on the fragment and return the JSON qubit Hamiltonian of an HOMO/LUMO active space.

    Orbitals below the active window stay doubly occupied (frozen core). The result also carries
    the exact ground energy of the same Hamiltonian, so a VQE result can be checked against it.
    """
    from openfermion.chem import MolecularData
    from openfermion.linalg import get_sparse_operator, jw_get_ground_state_at_particle_number
    from openfermion.transforms import get_fermion_operator, jordan_wigner
    from openfermionpyscf import run_pyscf
    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"invalid SMILES: {smiles}")
    mol = Chem.AddHs(mol)
    embed = AllChem.ETKDGv3()
    embed.randomSeed = 42
    if AllChem.EmbedMolecule(mol, embed) != 0:
        raise ValueError(f"could not build a 3D geometry for {smiles}")
    AllChem.MMFFOptimizeMolecule(mol)

    n_electrons = sum(atom.GetAtomicNum() for atom in mol.GetAtoms())
    if n_electrons % 2:
        raise ValueError(f"{smiles} has an odd electron count; closed-shell RHF cannot treat it")
    positions = mol.GetConformer().GetPositions()
    geometry = [
        (atom.GetSymbol(), tuple(float(x) for x in positions[atom.GetIdx()]))
        for atom in mol.GetAtoms()
    ]

    data = MolecularData(geometry=geometry, basis=basis, multiplicity=1, charge=0)
    data = run_pyscf(data, run_scf=True, run_fci=False)

    n_occ = n_electrons // 2
    below = active_orbitals // 2
    first = max(0, n_occ - below)
    last = min(data.n_orbitals, first + active_orbitals)
    active = list(range(first, last))
    hamiltonian = jordan_wigner(
        get_fermion_operator(
            data.get_molecular_hamiltonian(
                occupied_indices=list(range(first)), active_indices=active
            )
        )
    )
    n_qubits = 2 * len(active)
    active_electrons = 2 * (n_occ - first)

    terms = []
    for ops, coeff in hamiltonian.terms.items():
        label = ["I"] * n_qubits
        for index, pauli in ops:
            label[index] = pauli
        terms.append(["".join(label), float(coeff.real)])
    exact, _ = jw_get_ground_state_at_particle_number(
        get_sparse_operator(hamiltonian, n_qubits), active_electrons
    )

    return {
        "smiles": smiles,
        "basis": basis,
        "n_qubits": n_qubits,
        "n_electrons": active_electrons,
        "terms": terms,
        "exact_energy": float(exact),
        "homo_ev": float(data.orbital_energies[n_occ - 1]) * HARTREE_TO_EV,
        "lumo_ev": float(data.orbital_energies[n_occ]) * HARTREE_TO_EV,
    }


def run_vqe(
    problem: dict[str, Any], *, max_iterations: int = 200, seed: int | None = None
) -> dict[str, Any]:
    """Minimise <H> over a UCCSD ansatz. No seed starts at Hartree-Fock; a seed starts nearby, randomly."""
    import numpy as np
    import pennylane as qml
    from pennylane import qchem
    from scipy.optimize import minimize

    started = time.perf_counter()
    n_qubits, n_electrons = problem["n_qubits"], problem["n_electrons"]
    with QML_LOCK:
        operator = qml.dot(
            [coeff for _, coeff in problem["terms"]],
            [qml.pauli.string_to_pauli_word(label) for label, _ in problem["terms"]],
        )
    singles, doubles = qchem.excitations(n_electrons, n_qubits)
    s_wires, d_wires = qchem.excitations_to_wires(singles, doubles)
    hf_state = qchem.hf_state(n_electrons, n_qubits)
    wires = list(range(n_qubits))

    @qml.qnode(qml.device("default.qubit", wires=n_qubits))
    def energy(weights):
        qml.UCCSD(weights, wires, s_wires=s_wires, d_wires=d_wires, init_state=hf_state)
        return qml.expval(operator)

    def locked_energy(weights: Any) -> float:
        with QML_LOCK:  # per evaluation, so VQEs sharing a process take turns instead of racing
            return float(energy(weights))

    n_params = len(singles) + len(doubles)
    start = np.zeros(n_params)
    if seed is not None:
        start = np.random.default_rng(seed).normal(0.0, 0.1, n_params)
    result = minimize(
        locked_energy,
        start,
        method="COBYLA",
        options={"maxiter": max_iterations, "rhobeg": 0.2},
    )
    try:  # informational only; never let a PennyLane API difference fail a finished optimisation
        with QML_LOCK:
            gates = int(qml.specs(energy, level="device")(result.x).resources.num_gates)
    except Exception:
        gates = 0
    return {
        "energy": float(result.fun),
        "evaluations": int(result.nfev),
        "parameters": n_params,
        "gates": gates,
        "seed": seed,
        "elapsed_seconds": time.perf_counter() - started,
    }
