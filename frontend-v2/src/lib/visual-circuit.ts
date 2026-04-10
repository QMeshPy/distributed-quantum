import type { CircuitCell, PaletteItem, SingleQubitGate, VisualCircuitState } from '@/types/visual-circuit';

const HEADER = `OPENQASM 2.0;
include "qelib1.inc";
`;

function emptyColumn(numQubits: number): CircuitCell[] {
	return Array.from({ length: numQubits }, () => ({ kind: 'empty' } as const));
}

export function createDefaultVisualCircuit(): VisualCircuitState {
	const numQubits = 2;
	const columns = [emptyColumn(numQubits), emptyColumn(numQubits), emptyColumn(numQubits), emptyColumn(numQubits)];
	return { numQubits, columns };
}

function cloneState(state: VisualCircuitState): VisualCircuitState {
	return {
		numQubits: state.numQubits,
		columns: state.columns.map(col => col.map(c => ({ ...c })))
	};
}

/** Remove broken CX halves in a column */
function sanitizeColumn(col: CircuitCell[], numQubits: number): CircuitCell[] {
	const next = col.map(c => ({ ...c })) as CircuitCell[];
	for (let q = 0; q < numQubits; q++) {
		const c = next[q];
		if (!c || c.kind !== 'cx') continue;
		if (c.role === 'control') {
			const t = next[q + 1];
			if (q + 1 >= numQubits || !t || t.kind !== 'cx' || t.role !== 'target') {
				next[q] = { kind: 'empty' };
			}
		} else {
			const ctl = next[q - 1];
			if (q === 0 || !ctl || ctl.kind !== 'cx' || ctl.role !== 'control') {
				next[q] = { kind: 'empty' };
			}
		}
	}
	return next;
}

export function trimTrailingEmptyColumns(state: VisualCircuitState): VisualCircuitState {
	const next = cloneState(state);
	while (next.columns.length > 1) {
		const last = next.columns[next.columns.length - 1];
		if (!last || !last.every(c => c.kind === 'empty')) break;
		next.columns.pop();
	}
	if (next.columns.length === 0) {
		next.columns.push(emptyColumn(next.numQubits));
	}
	return next;
}

function gateToOpenQasm(gate: SingleQubitGate, q: number): string {
	return `${gate} q[${q}];`;
}

export function serializeOpenQasm2(state: VisualCircuitState): string {
	const s = trimTrailingEmptyColumns(state);
	const n = s.numQubits;
	const body: string[] = [];

	for (const raw of s.columns) {
		const col = sanitizeColumn(raw, n);
		const lines: string[] = [];

		for (let q = 0; q < n; q++) {
			const cell = col[q];
			if (!cell || cell.kind === 'empty') continue;
			if (cell.kind === 'single') {
				lines.push(gateToOpenQasm(cell.gate, q));
			} else if (cell.kind === 'measure') {
				lines.push(`measure q[${q}] -> c[${q}];`);
			} else if (cell.kind === 'cx' && cell.role === 'control') {
				const t = col[q + 1];
				if (t?.kind === 'cx' && t.role === 'target') {
					lines.push(`cx q[${q}],q[${q + 1}];`);
				}
			}
		}

		if (lines.length > 0) {
			body.push(...lines);
		}
	}

	return `${HEADER}
qreg q[${n}];
creg c[${n}];

${body.join('\n')}
${body.length > 0 ? '\n' : ''}`;
}

export function placeFromPalette(
	state: VisualCircuitState,
	columnIndex: number,
	qubitIndex: number,
	palette: PaletteItem
): VisualCircuitState {
	const next = cloneState(state);
	const n = next.numQubits;
	if (columnIndex < 0 || columnIndex >= next.columns.length) return state;
	if (qubitIndex < 0 || qubitIndex >= n) return state;

	let col = next.columns[columnIndex]!.map(c => ({ ...c })) as CircuitCell[];

	const clearQubit = (q: number) => {
		const prev = col[q];
		if (prev?.kind === 'cx') {
			const below = col[q + 1];
			if (prev.role === 'control' && below?.kind === 'cx' && below.role === 'target') {
				col[q + 1] = { kind: 'empty' };
			}
			const above = col[q - 1];
			if (prev.role === 'target' && above?.kind === 'cx' && above.role === 'control') {
				col[q - 1] = { kind: 'empty' };
			}
		}
		col[q] = { kind: 'empty' };
	};

	if (palette.kind === 'erase') {
		clearQubit(qubitIndex);
		next.columns[columnIndex] = sanitizeColumn(col, n);
		return next;
	}

	clearQubit(qubitIndex);

	if (palette.kind === 'single') {
		col[qubitIndex] = { kind: 'single', gate: palette.gate };
	} else if (palette.kind === 'measure') {
		col[qubitIndex] = { kind: 'measure' };
	} else if (palette.kind === 'cx') {
		if (qubitIndex >= n - 1) return state;
		clearQubit(qubitIndex);
		clearQubit(qubitIndex + 1);
		col[qubitIndex] = { kind: 'cx', role: 'control' };
		col[qubitIndex + 1] = { kind: 'cx', role: 'target' };
	}

	next.columns[columnIndex] = sanitizeColumn(col, n);
	return next;
}

