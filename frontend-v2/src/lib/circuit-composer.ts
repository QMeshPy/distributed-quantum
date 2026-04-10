import type { CircuitComposerAnalysis, CircuitSnippet, CircuitTemplate } from '@/types/circuit-composer';

export const DEFAULT_CIRCUIT_TEMPLATE_ID = 'bell-state';

export const CIRCUIT_TEMPLATES: CircuitTemplate[] = [
	{
		id: 'bell-state',
		title: 'Bell Pair',
		description:
			'A clean two-qubit entanglement starter that is perfect for smoke-testing the full coordinator flow.',
		tags: ['Starter', '2 qubits', 'Entanglement'],
		highlights: ['Fast sanity check', 'Readable result histogram'],
		circuit: `OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];
`
	},
	{
		id: 'ghz-three',
		title: 'GHZ State',
		description: 'Spreads entanglement across three qubits so you can inspect a slightly richer execution plan.',
		tags: ['3 qubits', 'Entanglement', 'Planning'],
		highlights: ['More fragments to inspect', 'Good for node fidelity comparisons'],
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
`
	},
	{
		id: 'phase-kickback',
		title: 'Phase Kickback',
		description: 'A compact interference example that is still short enough to tweak by hand inside the editor.',
		tags: ['Interference', '2 qubits', 'Editable'],
		highlights: ['Shows phase gates', 'Nice template for RZ experiments'],
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
`
	},
	{
		id: 'teleportation-skeleton',
		title: 'Teleportation Skeleton',
		description:
			'A longer starter that gives the `/runs/[id]` plan and fragment views something more interesting to show.',
		tags: ['3 qubits', 'Protocol', 'Deep dive'],
		highlights: ['Better detail-page demo', 'Mix of entanglement and corrections'],
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
`
	}
];

export const CIRCUIT_SNIPPETS: CircuitSnippet[] = [
	{
		id: 'register-pair',
		label: 'qreg + creg',
		description: 'Create paired quantum and classical registers.',
		category: 'Registers',
		snippet: `qreg q[2];
creg c[2];`
	},
	{
		id: 'single-h',
		label: 'Hadamard',
		description: 'Put a qubit into superposition.',
		category: 'Single-qubit',
		snippet: 'h q[0];'
	},
	{
		id: 'pauli-x',
		label: 'Pauli-X',
		description: 'Flip the target qubit.',
		category: 'Single-qubit',
		snippet: 'x q[0];'
	},
	{
		id: 'phase-rz',
		label: 'RZ(pi/4)',
		description: 'Apply a simple phase rotation.',
		category: 'Single-qubit',
		snippet: 'rz(pi/4) q[0];'
	},
	{
		id: 'cnot',
		label: 'CNOT',
		description: 'Entangle control and target qubits.',
		category: 'Entanglement',
		snippet: 'cx q[0],q[1];'
	},
	{
		id: 'barrier',
		label: 'Barrier',
		description: 'Visually separate phases of the circuit.',
		category: 'Entanglement',
		snippet: 'barrier q;'
	},
	{
		id: 'measure-all',
		label: 'Measure all',
		description:
			'One line per qubit (backend requires q[i] -> c[i]); duplicate the pattern for larger registers.',
		category: 'Readout',
		snippet: 'measure q[0] -> c[0];\nmeasure q[1] -> c[1];'
	},
	{
		id: 'measure-one',
		label: 'Measure q[0]',
		description: 'Measure a single qubit into one classical bit.',
		category: 'Readout',
		snippet: 'measure q[0] -> c[0];'
	},
	{
		id: 'algo-shor-qpe',
		label: "Shor (QPE skeleton)",
		description:
			'Order-finding via phase estimation on modular exponentiation U: counting qubits q[0],q[1], work q[2]; replace c-U with your N,a.',
		category: 'Algorithms',
		snippet: `// Shor: QPE on U|y⟩ = |a·y mod N⟩ — swap in real controlled modular mult.
barrier q;
h q[0];
h q[1];
// c-U^{2^k} from counting onto work register (problem-specific)
cu1(pi/2) q[0],q[2];
cu1(pi/4) q[1],q[2];
barrier q;
// Inverse QFT on counting lines (q[0], q[1])
h q[1];
cu1(-pi/2) q[0],q[1];
h q[0];`
	},
	{
		id: 'algo-grover-iteration',
		label: 'Grover iteration',
		description:
			'One Grover step: π on |11⟩ + 2-qubit diffuser. Paste only the gate lines after your qreg/creg (not a second OPENQASM block). Measure with measure q[i] -> c[i]; — bulk measure q -> c is not supported by the backend.',
		category: 'Algorithms',
		snippet: `// Grover: phase oracle on |11⟩ + standard 2-qubit diffuser
cz q[0],q[1];
h q[0];
h q[1];
x q[0];
x q[1];
h q[1];
cx q[0],q[1];
h q[1];
x q[0];
x q[1];
h q[0];
h q[1];`
	},
	{
		id: 'algo-qft-3',
		label: 'Quantum Fourier (3 qubits)',
		description: 'QFT on q[0]–q[2]; pair with inverse QFT in Shor and phase estimation.',
		category: 'Algorithms',
		snippet: `h q[0];
cu1(pi/2) q[1],q[0];
cu1(pi/4) q[2],q[0];
h q[1];
cu1(pi/2) q[2],q[1];
h q[2];`
	},
	{
		id: 'algo-deutsch-jozsa',
		label: 'Deutsch–Jozsa',
		description: 'Constant vs balanced: sandwich U_f with H on data qubits; needs qreg q[2] and aux |1⟩.',
		category: 'Algorithms',
		snippet: `// Deutsch–Jozsa — insert your U_f between the two barriers
x q[1];
h q[0];
h q[1];
barrier q;
// U_f
barrier q;
h q[0];`
	},
	{
		id: 'algo-bernstein-vazirani',
		label: 'Bernstein–Vazirani',
		description: 'Recover hidden string a in one query; oracle encodes f(x)=a·x (mod 2).',
		category: 'Algorithms',
		snippet: `// Bernstein–Vazirani — ancilla in |−⟩, query U_f, then H on data qubits
h q[0];
h q[1];
x q[1];
h q[1];
barrier q;
// U_f (inner product with hidden string a)
barrier q;
h q[0];
h q[1];`
	},
	{
		id: 'algo-simon',
		label: 'Simon (query pattern)',
		description: 'Two-query structure: superposition, oracle U_f, then H on first register; classical post-process.',
		category: 'Algorithms',
		snippet: `// Simon: repeat to sample y ⊥ s; classical linear algebra finds hidden period s
h q[0];
h q[1];
barrier q;
// U_f : |y⟩|x⟩ ↦ |y⟩|x ⊕ f(y)⟩
barrier q;
h q[0];
h q[1];`
	},
	{
		id: 'algo-vqe-layer',
		label: 'VQE / HEA layer',
		description: 'Single hardware-efficient ansatz block: rotations + linear entangler (adjust angles).',
		category: 'Algorithms',
		snippet: `rx(pi/4) q[0];
rx(pi/4) q[1];
cx q[0],q[1];
cx q[1],q[0];`
	}
];

const HEADER_PATTERN = /^\s*OPENQASM\s+([0-9.]+)\s*;/i;
const INCLUDE_PATTERN = /^\s*include\s+["'][^"']+["']\s*;/i;
const QREG_PATTERN = /^\s*qreg\s+[A-Za-z_][\w]*\s*\[[^\]]+\]\s*;/i;
const CREG_PATTERN = /^\s*creg\s+[A-Za-z_][\w]*\s*\[[^\]]+\]\s*;/i;
const QUBIT_PATTERN = /^\s*qubit(?:\s*\[[^\]]+\])?\s+[A-Za-z_][\w]*(?:\s*\[[^\]]+\])?\s*;/i;
const BIT_PATTERN = /^\s*bit(?:\s*\[[^\]]+\])?\s+[A-Za-z_][\w]*(?:\s*\[[^\]]+\])?\s*;/i;
const COMMENT_PATTERN = /^\s*(\/\/|#)/;
const BRACE_PATTERN = /^\s*[{}]\s*$/;

function isRegisterDeclaration(line: string) {
	return QREG_PATTERN.test(line) || CREG_PATTERN.test(line) || QUBIT_PATTERN.test(line) || BIT_PATTERN.test(line);
}

function isStructuralLine(line: string) {
	return (
		!line ||
		COMMENT_PATTERN.test(line) ||
		HEADER_PATTERN.test(line) ||
		INCLUDE_PATTERN.test(line) ||
		isRegisterDeclaration(line) ||
		BRACE_PATTERN.test(line)
	);
}

export function getCircuitTemplateById(templateId: string) {
	return CIRCUIT_TEMPLATES.find(template => template.id === templateId);
}

export function getCircuitSnippetById(snippetId: string) {
	return CIRCUIT_SNIPPETS.find(snippet => snippet.id === snippetId);
}

export function analyzeOpenQasm(source: string): CircuitComposerAnalysis {
	const normalized = source.replace(/\r\n?/g, '\n');
	const lines = normalized.split('\n');
	const trimmedLines = lines.map(line => line.trim());
	const nonEmptyLines = trimmedLines.filter(Boolean);
	const versionMatch = trimmedLines.find(line => HEADER_PATTERN.test(line))?.match(HEADER_PATTERN);
	const detectedVersion = versionMatch?.[1] ?? null;
	const hasInclude = trimmedLines.some(line => INCLUDE_PATTERN.test(line));
	const quantumRegisterCount = trimmedLines.filter(
		line => QREG_PATTERN.test(line) || QUBIT_PATTERN.test(line)
	).length;
	const classicalRegisterCount = trimmedLines.filter(
		line => CREG_PATTERN.test(line) || BIT_PATTERN.test(line)
	).length;
	const operationLines = trimmedLines.filter(line => !isStructuralLine(line));
	const operationPreview = operationLines.slice(0, 10);
	const measurementCount = operationLines.filter(line => /^\s*measure\b/i.test(line)).length;
	const warnings: string[] = [];

	if (nonEmptyLines.length === 0) {
		warnings.push('Start with a template or paste an OpenQASM circuit before queueing a run.');
	}
	if (!detectedVersion) {
		warnings.push('Missing an OPENQASM header, so the coordinator cannot infer the circuit format safely.');
	}
	if (detectedVersion === '2.0' && !hasInclude) {
		warnings.push('OpenQASM 2 circuits usually need `include "qelib1.inc";` for standard gates.');
	}
	if (quantumRegisterCount === 0) {
		warnings.push('No quantum register declaration was detected yet.');
	}
	if (operationLines.length === 0) {
		warnings.push('No gate or measurement operations were found in the circuit body.');
	}
	if (measurementCount === 0 && operationLines.length > 0) {
		warnings.push('No measurements detected. The run can execute, but result tables may stay sparse.');
	}
	if (measurementCount > 0 && classicalRegisterCount === 0) {
		warnings.push('Measurements are present, but no classical register declaration was detected.');
	}

	return {
		detectedVersion,
		lineCount: lines.length,
		nonEmptyLineCount: nonEmptyLines.length,
		operationCount: operationLines.length,
		measurementCount,
		quantumRegisterCount,
		classicalRegisterCount,
		readyToSubmit: Boolean(detectedVersion) && quantumRegisterCount > 0 && operationLines.length > 0,
		warnings,
		operationPreview
	};
}
