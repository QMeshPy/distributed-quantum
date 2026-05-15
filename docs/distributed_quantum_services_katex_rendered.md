# Distributed Quantum Services: Multi-Domain Quantum Algorithm Execution via Decentralized P2P Orchestration on Superconducting Hardware

## Abstract

We propose a series of experiments to execute multi-domain quantum workloads on the Willow processor, orchestrated through a decentralized peer-to-peer runtime built on libp2p. Our platform compiles, fragments, and routes quantum circuits to compute nodes via GossipSub-based service discovery, executing them through a DAG-planned pipeline. We propose three tightly coupled experiment tracks: QAOA circuits for combinatorial portfolio optimization at \(N=40\text{--}50\) assets — a regime beyond exact classical statevector simulation, requiring \(2^{40}\) amplitudes — using a ring-XY budget-preserving mixer and greedy warm-start initial states; VQE circuits for molecular fragment simulation via Density Matrix Embedding Theory, targeting pharmaceutical-relevant active spaces of \(20\text{--}40\) qubits with hardware-efficient ansatze; and QAOA-driven molecular docking optimization using Ising-mapped binding affinity Hamiltonians.

All circuits are compiled to the \(\mathrm{CZ}\) plus single-qubit basis gates compatible with Device 1 specifications. We present numerical evidence from Qiskit statevector simulations and provide concrete observable definitions for each experiment track.

## 1. Background and Motivation

### 1.1 The Distributed Quantum Computing Paradigm

Current quantum computing operates under a centralized model: a single user submits circuits to a single QPU through a vendor-specific cloud API. This model fundamentally limits how quantum resources can be shared, composed, and scaled across research domains.

We have built a fully functional distributed quantum runtime where quantum operations are treated as discoverable peer-to-peer network services. The system uses libp2p, the networking stack underlying IPFS and Filecoin, to discover quantum compute nodes via GossipSub publish-subscribe protocols, compile high-level quantum programs into hardware-optimized execution plans via DAG-based circuit planning, route circuit fragments to appropriate compute nodes based on a cost model incorporating gate fidelity, qubit connectivity, and node availability, execute workloads across a heterogeneous mesh of quantum backends, and assemble results from distributed fragment executions into unified scientific outputs.

This platform currently operates with Qiskit statevector simulation backends. We propose to integrate the Willow processor as a real QPU backend, enabling the first empirical characterization of P2P-orchestrated quantum workloads on superconducting hardware.

### 1.2 Scientific Questions

**Q1, Scaling.** What are the empirical approximation ratios and noise-resilience properties of QAOA for combinatorial optimization at \(40\text{--}50\) qubits on real superconducting hardware — a scale where exact classical verification becomes intractable?

**Q2, Multi-domain.** Can a single quantum runtime simultaneously serve multiple scientific domains — financial optimization, molecular simulation, and drug discovery — through the same hardware, and what are the cross-domain circuit characterization insights?

**Q3, Architecture.** How does a decentralized orchestration architecture — with DAG-planned fragment routing and GossipSub-based coordination — perform when backed by real QPU hardware rather than ideal statevector simulation?

## 2. Experiment Track 1: QAOA Portfolio Optimization at Beyond-Classical Scale

### 2.1 Problem Formulation

We encode the mean-variance portfolio optimization problem as a Quadratic Unconstrained Binary Optimization:

$$
\min_{\mathbf{x}} \quad q\,\mathbf{x}^{T}\Sigma\mathbf{x} - \boldsymbol{\mu}^{T}\mathbf{x}
$$

subject to:

$$
\mathbf{1}^{T}\mathbf{x} = B
$$

where \(\mathbf{x}\in\{0,1\}^{N}\) is the asset selection vector, \(\Sigma\) is the covariance matrix, \(\boldsymbol{\mu}\) is the expected returns vector, \(q\) is the risk aversion parameter, and \(B\) is the budget constraint.

The QUBO maps to an Ising Hamiltonian via:

$$
x_i = \frac{1-Z_i}{2}
$$

The corresponding cost Hamiltonian is:

$$
H_C = \sum_{i<j} J_{ij}Z_iZ_j + \sum_i h_iZ_i + \mathrm{const}
$$

where:

$$
J_{ij}=\frac{q\Sigma_{ij}}{4}
$$

and:

$$
h_i = \frac{q\sum_j\Sigma_{ij}-\mu_i}{2} + \frac{\lambda(N-2B)}{2}
$$