export function addQubit(state: VisualCircuitState): VisualCircuitState {
	const next = cloneState(state);
	next.numQubits += 1;
	next.columns = next.columns.map(col => [...col, { kind: 'empty' }]);
	return next;
}

export function removeQubit(state: VisualCircuitState): VisualCircuitState {
	if (state.numQubits <= 1) return state;
	const next = cloneState(state);
	const n = next.numQubits - 1;
	next.numQubits = n;
	next.columns = next.columns.map(col => {
		const trimmed = col.slice(0, n);
		return sanitizeColumn(trimmed, n);
	});
	return next;
}

export function addMoment(state: VisualCircuitState): VisualCircuitState {
	const next = cloneState(state);
	next.columns.push(emptyColumn(next.numQubits));
	return next;
}

export function removeMoment(state: VisualCircuitState): VisualCircuitState {
	if (state.columns.length <= 1) return state;
	const next = cloneState(state);
	next.columns.pop();
	return next;
}

const QREG = /qreg\s+q\s*\[\s*(\d+)\s*\]\s*;/i;
const SINGLE = /^(h|x|y|z|s|sdg|t|tdg)\s+q\s*\[\s*(\d+)\s*\]\s*;\s*$/i;
const CX = /^cx\s+q\s*\[\s*(\d+)\s*\]\s*,\s*q\s*\[\s*(\d+)\s*\]\s*;\s*$/i;
const MEAS_SINGLE = /^measure\s+q\s*\[\s*(\d+)\s*\]\s*->\s*c\s*\[\s*(\d+)\s*\]\s*;\s*$/i;
const MEAS_BULK = /^measure\s+q\s*->\s*c\s*;\s*$/i;

function isHeaderLine(line: string) {
	const t = line.trim();
	return /^OPENQASM/i.test(t) || /^include\s+/i.test(t) || QREG.test(t) || /^creg\s+/i.test(t) || t === '';
}

const SINGLE_SET = new Set<string>(['h', 'x', 'y', 'z', 's', 'sdg', 't', 'tdg']);

/**
 * Best-effort import for circuits composed from the visual gate set.
 * Adjacent CNOTs only: cx q[i],q[i+1]; Returns null for unsupported constructs.
 */
export function tryImportOpenQasmToVisual(text: string): VisualCircuitState | null {
	const lines = text
		.split('\n')
		.map(l => l.trim())
		.filter(l => l.length > 0 && !l.startsWith('//'));

	let numQubits = 0;
	type Op =
		| { type: 'single'; gate: SingleQubitGate; q: number }
		| { type: 'cx'; control: number }
		| { type: 'measure'; q: number };

	const ops: Op[] = [];

	for (const line of lines) {
		if (isHeaderLine(line)) {
			const qm = line.match(QREG);
			if (qm) numQubits = Math.max(numQubits, Number(qm[1]));
			continue;
		}

		const sm = line.match(SINGLE);
		if (sm) {
			const g = sm[1]!.toLowerCase() as SingleQubitGate;
			const q = Number(sm[2]);
			if (!SINGLE_SET.has(g)) return null;
			ops.push({ type: 'single', gate: g, q });
			numQubits = Math.max(numQubits, q + 1);
			continue;
		}

		const cxm = line.match(CX);
		if (cxm) {
			const a = Number(cxm[1]);
			const b = Number(cxm[2]);
			if (b !== a + 1) return null;
			ops.push({ type: 'cx', control: a });
			numQubits = Math.max(numQubits, a + 2);
			continue;
		}

		const msm = line.match(MEAS_SINGLE);
		if (msm) {
			const q = Number(msm[1]);
			ops.push({ type: 'measure', q });
			numQubits = Math.max(numQubits, q + 1);
			continue;
		}

		if (MEAS_BULK.test(line)) {
			if (numQubits < 1) return null;
			for (let q = 0; q < numQubits; q++) {
				ops.push({ type: 'measure', q });
			}
			continue;
		}

		return null;
	}

	if (numQubits < 1) numQubits = 1;

	const columns: CircuitCell[][] = [];
	let measureBuffer: CircuitCell[] | null = null;

	const flushMeasures = () => {
		if (measureBuffer) {
			columns.push(sanitizeColumn(measureBuffer, numQubits));
			measureBuffer = null;
		}
	};

	const pushNonMeasureColumn = (col: CircuitCell[]) => {
		flushMeasures();
		columns.push(sanitizeColumn(col, numQubits));
	};

	for (const op of ops) {
		if (op.type === 'measure') {
			if (!measureBuffer) measureBuffer = emptyColumn(numQubits);
			measureBuffer[op.q] = { kind: 'measure' };
			continue;
		}

		flushMeasures();
		const col = emptyColumn(numQubits);
		if (op.type === 'single') {
			col[op.q] = { kind: 'single', gate: op.gate };
		} else {
			const c = op.control;
			if (c < 0 || c >= numQubits - 1) return null;
			col[c] = { kind: 'cx', role: 'control' };
			col[c + 1] = { kind: 'cx', role: 'target' };
		}
		pushNonMeasureColumn(col);
	}

	flushMeasures();

	if (columns.length === 0) {
		columns.push(emptyColumn(numQubits));
	}

	return { numQubits, columns };
}
