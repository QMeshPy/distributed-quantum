'use client';

import * as React from 'react';

import { useDashboardStore } from '@/store/dashboard-store';
import type { DashboardApiError, DashboardSnapshot } from '@/types/dashboard';

type UseDashboardDataOptions = {
	refreshIntervalMs?: number;
};

async function requestDashboardSnapshot(signal?: AbortSignal) {
	const response = await fetch('/api/dashboard', {
		method: 'GET',
		cache: 'no-store',
		headers: {
			Accept: 'application/json'
		},
		signal
	});

	const payload = (await response.json().catch(() => null)) as DashboardSnapshot | DashboardApiError | null;

	if (!response.ok) {
		const errorMessage =
			payload && 'error' in payload
				? payload.details
					? `${payload.error} ${payload.details}`
					: payload.error
				: 'Dashboard request failed.';

		throw new Error(errorMessage);
	}

	return payload as DashboardSnapshot;
}

export function useDashboardData({ refreshIntervalMs = 30_000 }: UseDashboardDataOptions = {}) {
	const snapshot = useDashboardStore(state => state.snapshot);
	const status = useDashboardStore(state => state.status);
	const isRefreshing = useDashboardStore(state => state.isRefreshing);
	const error = useDashboardStore(state => state.error);
	const selectedNodeId = useDashboardStore(state => state.selectedNodeId);
	const startLoading = useDashboardStore(state => state.startLoading);
	const setSnapshot = useDashboardStore(state => state.setSnapshot);
	const setError = useDashboardStore(state => state.setError);
	const selectNode = useDashboardStore(state => state.selectNode);
	const clearSelectedNode = useDashboardStore(state => state.clearSelectedNode);
	const initializedRef = React.useRef(false);

	const loadDashboard = React.useEffectEvent(
		async ({ silent = false, signal }: { silent?: boolean; signal?: AbortSignal } = {}) => {
			startLoading(silent);

			try {
				const nextSnapshot = await requestDashboardSnapshot(signal);

				if (signal?.aborted) {
					return;
				}

				setSnapshot(nextSnapshot);
			} catch (error) {
				if (signal?.aborted) {
					return;
				}

				setError(error instanceof Error ? error.message : 'Failed to load dashboard data.');
			}
		}
	);

	React.useEffect(() => {
		if (initializedRef.current) {
			return;
		}

		initializedRef.current = true;

		const controller = new AbortController();
		void loadDashboard({
			silent: Boolean(useDashboardStore.getState().snapshot),
			signal: controller.signal
		});

		return () => controller.abort();
	}, []);

	React.useEffect(() => {
		if (!refreshIntervalMs) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void loadDashboard({
				silent: true
			});
		}, refreshIntervalMs);

		return () => window.clearInterval(intervalId);
	}, [refreshIntervalMs]);

	return {
		snapshot,
		status,
		error,
		isRefreshing,
		selectedNodeId,
		isLoading: snapshot === null && status !== 'error',
		refresh: () =>
			loadDashboard({
				silent: Boolean(useDashboardStore.getState().snapshot)
			}),
		selectNode,
		clearSelectedNode
	};
}
