'use client';

import { create } from 'zustand';

import { buildCircuitPreview, countRuns, sortRunSummaries } from '@/lib/run-transformers';
import type { RunDetailSnapshot, RunSummary, RunsListSnapshot } from '@/types/runs';

type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

type RunsStoreState = {
	listSnapshot: RunsListSnapshot | null;
	listStatus: AsyncStatus;
	listRefreshing: boolean;
	listError: string | null;
	detailSnapshots: Record<string, RunDetailSnapshot>;
	detailStatus: Record<string, AsyncStatus>;
	detailRefreshing: Record<string, boolean>;
	detailErrors: Record<string, string | null>;
	startListLoading: (silent?: boolean) => void;
	setListSnapshot: (snapshot: RunsListSnapshot) => void;
	setListError: (message: string) => void;
	startDetailLoading: (runId: string, silent?: boolean) => void;
	setDetailSnapshot: (runId: string, snapshot: RunDetailSnapshot) => void;
	setDetailError: (runId: string, message: string) => void;
	optimisticallyAddRun: (jobId: string, circuitText: string) => void;
};

function upsertRunSummary(existingRuns: RunSummary[], summary: RunSummary) {
	return sortRunSummaries([summary, ...existingRuns.filter(run => run.id !== summary.id)]);
}

export const useRunsStore = create<RunsStoreState>()(set => ({
	listSnapshot: null,
	listStatus: 'idle',
	listRefreshing: false,
	listError: null,
	detailSnapshots: {},
	detailStatus: {},
	detailRefreshing: {},
	detailErrors: {},
	startListLoading: silent =>
		set(state => ({
			listStatus: state.listSnapshot && silent ? state.listStatus : 'loading',
			listRefreshing: Boolean(state.listSnapshot) || Boolean(silent),
			listError: silent ? state.listError : null
		})),
	setListSnapshot: snapshot =>
		set({
			listSnapshot: snapshot,
			listStatus: 'success',
			listRefreshing: false,
			listError: null
		}),
	setListError: message =>
		set(state => ({
			listStatus: state.listSnapshot ? 'success' : 'error',
			listRefreshing: false,
			listError: message
		})),
	startDetailLoading: (runId, silent) =>
		set(state => ({
			detailStatus: {
				...state.detailStatus,
				[runId]: state.detailSnapshots[runId] && silent ? (state.detailStatus[runId] ?? 'success') : 'loading'
			},
			detailRefreshing: {
				...state.detailRefreshing,
				[runId]: Boolean(state.detailSnapshots[runId]) || Boolean(silent)
			},
			detailErrors: {
				...state.detailErrors,
				[runId]: silent ? (state.detailErrors[runId] ?? null) : null
			}
		})),
	setDetailSnapshot: (runId, snapshot) =>
		set(state => {
			const nextRuns = state.listSnapshot ? upsertRunSummary(state.listSnapshot.runs, snapshot.run) : null;

			return {
				detailSnapshots: {
					...state.detailSnapshots,
					[runId]: snapshot
				},
				detailStatus: {
					...state.detailStatus,
					[runId]: 'success'
				},
				detailRefreshing: {
					...state.detailRefreshing,
					[runId]: false
				},
				detailErrors: {
					...state.detailErrors,
					[runId]: null
				},
				listSnapshot: nextRuns
					? {
							...state.listSnapshot!,
							runs: nextRuns,
							counts: countRuns(nextRuns)
						}
					: state.listSnapshot
			};
		}),
	setDetailError: (runId, message) =>
		set(state => ({
			detailStatus: {
				...state.detailStatus,
				[runId]: state.detailSnapshots[runId] ? 'success' : 'error'
			},
			detailRefreshing: {
				...state.detailRefreshing,
				[runId]: false
			},
			detailErrors: {
				...state.detailErrors,
				[runId]: message
			}
		})),
	optimisticallyAddRun: (jobId, circuitText) =>
		set(state => {
			if (!state.listSnapshot) {
				return {};
			}

			const now = new Date().toISOString();
			const optimisticRun: RunSummary = {
				id: jobId,
				backendStatus: 'QUEUED',
				statusLabel: 'Queued',
				statusGroup: 'queued',
				badgeVariant: 'secondary',
				circuitPreview: buildCircuitPreview(circuitText),
				planId: null,
				error: null,
				resultAvailable: false,
				createdAt: now,
				createdAtLabel: new Intl.DateTimeFormat('en-US', {
					dateStyle: 'medium',
					timeStyle: 'short'
				}).format(new Date(now)),
				updatedAt: now,
				updatedAtLabel: 'just now',
				progress: null
			};
			const nextRuns = upsertRunSummary(state.listSnapshot.runs, optimisticRun);

			return {
				listSnapshot: {
					...state.listSnapshot,
					runs: nextRuns,
					counts: countRuns(nextRuns)
				}
			};
		})
}));
