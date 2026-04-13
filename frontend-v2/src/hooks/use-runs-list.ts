'use client';

import * as React from 'react';

import { useRunsStore } from '@/store/runs-store';
import type { RunsApiError, RunsListSnapshot } from '@/types/runs';

type UseRunsListOptions = {
	limit?: number;
	refreshIntervalMs?: number;
};

async function requestRunsList(limit: number, signal?: AbortSignal) {
	const response = await fetch(`/api/runs?limit=${limit}`, {
		method: 'GET',
		cache: 'no-store',
		headers: {
			Accept: 'application/json'
		},
		signal
	});
	const payload = (await response.json().catch(() => null)) as RunsListSnapshot | RunsApiError | null;

	if (!response.ok) {
		const message =
			payload && 'error' in payload
				? payload.details
					? `${payload.error} ${payload.details}`
					: payload.error
				: 'Failed to load runs.';

		throw new Error(message);
	}

	return payload as RunsListSnapshot;
}

export function useRunsList({ limit = 50, refreshIntervalMs = 5_000 }: UseRunsListOptions = {}) {
	const snapshot = useRunsStore(state => state.listSnapshot);
	const status = useRunsStore(state => state.listStatus);
	const isRefreshing = useRunsStore(state => state.listRefreshing);
	const error = useRunsStore(state => state.listError);
	const startListLoading = useRunsStore(state => state.startListLoading);
	const setListSnapshot = useRunsStore(state => state.setListSnapshot);
	const setListError = useRunsStore(state => state.setListError);

	const loadRuns = React.useEffectEvent(
		async ({ silent = false, signal }: { silent?: boolean; signal?: AbortSignal } = {}) => {
			startListLoading(silent);

			try {
				const nextSnapshot = await requestRunsList(limit, signal);

				if (signal?.aborted) {
					return;
				}

				setListSnapshot(nextSnapshot);
			} catch (error) {
				if (signal?.aborted) {
					return;
				}

				setListError(error instanceof Error ? error.message : 'Failed to load runs.');
			}
		}
	);

	React.useEffect(() => {
		const controller = new AbortController();
		void loadRuns({
			silent: Boolean(useRunsStore.getState().listSnapshot),
			signal: controller.signal
		});

		return () => controller.abort();
	}, [limit]);

	React.useEffect(() => {
		if (!refreshIntervalMs) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void loadRuns({ silent: true });
		}, refreshIntervalMs);

		return () => window.clearInterval(intervalId);
	}, [limit, refreshIntervalMs]);

	return {
		snapshot,
		status,
		error,
		isRefreshing,
		isLoading: status === 'loading' && snapshot === null,
		refresh: () =>
			loadRuns({
				silent: Boolean(useRunsStore.getState().listSnapshot)
			})
	};
}