with penalty \(\lambda\) enforcing the budget constraint.

### 2.2 Circuit Architecture

**Initial state.** A greedy budget-preserving basis state \(|s_0\rangle\), where exactly \(B\) qubits are set to \(|1\rangle\) based on highest risk-adjusted returns. This warm start provides a feasible starting point.

**Mixer operator.** The ring-XY budget-preserving mixer is:

$$
U_M(\beta)=\prod_{(i,j)\in\mathrm{ring}}\exp\!\left[-i\frac{\beta}{2}\left(X_iX_j+Y_iY_j\right)\right]
$$

This mixer preserves the Hamming weight of the state and therefore preserves the budget constraint throughout optimization, eliminating the need for penalty terms.

**Cost unitary.** The Ising cost Hamiltonian is applied as:

$$
U_C(\gamma)=\exp(-i\gamma H_C)=\prod_{i<j}\exp(-i\gamma J_{ij}Z_iZ_j)\prod_i\exp(-i\gamma h_iZ_i)
$$

Each \(ZZ\) interaction decomposes into:

$$
\mathrm{CX}\;\longrightarrow\;R_Z(2\gamma J_{ij})\;\longrightarrow\;\mathrm{CX}
$$

which is then mapped to the \(\mathrm{CZ}\)-native basis for Willow.

The \(2p\) variational parameters are:

$$
(\beta_1,\ldots,\beta_p,\gamma_1,\ldots,\gamma_p)
$$

for \(p\) QAOA layers.

### 2.3 Willow-Specific Circuit Design

The XY-mixer interaction:

$$
\exp\!\left[-i\frac{\beta}{2}\left(X_iX_j+Y_iY_j\right)\right]
$$

decomposes into the CZ-native basis as:

$$
R_Z\!\left(-\frac{\pi}{2}\right)\otimes I
\;\longrightarrow\;
\mathrm{CZ}
\;\longrightarrow\;
R_Y(\beta)\otimes R_Y(-\beta)
\;\longrightarrow\;
\mathrm{CZ}
\;\longrightarrow\;
R_Z\!\left(\frac{\pi}{2}\right)\otimes I
$$

This yields:

$$
2\ \mathrm{CZ\ gates} + 4\ \mathrm{single\text{-}qubit\ gates}
$$

per mixer edge.

For \(N=40\text{--}50\) qubits on Willow's grid topology, the ring-XY mixer naturally maps to a one-dimensional ring embedded in the two-dimensional grid with at most \(1\) SWAP per non-adjacent edge. The cost Hamiltonian \(ZZ\) terms require SWAP routing for non-adjacent qubit pairs. We employ a sparsified covariance model retaining only the top-\(K\) strongest correlations satisfying:

$$
|J_{ij}| > \mathrm{threshold}
$$

With:

$$
K=3N
$$

keeping approximately \(120\text{--}150\) strongest interactions for \(N=40\), the circuit maps efficiently to the grid with SWAP depth:

$$
\sim O(\sqrt{N})
$$

For \(N=45\) and \(p=3\), the estimated circuit metrics are:

$$
\text{Qubits}=45
$$

$$
\text{CZ}_{\mathrm{mixer}} = 2\times45\times3=270
$$

$$
\text{CZ}_{\mathrm{cost}} \sim 150\times2\times3=900
$$

$$
\text{SWAP}_{\mathrm{routing}}\sim60\times3=180
$$

with:

$$
1\ \mathrm{SWAP}=3\ \mathrm{CZ}
$$

Therefore:

$$
\text{Total CZ-equivalent} = 270+900+540\approx1{,}710
$$

The total depth estimate is:

$$
\sim120\text{--}180\ \mathrm{layers}
$$

and the \(T_1\) coherence-window comparison is:

$$
180\ \mathrm{layers}\times35\ \mathrm{ns/layer}=6.3\ \mu\mathrm{s}\ll68\ \mu\mathrm{s}=T_1
$$

The runtime budget is:

$$
100\ \mathrm{circuits}\times8{,}192\ \mathrm{shots}\,/\,63{,}000\ \mathrm{shots/s}\approx13\ \mathrm{s}
$$

For \(10\) different \(45\)-asset portfolios:

$$
10\times13\ \mathrm{s}\approx130\ \mathrm{s}
$$

### 2.4 Observables and Paper Figures

For Figure 1, the problem sizes are:

