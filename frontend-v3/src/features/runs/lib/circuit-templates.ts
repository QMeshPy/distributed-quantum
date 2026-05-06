export type CircuitTemplate = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  highlights: string[];
  circuit: string;
};

export type CircuitSnippet = {
  id: string;
  label: string;
  description: string;
  category: string;
  snippet: string;
};

export const DEFAULT_CIRCUIT_TEMPLATE_ID = "bell-state";

export const CIRCUIT_TEMPLATES: CircuitTemplate[] = [
  {
    id: "bell-state",
    title: "Bell Pair",
    description:
      "A clean two-qubit entanglement starter — perfect for smoke-testing the full coordinator flow.",
    tags: ["Starter", "2 qubits", "Entanglement"],
    highlights: ["Fast sanity check", "Readable result histogram"],
    circuit: `OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`,
  },
  {
    id: "ghz-three",
    title: "GHZ State",
    description:
      "Spreads entanglement across three qubits so you can inspect a slightly richer execution plan.",
    tags: ["3 qubits", "Entanglement", "Planning"],
    highlights: [
      "More fragments to inspect",
      "Good for node fidelity comparisons",
    ],
    circuit: `OPENQASM 2.0;
include "qelib1.inc";

qreg q[3];
creg c[3];

h q[0];
cx q[0],q[1];
cx q[1],q[2];
measure q[0] -> c[0];
measure q[1] -> c[1];
measure q[2] -> c[2];
`,
  },
  {
    id: "phase-kickback",
    title: "Phase Kickback",
    description:
      "A compact interference example that is still short enough to tweak by hand inside the editor.",
    tags: ["Interference", "2 qubits", "Editable"],
    highlights: ["Shows phase gates", "Nice template for RZ experiments"],
    circuit: `OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

x q[1];
h q[0];
h q[1];
cx q[0],q[1];
rz(pi/2) q[1];
cx q[0],q[1];
h q[0];
h q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`,
  },
  {
    id: "teleportation-skeleton",
    title: "Teleportation Skeleton",
    description:
      "A longer starter that gives the plan and fragment views something more interesting to show.",
    tags: ["3 qubits", "Protocol", "Deep dive"],
    highlights: [
      "Better detail-page demo",
      "Mix of entanglement and corrections",
    ],
    circuit: `OPENQASM 2.0;
include "qelib1.inc";

qreg q[3];
creg c[3];

h q[1];
cx q[1],q[2];
x q[0];
h q[0];
cx q[0],q[1];
h q[0];
measure q[0] -> c[0];
measure q[1] -> c[1];
if (c==1) z q[2];
if (c==2) x q[2];
if (c==3) x q[2];
if (c==3) z q[2];
measure q[2] -> c[2];
`,
  },
];

export const CIRCUIT_SNIPPETS: CircuitSnippet[] = [
  {
    id: "register-pair",
    label: "qreg + creg",
    description: "Create paired quantum and classical registers.",
    category: "Registers",
    snippet: "qreg q[2];\ncreg c[2];",
  },
  {
    id: "single-h",
    label: "Hadamard",
    description: "Put a qubit into superposition.",
    category: "Single-qubit",
    snippet: "h q[0];",
  },
  {
    id: "pauli-x",
    label: "Pauli-X",
    description: "Flip the target qubit.",
    category: "Single-qubit",
    snippet: "x q[0];",
  },
  {
    id: "phase-rz",
    label: "RZ(pi/4)",
    description: "Apply a simple phase rotation.",
    category: "Single-qubit",
    snippet: "rz(pi/4) q[0];",
  },
  {
    id: "cnot",
    label: "CNOT",
    description: "Entangle control and target qubits.",
    category: "Entanglement",
    snippet: "cx q[0],q[1];",
  },
  {
    id: "barrier",
    label: "Barrier",
    description: "Visually separate phases of the circuit.",
    category: "Entanglement",
    snippet: "barrier q;",
  },
  {
    id: "measure-all",
    label: "Measure all",
    description:
      "One line per qubit — duplicate the pattern for larger registers.",
    category: "Readout",
    snippet: "measure q[0] -> c[0];\nmeasure q[1] -> c[1];",
  },
  {
    id: "algo-shor-qpe",
    label: "Shor (QPE skeleton)",
    description:
      "Order-finding via phase estimation on modular exponentiation.",
    category: "Algorithms",
    snippet: "h q[0];\nh q[1];\ncu1(pi/2) q[0],q[2];\ncu1(pi/4) q[1],q[2];\nbarrier q;\nh q[1];\ncu1(-pi/2) q[0],q[1];\nh q[0];",
  },
  {
    id: "algo-grover-iteration",
    label: "Grover iteration",
    description: "One Grover step: phase oracle on |11⟩ + 2-qubit diffuser.",
    category: "Algorithms",
    snippet: "cz q[0],q[1];\nh q[0];\nh q[1];\nx q[0];\nx q[1];\nh q[1];\ncx q[0],q[1];\nh q[1];\nx q[0];\nx q[1];\nh q[0];\nh q[1];",
  },
  {
    id: "algo-qft-3",
    label: "QFT (3 qubits)",
    description: "Quantum Fourier Transform on q[0]–q[2].",
    category: "Algorithms",
    snippet: "h q[0];\ncu1(pi/2) q[1],q[0];\ncu1(pi/4) q[2],q[0];\nh q[1];\ncu1(pi/2) q[2],q[1];\nh q[2];",
  },
  {
    id: "algo-vqe-layer",
    label: "VQE / HEA layer",
    description: "Hardware-efficient ansatz block: rotations + linear entangler.",
    category: "Algorithms",
    snippet: "rx(pi/4) q[0];\nrx(pi/4) q[1];\ncx q[0],q[1];\ncx q[1],q[0];",
  },
];

export function getCircuitTemplateById(templateId: string) {
  return CIRCUIT_TEMPLATES.find((t) => t.id === templateId);
}

export function getCircuitSnippetById(snippetId: string) {
  return CIRCUIT_SNIPPETS.find((s) => s.id === snippetId);
}
