'use client';

import * as React from 'react';

type QuantumFullPayload = {
	statevector: string[] | null;
	reducedDensityMatrices: Record<string, string[][]> | null;
};

function messageFromUnknown(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return 'Something went wrong while loading the full quantum payload.';
}

export function useRunQuantumFullDetail(runId: string, enabled: boolean) {
	const [data, setData] = React.useState<QuantumFullPayload | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		setData(null);
		setError(null);
	}, [runId]);

	React.useEffect(() => {
		if (!enabled) {
			return;
		}

		const controller = new AbortController();

		async function load() {
			setLoading(true);
			setError(null);

			try {
				const response = await fetch(
					`/api/runs/${encodeURIComponent(runId)}?result_detail=full`,
					{
						method: 'GET',
						cache: 'no-store',
						headers: { Accept: 'application/json' },
						signal: controller.signal
					}
				);

				const payload = (await response.json().catch(() => null)) as
					| { run?: { quantumSummary?: QuantumFullPayload | null } }
					| { error?: string }
					| null;

				if (controller.signal.aborted) {
					return;
				}

				if (!response.ok) {
					const details =
						payload && 'error' in payload && typeof payload.error === 'string'
							? payload.error
							: `Request failed (${response.status}).`;
					throw new Error(details);
				}

				const summary =
					payload && 'run' in payload && payload.run?.quantumSummary
						? payload.run.quantumSummary
						: null;

				setData({
					statevector: summary?.statevector ?? null,
					reducedDensityMatrices: summary?.reducedDensityMatrices ?? null
				});
			} catch (err) {
				if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
					return;
				}
				setError(messageFromUnknown(err));
				setData(null);
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false);
				}
			}
		}

		void load();

		return () => controller.abort();
	}, [runId, enabled]);

	return { data, loading, error };
}
