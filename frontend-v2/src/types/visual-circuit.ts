export type SingleQubitGate = 'h' | 'x' | 'y' | 'z' | 's' | 'sdg' | 't' | 'tdg';

export type PaletteItem =
	| { kind: 'single'; gate: SingleQubitGate }
	| { kind: 'measure' }
	| { kind: 'cx' }
	| { kind: 'erase' };

export type CircuitCell =
	| { kind: 'empty' }
	| { kind: 'single'; gate: SingleQubitGate }
	| { kind: 'measure' }
	| { kind: 'cx'; role: 'control' | 'target' };

export type VisualCircuitState = {
	numQubits: number;
	columns: CircuitCell[][];
};
