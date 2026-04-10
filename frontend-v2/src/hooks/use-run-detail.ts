'use client';

import * as React from 'react';

import { isTerminalRunStatus } from '@/lib/run-status';
import { useRunsStore } from '@/store/runs-store';
import type { RunDetailSnapshot, RunsApiError } from '@/types/runs';

type UseRunDetailOptions = {
	refreshIntervalMs?: number;
};

async function requestRunDetail(runId: string, signal?: AbortSignal) {
	const response = await fetch(`/api/runs/${encodeURIComponent(runId)}?result_detail=summary`, {
		method: 'GET',
		cache: 'no-store',
		headers: {
			Accept: 'application/json'
		},
		signal
	});
	const payload = (await response.json().catch(() => null)) as RunDetailSnapshot | RunsApiError | null;

	if (!response.ok) {
		const message =
			payload && 'error' in payload
				? payload.details
					? `${payload.error} ${payload.details}`
					: payload.error
				: `Failed to load run ${runId}.`;

		throw new Error(message);
	}

	return payload as RunDetailSnapshot;
}

export function useRunDetail(runId: string, { refreshIntervalMs = 2_000 }: UseRunDetailOptions = {}) {
	const snapshot = useRunsStore(state => state.detailSnapshots[runId] ?? null);
	const status = useRunsStore(state => state.detailStatus[runId] ?? 'idle');
	const isRefreshing = useRunsStore(state => state.detailRefreshing[runId] ?? false);
	const error = useRunsStore(state => state.detailErrors[runId] ?? null);
	const startDetailLoading = useRunsStore(state => state.startDetailLoading);
	const setDetailSnapshot = useRunsStore(state => state.setDetailSnapshot);
	const setDetailError = useRunsStore(state => state.setDetailError);
	const isTerminal = snapshot ? isTerminalRunStatus(snapshot.run.backendStatus) : false;

	const loadDetail = React.useEffectEvent(
		async ({ silent = false, signal }: { silent?: boolean; signal?: AbortSignal } = {}) => {
			startDetailLoading(runId, silent);

			try {
				const nextSnapshot = await requestRunDetail(runId, signal);

				if (signal?.aborted) {
					return;
				}

				setDetailSnapshot(runId, nextSnapshot);
			} catch (error) {
				if (signal?.aborted) {
					return;
				}

				setDetailError(runId, error instanceof Error ? error.message : `Failed to load run ${runId}.`);
			}
		}
	);

	React.useEffect(() => {
		const controller = new AbortController();
		void loadDetail({
			silent: Boolean(useRunsStore.getState().detailSnapshots[runId]),
			signal: controller.signal
		});

		return () => controller.abort();
	}, [runId]);

	React.useEffect(() => {
		if (!refreshIntervalMs) {
			return;
		}

		if (isTerminal) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void loadDetail({ silent: true });
		}, refreshIntervalMs);

		return () => window.clearInterval(intervalId);
	}, [isTerminal, refreshIntervalMs, runId]);

	return {
		snapshot,
		status,
		error,
		isRefreshing,
		isLoading: status === 'loading' && snapshot === null,
		refresh: () =>
			loadDetail({
				silent: Boolean(useRunsStore.getState().detailSnapshots[runId])
			})
	};
}