$$
N\in\{10,15,20,25,30,35,40,45,50\}
$$

The approximation ratio is:

$$
r=\frac{E[C(\mathbf{x}_{\mathrm{QAOA}})]}{C(\mathbf{x}_{\mathrm{optimal}})}
$$

The curves compare \(p=1,2,3\) QAOA layers and a classical COBYLA baseline. For \(N\le25\), exact classical solutions are available; for \(N>25\), comparison is against simulated annealing.

For Figure 3, Conditional Value-at-Risk with \(\alpha=0.1\) is used as the objective:

$$
\mathrm{CVaR}_{\alpha}(H_C)=\frac{1}{\alpha}\int_0^{\alpha}F^{-1}(t)\,dt
$$

estimated from measurement samples.

### 2.5 Numerical Evidence

The statevector simulations report:

$$
N=8,\quad p=3,\quad r=0.92
$$

with brute-force optimum:

$$
r_{\mathrm{optimal}}=0.97
$$

For \(N=12\) and \(p=3\):

$$
r=0.89
$$

For \(N=20\) and \(p=3\):

$$
r=0.85
$$

compared to simulated annealing:

$$
r_{\mathrm{SA}}=0.91
$$

The feasible probability mass satisfies:

$$
P_{\mathrm{feasible}}>0.7
$$

CVaR with \(\alpha=0.1\) converges within approximately \(80\) COBYLA iterations. The QVM can validate noise resilience for:

$$
N\le25
$$

## 3. Experiment Track 2: VQE Molecular Fragment Simulation

### 3.1 Problem Formulation

We employ Density Matrix Embedding Theory to fragment large molecular systems into tractable impurity problems, each solvable on quantum hardware. Each fragment's electronic structure is encoded as a qubit Hamiltonian via the Jordan-Wigner transformation:

$$
H_{\mathrm{mol}}=\sum_{pq}h_{pq}a_p^{\dagger}a_q+\frac{1}{2}\sum_{pqrs}h_{pqrs}a_p^{\dagger}a_q^{\dagger}a_ra_s
$$

Under Jordan-Wigner:

$$
H_{\mathrm{mol}}\xrightarrow{\mathrm{Jordan\text{-}Wigner}}H_{\mathrm{qubit}}=\sum_i\alpha_iP_i
$$

where \(P_i\) are Pauli strings.

A hardware-efficient ansatz optimizes the variational energy:

$$
E(\boldsymbol{\theta})=\langle\psi(\boldsymbol{\theta})|H_{\mathrm{qubit}}|\psi(\boldsymbol{\theta})\rangle
$$

### 3.2 Circuit Architecture

The hardware-efficient ansatz uses alternating layers:

$$
\mathrm{Layer}\ l:\quad R_Y(\theta_{l,1})-R_Z(\phi_{l,1})-[\mathrm{CZ}]-R_Y(\theta_{l,2})-R_Z(\phi_{l,2})-[\mathrm{CZ}]-\cdots
$$

Single-qubit rotations per qubit are:

$$
R_Y(\theta)+R_Z(\phi)
$$

The total layers are:

$$
d=4\text{--}8
$$

For a \(20\)-qubit molecular fragment, the number of parameters is:

$$
2\times20\times d=160\text{--}320
$$

The number of CZ gates per layer is:

$$
19
$$

The total CZ count is:

$$
19d=76\text{--}152
$$

The total circuit depth is:

$$
\sim3d=12\text{--}24
$$

The coherence comparison is:

$$
24\times35\ \mathrm{ns}=0.84\ \mu\mathrm{s}\ll68\ \mu\mathrm{s}=T_1
$$

### 3.3 Target Molecules

Aspirin has \(21\) atoms and an active-site fragment of approximately \(12\) qubits. Caffeine has \(24\) atoms and an active-site fragment of approximately \(16\) qubits. Ibuprofen has \(33\) atoms and an active-site fragment of approximately \(24\text{--}28\) qubits.

### 3.4 Observables and Paper Figures

The chemical accuracy threshold is:

$$
1.6\ \mathrm{mHa}
$$

Figure 5 tracks VQE energy convergence in Hartree. Figure 6 compares HOMO-LUMO gap prediction accuracy across hardware VQE, DFT, and experimental values. Figure 7 reports qubit count versus chemical accuracy.

### 3.5 Runtime Budget

The runtime per molecule is:

$$
200\times4{,}096\,/\,63{,}000\approx13\ \mathrm{s}
$$

For three molecules and multiple fragment sizes:

$$
\sim5\ \mathrm{min}
$$

## 4. Experiment Track 3: QAOA Molecular Docking Optimization

### 4.1 Problem Formulation

Molecular docking maps naturally to combinatorial optimization. We encode the binding affinity as an Ising Hamiltonian:

$$
H_{\mathrm{dock}}=\sum_i h_iZ_i+\sum_{i<j}J_{ij}Z_iZ_j
$$

where \(h_i\) encodes single-residue interaction energies, \(J_{ij}\) encodes pairwise residue-residue coupling in the binding pocket, and binary variables \(Z_i\) represent discrete rotamer states of the ligand.

### 4.2 Circuit Architecture

The initial state is:

$$
|+\rangle^{\otimes n}
$$

The cost unitary uses Ising \(ZZ\) interactions decomposed as:

$$
\mathrm{CNOT}-R_Z-\mathrm{CNOT}
$$

and mapped to \(\mathrm{CZ}\) plus single-qubit gates for Willow.

The standard \(X\)-mixer is:

$$
\prod_i\exp(-i\beta X_i)
$$

implemented using \(R_X\) rotations.

For a \(20\)-residue binding pocket, corresponding to \(20\) qubits and \(3\) QAOA layers:

$$
\text{CZ gates}\sim190\times3=570
$$

$$
\text{RZ gates}\sim20\times3+190\times3=630
$$

$$
\text{RX gates}=20\times3=60
$$

The total depth is:

$$
\sim80\ \mathrm{layers}
$$

### 4.3 Observables and Paper Figures

Figure 8 compares quantum QAOA docking score with AutoDock Vina classical baseline. The binding affinity unit is:

$$
\mathrm{kcal/mol}
$$

Figure 9 compares approximation ratios across portfolio optimization, molecular simulation, and molecular docking.

## 5. Distributed Orchestration: From Platform to Hardware

### 5.1 Integration Architecture

The platform integration can be represented as:

$$
\begin{array}{llll}
\text{Research Domain} & \to & \text{Circuit Generation} & \to\ \text{DAG Planning}\ \to\ \text{Hardware Execution} \\
\text{Portfolio Opt. }(N=45) & \to & \text{QAOA, CZ-native} & \to\ \text{Fragment routing}\ \to\ \text{Willow QPU} \\
\text{Molecular Sim. }(20q) & \to & \text{VQE, hardware-efficient} & \to\ \text{Direct execution}\ \to\ \text{Willow QPU} \\
\text{Docking }(20q) & \to & \text{QAOA, Ising} & \to\ \text{Direct execution}\ \to\ \text{Willow QPU}
\end{array}
$$

The CircuitPlanner performs parsing, DAG construction, fragment generation, cost-model assignment, and topological execution ordering.

### 5.2 What the Orchestration Layer Enables

With Willow hardware as a backend node, the GossipSub discovery protocol advertises Willow's capabilities, including qubit count, gate set, connectivity, and current noise characteristics. The cost model routes circuits to Willow based on real-time fidelity metrics. The reservation protocol manages exclusive QPU access during experiment execution. Multiple experiment tracks share the hardware through the platform's scheduling pipeline.

### 5.3 Observable: Orchestration Overhead

Figure 10 decomposes end-to-end latency into circuit compilation, network coordination, QPU queue, execution, and result assembly.

## 6. Feasibility Analysis

### 6.1 Qubit Requirements

| Experiment | Qubits | Within 105-qubit limit? |
|---|---:|---|
| QAOA Portfolio, max | \(50\) | Yes |
| VQE Molecular, max | \(28\) | Yes |
| QAOA Docking, max | \(20\) | Yes |

### 6.2 Circuit Depth Analysis

| Experiment | Estimated Depth | \(T_1\)-limited depth | Feasible? |
|---|---:|---:|---|
| QAOA Portfolio, \(N=45\), \(p=3\) | \(\sim180\) | \(\sim1{,}943\) | Yes |
| VQE Molecular, \(20q\), \(d=8\) | \(\sim24\) | \(\sim1{,}943\) | Yes |
| QAOA Docking, \(20q\), \(p=3\) | \(\sim80\) | \(\sim1{,}943\) | Yes |

The \(T_1\)-limited depth is:

