'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { useRunsStore } from '@/store/runs-store';
import type { BackendCircuitSubmitResponse } from '@/types/backend';
import type { RunsApiError } from '@/types/runs';

type CreateRunInput = {
	circuit: string;
};

export function useCreateRun() {
	const router = useRouter();
	const optimisticallyAddRun = useRunsStore(state => state.optimisticallyAddRun);
	const [error, setError] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [, startTransition] = React.useTransition();

	const createRun = async ({ circuit }: CreateRunInput) => {
		setError(null);
		setIsSubmitting(true);

		try {
			const response = await fetch('/api/runs', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({ circuit })
			});
			const payload = (await response.json().catch(() => null)) as
				| BackendCircuitSubmitResponse
				| RunsApiError
				| null;

			if (!response.ok) {
				const message =
					payload && 'error' in payload
						? payload.details
							? `${payload.error} ${payload.details}`
							: payload.error
						: 'Failed to queue run.';

				throw new Error(message);
			}

			const submitResponse = payload as BackendCircuitSubmitResponse;
			optimisticallyAddRun(submitResponse.job_id, circuit);
			startTransition(() => {
				router.push(`/runs/${submitResponse.job_id}`);
			});

			return submitResponse;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to queue run.';
			setError(message);
			throw error;
		} finally {
			setIsSubmitting(false);
		}
	};

	return {
		createRun,
		error,
		isPending: isSubmitting
	};
}
