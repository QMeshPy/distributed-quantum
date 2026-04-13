import { NextResponse } from 'next/server';

import { BackendClientError, fetchBackendJson } from '@/lib/backend-client';
import { buildDashboardSnapshot } from '@/lib/dashboard-transformers';
import type { BackendFidelityMetricsResponse, BackendHealthResponse, BackendServiceResponse } from '@/types/backend';
import type { DashboardApiError } from '@/types/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
	const generatedAt = new Date().toISOString();
	const warnings: string[] = [];

	try {
		const [healthResult, servicesResult] = await Promise.allSettled([
			fetchBackendJson<BackendHealthResponse>('/api/v1/health'),
			fetchBackendJson<BackendServiceResponse[]>('/api/v1/services')
		]);

		if (servicesResult.status === 'rejected') {
			throw servicesResult.reason;
		}

		const health = healthResult.status === 'fulfilled' ? healthResult.value : null;
		const services = servicesResult.value;

		if (healthResult.status === 'rejected') {
			warnings.push('Backend health metadata is unavailable, but service data was still loaded.');
		}

		const uniqueNodeIds = [...new Set(services.map(service => service.node_id))];
		const fidelityResults = await Promise.allSettled(
			uniqueNodeIds.map(nodeId =>
				fetchBackendJson<BackendFidelityMetricsResponse>(
					`/api/v1/metrics/fidelity/${encodeURIComponent(nodeId)}`
				)
			)
		);

		const metrics: BackendFidelityMetricsResponse[] = [];

		fidelityResults.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				metrics.push(result.value);
				return;
			}

			warnings.push(`Could not load fidelity metrics for node ${uniqueNodeIds[index]}.`);
		});

		return NextResponse.json(
			buildDashboardSnapshot({
				generatedAt,
				health,
				services,
				metrics,
				warnings
			})
		);
	} catch (error) {
		const status = error instanceof BackendClientError ? (error.status >= 500 ? 502 : error.status) : 500;
		const payload: DashboardApiError = {
			error: 'Unable to load dashboard snapshot.',
			details:
				error instanceof BackendClientError
					? (error.details ?? error.message)
					: error instanceof Error
						? error.message
						: 'Unknown dashboard route failure.'
		};

		return NextResponse.json(payload, { status });
	}
}
