export type RunStatus = 'current' | 'pending' | 'done';

export type RunRow = {
	id: string;
	name: string;
	status: RunStatus;
	startedAt: string;
};

/** Placeholder data until API is wired */
export const MOCK_RUNS: RunRow[] = [
	{ id: 'run-7f3a9c2b', name: 'Surface code distance-5', status: 'current', startedAt: '2026-04-09T14:22:00Z' },
	{ id: 'run-4d1e8a00', name: 'Randomized benchmarking batch', status: 'pending', startedAt: '2026-04-10T09:00:00Z' },
	{ id: 'run-9c2b1a44', name: 'QPE phase estimation', status: 'done', startedAt: '2026-04-08T11:15:00Z' },
	{ id: 'run-2a88f0d1', name: 'Topology calibration', status: 'done', startedAt: '2026-04-07T16:40:00Z' },
	{ id: 'run-6b31d9ee', name: 'Variational circuit sweep', status: 'pending', startedAt: '2026-04-10T12:05:00Z' }
];
