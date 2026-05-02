import { NextRequest, NextResponse } from 'next/server';

import { applyBackendAuth, getBackendBaseUrl, readBackendErrorDetails } from '@/lib/backend-client';

export const dynamic = 'force-dynamic';

/** POST /api/options — submit an options pricing job */
export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const backendUrl = getBackendBaseUrl();
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		};
		applyBackendAuth(headers);

		let res: Response;
		try {
			res = await fetch(`${backendUrl}/api/v1/options/submit`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				cache: 'no-store'
			});
		} catch (err) {
			return NextResponse.json(
				{ error: 'Coordinator unreachable.', details: err instanceof Error ? err.message : 'Network error' },
				{ status: 503 }
			);
		}

		if (!res.ok) {
			const detail = await readBackendErrorDetails(res);
			return NextResponse.json(
				{ error: 'Coordinator rejected the options job.', details: detail },
				{ status: res.status }
			);
		}

		const payload = await res.json();
		return NextResponse.json(payload, { status: 201 });
	} catch (error) {
		return NextResponse.json(
			{ error: 'Failed to submit options job.', details: error instanceof Error ? error.message : 'Unknown' },
			{ status: 500 }
		);
	}
}

/** GET /api/options — list recent options jobs */
export async function GET() {
	try {
		const backendUrl = getBackendBaseUrl();
		const headers: Record<string, string> = { Accept: 'application/json' };
		applyBackendAuth(headers);

		const res = await fetch(`${backendUrl}/api/v1/options?limit=20`, {
			headers,
			cache: 'no-store'
		});
		if (!res.ok) {
			const details = await readBackendErrorDetails(res);
			return NextResponse.json({ error: 'Could not load options jobs.', details }, { status: res.status });
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
