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

export const FRAGMENT_SERVICE_STYLES: Record<
	string,
	{ stroke: string; fill: string; text: string; glow: string }
> = {
	bell_pair: {
		stroke: '#0f766e',
		fill: 'rgba(15, 118, 110, 0.14)',
		text: '#0f766e',
		glow: 'rgba(20, 184, 166, 0.22)'
	},
	cnot: {
		stroke: '#c2410c',
		fill: 'rgba(194, 65, 12, 0.14)',
		text: '#c2410c',
		glow: 'rgba(249, 115, 22, 0.2)'
	},
	cz: {
		stroke: '#b45309',
		fill: 'rgba(180, 83, 9, 0.14)',
		text: '#b45309',
		glow: 'rgba(234, 179, 8, 0.18)'
	},
	controlled_unitary: {
		stroke: '#7c2d12',
		fill: 'rgba(124, 45, 18, 0.14)',
		text: '#7c2d12',
		glow: 'rgba(194, 65, 12, 0.18)'
	},
	hadamard: {
		stroke: '#0f766e',
		fill: 'rgba(13, 148, 136, 0.14)',
		text: '#0f766e',
		glow: 'rgba(45, 212, 191, 0.18)'
	},
	programmable_gate: {
		stroke: '#0f172a',
		fill: 'rgba(15, 23, 42, 0.12)',
		text: '#0f172a',
		glow: 'rgba(71, 85, 105, 0.18)'
	},
	qft: {
		stroke: '#1e3a8a',
		fill: 'rgba(30, 58, 138, 0.14)',
		text: '#1e3a8a',
		glow: 'rgba(37, 99, 235, 0.18)'
	},
	teleportation: {
		stroke: '#1d4ed8',
		fill: 'rgba(29, 78, 216, 0.14)',
		text: '#1d4ed8',
		glow: 'rgba(59, 130, 246, 0.18)'
	},
	syndrome_extraction: {
		stroke: '#15803d',
		fill: 'rgba(21, 128, 61, 0.14)',
		text: '#15803d',
		glow: 'rgba(34, 197, 94, 0.18)'
	},
	distillation: {
		stroke: '#be123c',
		fill: 'rgba(190, 18, 60, 0.14)',
		text: '#be123c',
		glow: 'rgba(244, 63, 94, 0.18)'
	},
	measurement_feedforward: {
		stroke: '#4338ca',
		fill: 'rgba(67, 56, 202, 0.14)',
		text: '#4338ca',
		glow: 'rgba(99, 102, 241, 0.18)'
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
