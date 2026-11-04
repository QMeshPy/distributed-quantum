"""Stage 5: DC-QAOA Fragment Docking Optimizer.

Digitized Counterdiabatic QAOA (Hegade et al. 2022):
- Standard QAOA + counterdiabatic term to escape local minima
- QUBO formulation from VQE descriptors + protein binding site grid
- Warm-start from previous iteration parameters
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from quantum_backend_v2.pharma.config import QAOAConfig
from quantum_backend_v2.pharma.models import (
    DockingPose,
    MolecularFragment,
    QUBOPlacement,
    VQEDescriptors,
)
from quantum_backend_v2.pharma.qml_lock import QML_LOCK
from quantum_backend_v2.pharma.qubo_builder import build_qubo_matrix, qubo_to_ising


@dataclass
class DockingResult:
    placements: list[QUBOPlacement]
    total_energy: float
    approximation_ratio: float
    beta_params: list[float]
    gamma_params: list[float]
    dc_alpha: float
    n_qubits_used: int


class QAOADockingOptimizer:
    def __init__(self, config: QAOAConfig) -> None:
        self._cfg = config

    def dock(
        self,
        fragments: list[MolecularFragment],
        descriptors: dict[str, VQEDescriptors],
        binding_site_grid: np.ndarray,
        clash_matrix: np.ndarray,
        warm_start_beta: list[float] | None = None,
        warm_start_gamma: list[float] | None = None,
    ) -> DockingResult:
        n_fragments = len(fragments)
        n_sites = clash_matrix.shape[0]

        # Build interaction energies from ESP charges + grid
        interaction = np.zeros((n_fragments, n_sites))
        for i, frag in enumerate(fragments):
            desc = descriptors.get(frag.fragment_id)
            for s in range(n_sites):
                if desc and desc.esp_charges:
                    q = np.mean(np.abs(desc.esp_charges))
                    interaction[i, s] = -q * (1.0 / (s + 1.0))
                else:
                    interaction[i, s] = -0.5 / (s + 1.0)

        bond_pairs = []
        for i, frag in enumerate(fragments):
            for j, other in enumerate(fragments):
                if i < j and frag.fragment_id in other.adjacent_fragments:
                    bond_pairs.append((i, j))

        Q = build_qubo_matrix(
            n_fragments=n_fragments,
            n_sites=n_sites,
            interaction_energies=interaction,
            clash_matrix=clash_matrix,
            bond_pairs=bond_pairs,
        )
        ising = qubo_to_ising(Q)
        n_qubits = ising.h.shape[0]

        beta0 = (
            warm_start_beta
            if warm_start_beta and len(warm_start_beta) == self._cfg.layers
            else list(np.random.uniform(0, np.pi, self._cfg.layers))
        )
        gamma0 = (
            warm_start_gamma
            if warm_start_gamma and len(warm_start_gamma) == self._cfg.layers
            else list(np.random.uniform(0, 2 * np.pi, self._cfg.layers))
        )
        dc_alpha = self._cfg.cd_alpha if self._cfg.use_counterdiabatic else 0.0

        bitstring, energy, approx_ratio, beta_opt, gamma_opt, dc_a = self._run_qaoa_circuit(
            ising.h, ising.J, beta0, gamma0, dc_alpha, n_qubits
        )

        placements: list[QUBOPlacement] = []
        for i, frag in enumerate(fragments):
            assigned_site = next(
                (s for s in range(n_sites) if i * n_sites + s < len(bitstring) and bitstring[i * n_sites + s] == 1),
                0,
            )
            start = i * n_sites
            end = min((i + 1) * n_sites, len(bitstring))
            assignment = list(bitstring[start:end]) + [0] * max(0, n_sites - (end - start))
            placements.append(
                QUBOPlacement(
                    fragment_id=frag.fragment_id,
                    grid_site_index=assigned_site,
                    binary_variable_assignment=assignment,
                    interaction_energy_kcal=float(interaction[i, assigned_site] * 627.509),
                )
            )

        return DockingResult(
            placements=placements,
            total_energy=float(energy),
            approximation_ratio=float(approx_ratio),
            beta_params=list(beta_opt),
            gamma_params=list(gamma_opt),
            dc_alpha=float(dc_a),
            n_qubits_used=n_qubits,
        )

    def _run_qaoa_circuit(
        self,
        h: np.ndarray,
        J: np.ndarray,
        beta0: list[float],
        gamma0: list[float],
        dc_alpha: float,
        n_qubits: int,
    ) -> tuple:
        import pennylane as qml
        from scipy.optimize import minimize

        dev = qml.device("default.qubit", wires=n_qubits)

        @qml.qnode(dev)
        def circuit(params):  # type: ignore[misc]
            n_layers = self._cfg.layers
            beta = params[:n_layers]
            gamma = params[n_layers : 2 * n_layers]
            for i in range(n_qubits):
                qml.Hadamard(wires=i)
            for layer in range(n_layers):
                for i in range(n_qubits):
                    qml.RZ(2 * gamma[layer] * h[i], wires=i)
                for i in range(n_qubits):
                    for j in range(i + 1, n_qubits):
                        if abs(J[i, j]) > 1e-8:
                            qml.CNOT(wires=[i, j])
                            qml.RZ(2 * gamma[layer] * J[i, j], wires=j)
                            qml.CNOT(wires=[i, j])
                for i in range(n_qubits):
                    scale = 1 + dc_alpha if dc_alpha > 0 else 1.0
                    qml.RX(2 * beta[layer] * scale, wires=i)
            return qml.probs(wires=list(range(n_qubits)))

        # Energy of every basis state at once: spins s = 2*bit - 1, E = h.s + sum_{i<j} J_ij s_i s_j.
        # Wire 0 is the most significant bit, matching the order of qml.probs.
        states = np.arange(2**n_qubits)[:, None]
        spins = 2.0 * ((states >> (n_qubits - 1 - np.arange(n_qubits))) & 1) - 1.0
        basis_energy = spins @ h + ((spins @ np.triu(J, 1)) * spins).sum(axis=1)

        def probabilities(params: np.ndarray) -> np.ndarray:
            with QML_LOCK:
                return np.asarray(circuit(params))

        def cost(params: np.ndarray) -> float:
            return float(np.dot(probabilities(params), basis_energy))

        params0 = np.array(beta0 + gamma0)
        res = minimize(cost, params0, method="COBYLA",
                       options={"maxiter": self._cfg.max_iterations})
        opt_energy = float(res.fun)

        probs = probabilities(res.x)
        best_idx = int(np.argmax(probs))
        bitstring = np.array([int(b) for b in format(best_idx, f"0{n_qubits}b")])

        classical_bound = float(np.min(h)) * n_qubits
        approx_ratio = min(abs(opt_energy / classical_bound), 1.0) if classical_bound != 0 else 0.0

        n_layers = self._cfg.layers
        return (
            bitstring,
            opt_energy,
            approx_ratio,
            list(res.x[:n_layers]),
            list(res.x[n_layers : 2 * n_layers]),
            dc_alpha,
        )
