'use client';

import { create } from 'zustand';

import type { DashboardSnapshot } from '@/types/dashboard';

type DashboardStatus = 'idle' | 'loading' | 'success' | 'error';

type DashboardStoreState = {
	snapshot: DashboardSnapshot | null;
	status: DashboardStatus;
	isRefreshing: boolean;
	error: string | null;
	selectedNodeId: string | null;
	lastLoadedAt: string | null;
	startLoading: (silent?: boolean) => void;
	setSnapshot: (snapshot: DashboardSnapshot) => void;
	setError: (message: string) => void;
	selectNode: (nodeId: string) => void;
	clearSelectedNode: () => void;
};

export const useDashboardStore = create<DashboardStoreState>()(set => ({
	snapshot: null,
	status: 'idle',
	isRefreshing: false,
	error: null,
	selectedNodeId: null,
	lastLoadedAt: null,
	startLoading: silent =>
		set(state => {
			const hasSnapshot = state.snapshot !== null;

			return {
				status: hasSnapshot && silent ? state.status : 'loading',
				isRefreshing: hasSnapshot || Boolean(silent),
				error: silent ? state.error : null
			};
		}),
	setSnapshot: snapshot =>
		set(state => ({
			snapshot,
			status: 'success',
			isRefreshing: false,
			error: null,
			lastLoadedAt: new Date().toISOString(),
			selectedNodeId:
				state.selectedNodeId && snapshot.nodes.some(node => node.nodeId === state.selectedNodeId)
					? state.selectedNodeId
					: null
		})),
	setError: message =>
		set(state => ({
			status: state.snapshot ? 'success' : 'error',
			isRefreshing: false,
			error: message
		})),
	selectNode: nodeId =>
		set(state => ({
			selectedNodeId: state.selectedNodeId === nodeId ? null : nodeId
		})),
	clearSelectedNode: () =>
		set({
			selectedNodeId: null
		})
}));
