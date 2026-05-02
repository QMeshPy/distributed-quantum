import { NextRequest, NextResponse } from 'next/server';

import { applyBackendAuth, getBackendBaseUrl, readBackendErrorDetails } from '@/lib/backend-client';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
	const { jobId } = await params;

	try {
		const backendUrl = getBackendBaseUrl();
		const headers: Record<string, string> = { Accept: 'application/json' };
		applyBackendAuth(headers);

		const res = await fetch(`${backendUrl}/api/v1/options/${encodeURIComponent(jobId)}`, {
			headers,
			cache: 'no-store'
		});

		if (res.status === 404) {
			return NextResponse.json({ error: 'Options job not found.' }, { status: 404 });
		}
		if (!res.ok) {
			const details = await readBackendErrorDetails(res);
			return NextResponse.json({ error: 'Could not load options job.', details }, { status: res.status });
		}

		const data = await res.json();
		return NextResponse.json(data);
	} catch (err) {
		return NextResponse.json(
			{ error: 'Coordinator unreachable.', details: err instanceof Error ? err.message : 'Unknown' },
			{ status: 503 }
		);
	}
}
