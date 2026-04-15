const SERVICE_LABELS: Record<string, string> = {
	bell_pair: 'Bell Pair',
	cnot: 'CNOT',
	cz: 'CZ',
	controlled_unitary: 'Controlled Unitary',
	hadamard: 'Hadamard',
	programmable_gate: 'Programmable Gate',
	qft: 'QFT',
	teleportation: 'Teleportation',
	syndrome_extraction: 'Syndrome Extraction',
	distillation: 'Distillation',
	measurement_feedforward: 'Measurement Feedforward'
};

/** Service accent colors — only `var(--ds-svc-*)` from `src/app/globals.css`. */
export const FRAGMENT_SERVICE_STYLES: Record<
	string,
	{ stroke: string; fill: string; text: string; glow: string }
> = {
	bell_pair: {
		stroke: 'var(--ds-svc-bell-pair-stroke)',
		fill: 'var(--ds-svc-bell-pair-fill)',
		text: 'var(--ds-svc-bell-pair-text)',
		glow: 'var(--ds-svc-bell-pair-glow)'
	},
	cnot: {
		stroke: 'var(--ds-svc-cnot-stroke)',
		fill: 'var(--ds-svc-cnot-fill)',
		text: 'var(--ds-svc-cnot-text)',
		glow: 'var(--ds-svc-cnot-glow)'
	},
	cz: {
		stroke: 'var(--ds-svc-cz-stroke)',
		fill: 'var(--ds-svc-cz-fill)',
		text: 'var(--ds-svc-cz-text)',
		glow: 'var(--ds-svc-cz-glow)'
	},
	controlled_unitary: {
		stroke: 'var(--ds-svc-controlled-unitary-stroke)',
		fill: 'var(--ds-svc-controlled-unitary-fill)',
		text: 'var(--ds-svc-controlled-unitary-text)',
		glow: 'var(--ds-svc-controlled-unitary-glow)'
	},
	hadamard: {
		stroke: 'var(--ds-svc-hadamard-stroke)',
		fill: 'var(--ds-svc-hadamard-fill)',
		text: 'var(--ds-svc-hadamard-text)',
		glow: 'var(--ds-svc-hadamard-glow)'
	},
	programmable_gate: {
		stroke: 'var(--ds-svc-programmable-gate-stroke)',
		fill: 'var(--ds-svc-programmable-gate-fill)',
		text: 'var(--ds-svc-programmable-gate-text)',
		glow: 'var(--ds-svc-programmable-gate-glow)'
	},
	qft: {
		stroke: 'var(--ds-svc-qft-stroke)',
		fill: 'var(--ds-svc-qft-fill)',
		text: 'var(--ds-svc-qft-text)',
		glow: 'var(--ds-svc-qft-glow)'
	},
	teleportation: {
		stroke: 'var(--ds-svc-teleportation-stroke)',
		fill: 'var(--ds-svc-teleportation-fill)',
		text: 'var(--ds-svc-teleportation-text)',
		glow: 'var(--ds-svc-teleportation-glow)'
	},
	syndrome_extraction: {
		stroke: 'var(--ds-svc-syndrome-extraction-stroke)',
		fill: 'var(--ds-svc-syndrome-extraction-fill)',
		text: 'var(--ds-svc-syndrome-extraction-text)',
		glow: 'var(--ds-svc-syndrome-extraction-glow)'
	},
	distillation: {
		stroke: 'var(--ds-svc-distillation-stroke)',
		fill: 'var(--ds-svc-distillation-fill)',
		text: 'var(--ds-svc-distillation-text)',
		glow: 'var(--ds-svc-distillation-glow)'
	},
	measurement_feedforward: {
		stroke: 'var(--ds-svc-measurement-feedforward-stroke)',
		fill: 'var(--ds-svc-measurement-feedforward-fill)',
		text: 'var(--ds-svc-measurement-feedforward-text)',
		glow: 'var(--ds-svc-measurement-feedforward-glow)'
	}
};

export function formatFragmentServiceLabel(serviceType: string) {
	return SERVICE_LABELS[serviceType] || serviceType.replace(/_/g, ' ');
}

export function shortFragmentId(value: string, head = 8, tail = 5) {
	if (value.length <= head + tail + 3) {
		return value;
	}

	return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function formatFragmentPercent(value: number | null | undefined, digits = 1) {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return '--';
	}

	return `${(value * 100).toFixed(digits)}%`;
}
