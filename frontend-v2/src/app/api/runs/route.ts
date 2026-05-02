import { NextRequest, NextResponse } from 'next/server';

import { BackendClientError, fetchBackendJson, getBackendBaseUrl } from '@/lib/backend-client';
import { normalizeFinancialJobList } from '@/lib/backend-normalizers';
import { buildRunsListSnapshot } from '@/lib/run-transformers';
import type { BackendOptionsJobListItem } from '@/lib/run-transformers';
import type {
	BackendCircuitSubmitRequest,
	BackendCircuitSubmitResponse,
	BackendHealthResponse,
	BackendJobListItemResponse,
	BackendJobStatus
} from '@/types/backend';
import type { BackendFinancialJobListItem, RunsApiError } from '@/types/runs';

export const dynamic = 'force-dynamic';

const VALID_BACKEND_STATUSES = new Set<BackendJobStatus>([
	'QUEUED',
	'COMPILING',
	'RESERVING',
	'EXECUTING',
	'COMPLETED',
	'FAILED'
]);

export async function GET(request: NextRequest) {
	const generatedAt = new Date().toISOString();
	const warnings: string[] = [];
	const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? '50');
	const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;
	const statuses = request.nextUrl.searchParams
		.getAll('status')
		.filter((status): status is BackendJobStatus => VALID_BACKEND_STATUSES.has(status as BackendJobStatus));

	try {
		const jobsPath = new URLSearchParams({
			limit: String(limit)
		});

		for (const status of statuses) {
			jobsPath.append('status', status);
		}

		const [healthResult, jobsResult, financeResult, optionsResult] = await Promise.allSettled([
			fetchBackendJson<BackendHealthResponse>('/api/v1/health'),
			fetchBackendJson<BackendJobListItemResponse[]>(`/api/v1/jobs?${jobsPath.toString()}`),
			fetchBackendJson<unknown[]>(`/api/v1/finance?limit=${limit}`),
			fetchBackendJson<BackendOptionsJobListItem[]>(`/api/v1/options?limit=${limit}`)
		]);

		let jobs: BackendJobListItemResponse[] = [];
		let jobsListUnavailable = false;
		let financialJobs: BackendFinancialJobListItem[] = [];
		let optionsJobs: BackendOptionsJobListItem[] = [];

		if (jobsResult.status === 'fulfilled') {
			jobs = jobsResult.value;
		} else {
			const reason = jobsResult.reason;
			if (reason instanceof BackendClientError) {
				if (reason.status === 404) {
					jobsListUnavailable = true;
					warnings.push(
						`Jobs API returned 404 — /api/v1/jobs is missing on the coordinator. Showing an empty run list. Backend: ${getBackendBaseUrl()}`
					);
				} else if (reason.status === 503 && process.env.NODE_ENV === 'development') {
					jobsListUnavailable = true;
					warnings.push(
						`Coordinator unreachable at ${getBackendBaseUrl()} (${reason.details ?? 'network error'}). Showing an empty run list for local development.`
					);
				} else {
					throw reason;
				}
			} else {
				throw reason;
			}
		}

		if (healthResult.status === 'rejected') {
			warnings.push('Coordinator health metadata is unavailable, but run history still loaded.');
		}

		if (financeResult.status === 'fulfilled') {
			financialJobs = normalizeFinancialJobList(financeResult.value);
		} else if (financeResult.status === 'rejected') {
			const reason = financeResult.reason;
			if (reason instanceof BackendClientError && reason.status === 404) {
				warnings.push(
					'Financial jobs API is not available on this coordinator — circuit runs still appear when listed.'
				);
			} else {
				warnings.push(
					`Financial analysis history could not be loaded (${reason instanceof BackendClientError ? (reason.details ?? reason.message) : 'unknown error'}).`
				);
			}
		}

		if (optionsResult.status === 'fulfilled') {
			optionsJobs = Array.isArray(optionsResult.value) ? optionsResult.value : [];
		} else if (optionsResult.status === 'rejected') {
			const reason = optionsResult.reason;
			if (!(reason instanceof BackendClientError && reason.status === 404)) {
				warnings.push(
					`Options pricing history could not be loaded (${reason instanceof BackendClientError ? (reason.details ?? reason.message) : 'unknown error'}).`
				);
			}
		}

		return NextResponse.json(
			buildRunsListSnapshot({
				generatedAt,
				health: healthResult.status === 'fulfilled' ? healthResult.value : null,
				jobs,
				financialJobs,
				optionsJobs,
				warnings,
				jobsListUnavailable
			})
		);
	} catch (error) {
		const status = error instanceof BackendClientError ? (error.status >= 500 ? 502 : error.status) : 500;
		const payload: RunsApiError = {
			error: 'Unable to load runs.',
			details:
				error instanceof BackendClientError
					? (error.details ?? error.message)
					: error instanceof Error
						? error.message
						: 'Unknown runs route failure.'
		};

		return NextResponse.json(payload, { status });
	}
}

export async function POST(request: NextRequest) {
	try {
		const body = (await request.json().catch(() => null)) as Partial<BackendCircuitSubmitRequest> | null;
		const circuit = body?.circuit?.trim();

		if (!circuit) {
			return NextResponse.json(
				{
					error: 'Circuit text is required.',
					details: 'Provide a non-empty OpenQASM circuit before queueing a run.'
				} satisfies RunsApiError,
				{ status: 400 }
			);
		}

		const payload = await fetchBackendJson<BackendCircuitSubmitResponse>('/api/v1/circuits/submit', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ circuit })
		});

		return NextResponse.json(payload);
	} catch (error) {
		const status = error instanceof BackendClientError ? (error.status >= 500 ? 502 : error.status) : 500;
		const payload: RunsApiError = {
			error: 'Unable to queue run.',
			details:
				error instanceof BackendClientError
					? (error.details ?? error.message)
					: error instanceof Error
						? error.message
						: 'Unknown submission failure.'
		};

		return NextResponse.json(payload, { status });
	}
}
