import 'server-only';

type FetchBackendJsonOptions = Omit<RequestInit, 'cache'>;

const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8080';

export class BackendClientError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly details?: string
	) {
		super(message);
		this.name = 'BackendClientError';
	}
}

export function getBackendBaseUrl() {
	return (process.env.QUANTUM_BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
}

export async function fetchBackendJson<T>(pathname: string, init: FetchBackendJsonOptions = {}): Promise<T> {
	const url = new URL(pathname, `${getBackendBaseUrl()}/`);
	const headers = new Headers(init.headers);
	const apiKey = process.env.QUANTUM_BACKEND_API_KEY;

	headers.set('Accept', 'application/json');

	if (apiKey) {
		headers.set('X-API-Key', apiKey);
	}

	let response: Response;

	try {
		response = await fetch(url, {
			...init,
			cache: 'no-store',
			headers
		});
	} catch (error) {
		throw new BackendClientError(
			`Failed to reach backend at ${getBackendBaseUrl()}.`,
			503,
			error instanceof Error ? error.message : 'Unknown network error.'
		);
	}

	if (!response.ok) {
		let details: string | undefined;

		try {
			const body = (await response.json()) as { detail?: string } | null;
			details = body?.detail;
		} catch {
			details = response.statusText || undefined;
		}

		throw new BackendClientError(`Backend request failed for ${pathname}.`, response.status, details);
	}

	return (await response.json()) as T;
}
