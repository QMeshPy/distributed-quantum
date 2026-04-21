import { NextResponse } from 'next/server';

import { applyBackendAuth, getBackendBaseUrl, readBackendErrorDetails } from '@/lib/backend-client';
import { normalizeFinancialComparisonReport } from '@/lib/backend-normalizers';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
	const { jobId } = await params;

	try {
		const backendUrl = getBackendBaseUrl();
		const headers: Record<string, string> = { Accept: 'application/json' };
		applyBackendAuth(headers);

		const response = await fetch(`${backendUrl}/api/v1/finance/${encodeURIComponent(jobId)}/comparison`, {
			headers,
			cache: 'no-store'
		});

		if (response.status === 404) {
			return NextResponse.json({ error: 'Financial comparison not found.' }, { status: 404 });
		}
		if (!response.ok) {
			const details = await readBackendErrorDetails(response);
			return NextResponse.json(
				{ error: 'Could not load financial comparison.', details },
				{ status: response.status }
			);
		}

		const payload = await response.json();
		const normalized = normalizeFinancialComparisonReport(payload);

		if (!normalized) {
			return NextResponse.json({ error: 'Financial comparison payload was invalid.' }, { status: 502 });
		}

		return NextResponse.json(normalized);
	} catch (error) {
		return NextResponse.json(
			{ error: 'Coordinator unreachable.', details: error instanceof Error ? error.message : 'Unknown' },
			{ status: 503 }
		);
	}
}
