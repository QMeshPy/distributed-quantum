'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ActivityIcon, XCircleIcon } from 'lucide-react';

import { OptionsHero } from '@/components/options/options-hero';
import { OptionsInputPanel } from '@/components/options/options-input-panel';
import { OptionsJobCard } from '@/components/options/options-job-card';
import { OptionsJobProgress } from '@/components/options/options-job-progress';
import { OptionsResultDashboard } from '@/components/options/options-result-dashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { OptionsJobResponse, OptionsSubmitRequest } from '@/types/options';

const POLL_INTERVAL_MS = 2000;

function isTerminal(status: string | null | undefined) {
	return status === 'completed' || status === 'failed';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		...init,
		cache: 'no-store',
		headers: { Accept: 'application/json', ...(init?.headers ?? {}) }
	});
	const payload = (await response.json().catch(() => null)) as
		| { error?: string; details?: string }
		| T
		| null;

	if (!response.ok) {
		const message =
			payload && typeof payload === 'object' && 'error' in payload
				? [payload.error, payload.details].filter(Boolean).join(' ').trim()
				: `Request failed with status ${response.status}.`;
		throw new Error(message || `Request failed with status ${response.status}.`);
	}
	return payload as T;
}

export function OptionsAnalyticsClient() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const activeJobId = searchParams.get('jobId');

	const [job, setJob] = React.useState<OptionsJobResponse | null>(null);
	const [submitError, setSubmitError] = React.useState<string | null>(null);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = React.useState(false);
	const [isJobLoading, setIsJobLoading] = React.useState(false);
	const [isJobRefreshing, setIsJobRefreshing] = React.useState(false);

	const navigateToJob = React.useCallback(
		(jobId: string | null) => {
			React.startTransition(() => {
				router.replace(
					jobId ? `/options?jobId=${encodeURIComponent(jobId)}` : '/options',
					{ scroll: false }
				);
			});
		},
		[router]
	);

	const loadJob = React.useEffectEvent(
		async (jobId: string, { silent = false }: { silent?: boolean } = {}) => {
			if (silent) {
				setIsJobRefreshing(true);
			} else {
				setIsJobLoading(true);
			}
			try {
				const nextJob = await requestJson<OptionsJobResponse>(
					`/api/options/${encodeURIComponent(jobId)}`
				);
				setJob(nextJob);
				setLoadError(null);
			} catch (error) {
				setLoadError(error instanceof Error ? error.message : 'Failed to load options job.');
			} finally {
				if (silent) {
					setIsJobRefreshing(false);
				} else {
					setIsJobLoading(false);
				}
			}
		}
	);

	React.useEffect(() => {
		if (!activeJobId) {
			setJob(null);
			setLoadError(null);
			return;
		}
		void loadJob(activeJobId);
	}, [activeJobId]);

	React.useEffect(() => {
		if (!activeJobId || !job || isTerminal(job.status) || loadError) return;
		const id = window.setInterval(() => {
			void loadJob(activeJobId, { silent: true });
		}, POLL_INTERVAL_MS);
		return () => window.clearInterval(id);
	}, [activeJobId, job, loadError]);

	const handleSubmit = React.useCallback(
		async (req: OptionsSubmitRequest) => {
			setIsSubmitting(true);
			setSubmitError(null);
			setLoadError(null);

			try {
				const submitted = await requestJson<{ job_id: string }>('/api/options', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(req)
				});
				navigateToJob(submitted.job_id);
			} catch (error) {
				setSubmitError(error instanceof Error ? error.message : 'Failed to submit options job.');
			} finally {
				setIsSubmitting(false);
			}
		},
		[navigateToJob]
	);

	const result = job?.result ?? null;

	return (
		<div className='space-y-6 p-4 pb-12 md:p-6'>
			<OptionsHero />

			{submitError ? (
				<Alert variant='destructive'>
					<XCircleIcon className='size-4' />
					<AlertTitle>Submission error</AlertTitle>
					<AlertDescription>{submitError}</AlertDescription>
				</Alert>
			) : null}

			{activeJobId ? (
				<div className='space-y-4'>
					<OptionsJobCard
						job={job}
						jobId={activeJobId}
						loadError={loadError}
						loading={isJobLoading}
						isRefreshing={isJobRefreshing}
						onRefresh={() => void loadJob(activeJobId, { silent: true })}
						onClear={() => navigateToJob(null)}
					/>
					{job && !isTerminal(job.status) ? <OptionsJobProgress status={job.status} /> : null}
					{job && !result && job.status !== 'failed' ? (
						<div className='flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground'>
							<ActivityIcon className='size-3.5 shrink-0' />
							Polling — QAE circuit is running, result not yet available.
						</div>
					) : null}
					{result ? <OptionsResultDashboard result={result} /> : null}
				</div>
			) : (
				<OptionsInputPanel submitting={isSubmitting} onSubmit={handleSubmit} />
			)}
		</div>
	);
}