$$
\frac{T_1}{t_{\mathrm{gate}}}=\frac{68\ \mu\mathrm{s}}{35\ \mathrm{ns}}\approx1{,}943
$$

gate layers.

### 6.3 Gate Error Budget

For QAOA Portfolio with \(N=45\) and \(p=3\):

$$
\text{Total CZ gates}\sim1{,}710
$$

$$
\text{Per-gate CZ error}=0.33\%=0.0033
$$

The expected raw CZ-layer fidelity is:

$$
(1-0.0033)^{1710}\approx0.0035
$$

With CVaR post-selection using \(\alpha=0.1\), effective signal recovery is expected to be sufficient for approximation-ratio estimation.

For VQE Molecular with \(20q\) and \(d=8\):

$$
\text{Total CZ gates}\sim152
$$

The expected circuit fidelity is:

$$
(1-0.0033)^{152}\approx0.61
$$

This is sufficient for energy estimation within chemical accuracy using approximately \(4{,}096\) shots.

### 6.4 Constraint Compliance

The experiments use no mid-circuit measurements or classical feedback, no error correction codes, CZ gates only, no higher transmon level measurements, and remain within the one-day runtime budget.

## 7. Dedicated Research Personnel

A doctoral research scholar will be fully dedicated to programming circuits using Qiskit and Cirq for Willow's API, running calibration experiments on the QVM, executing the three experiment tracks on Willow hardware, analyzing results, preparing publication-quality figures, and interfacing with the platform's distributed runtime layer.

The research team has experience with Qiskit circuit construction, PennyLane for variational optimization, OpenQASM \(2.0/3.0\), py-libp2p distributed systems development, and production deployment of quantum computing infrastructure.

## 8. Expected Impact

### 8.1 Scientific Contributions

This work contributes the first empirical study of P2P-orchestrated quantum workloads on superconducting hardware; QAOA portfolio optimization at beyond-classical scale, \(N=40\text{--}50\); a multi-domain comparison of QAOA and VQE on identical hardware; and a hardware-validated drug discovery pipeline from DMET fragmentation through VQE to docking optimization.

### 8.2 Broader Impact

This work advances a distributed quantum computing infrastructure in which quantum hardware is a shared, discoverable network service rather than a siloed cloud endpoint. Multiple scientific domains can simultaneously leverage the same quantum resources, and the libp2p networking protocol provides a production-grade transport layer for quantum workload orchestration.

### 8.3 Publication Plan

The primary paper is “Multi-Domain Quantum Algorithm Execution via Decentralized P2P Orchestration on Superconducting Hardware,” targeting Nature Communications or PRX Quantum. A companion paper, “Empirical QAOA Scaling for Portfolio Optimization at 40-50 Qubits,” targets Physical Review Letters or Quantum. A technical paper, “Distributed Quantum Runtime Architecture: From Simulation to Superconducting Hardware,” targets IEEE Transactions on Quantum Engineering.

## 9. References

1. Farhi, E., Goldstone, J., & Gutmann, S. (2014). A Quantum Approximate Optimization Algorithm. arXiv:1411.4028.
2. Barkoutsos, P. K., et al. (2020). Improving Variational Quantum Optimization using CVaR. Quantum, 4, 256.
3. Egger, D. J., et al. (2021). Quantum Computing for Finance. Nature Reviews Physics, 3, 214–235.
4. Kananenka, A. A., et al. (2016). Density Matrix Embedding Theory. Annual Review of Physical Chemistry, 67, 587–614.
5. Will, M., Cochran, T. A., Rosenberg, E., et al. (2025). Probing non-equilibrium topological order on a quantum processor. Nature, 645, 348–353.
6. Cochran, T. A., Jobst, B., Rosenberg, E., et al. (2025). Visualizing dynamics of charges and strings in (2+1)D lattice gauge theories. Nature, 642, 315–320.
7. Hou, W., Garratt, S. J., Eassa, N. M., et al. (2025). Machine learning the effects of many quantum measurements. arXiv:2509.08890.
8. Bhatia, A. S., et al. (2023). Quantum computing for molecular simulation. Chemical Reviews.
9. Zhou, L., et al. (2020). Quantum Approximate Optimization Algorithm: Performance, Mechanism, and Implementation on Near-Term Devices. Physical Review X, 10, 021067.
10. Harrigan, M. P., et al. (2021). Quantum approximate optimization of non-planar graph problems on a planar superconducting processor. Nature Physics, 17, 332–336.

