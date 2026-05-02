'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ActivityIcon, XCircleIcon } from 'lucide-react';

import { FinanceHero } from '@/components/financial/finance-hero';
import { FinanceJobCard } from '@/components/financial/finance-job-card';
import { FinanceJobProgress } from '@/components/financial/finance-job-progress';
import { FinanceRecentJobs } from '@/components/financial/finance-recent-jobs';
import { FinanceUploadPanel, type PortfolioSubmitFormState } from '@/components/financial/finance-upload-panel';
import { PortfolioResultDashboard } from '@/components/financial/portfolio-result-dashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { FinancialJobResponse, FinancialJobStatus } from '@/types/financial';
import type { BackendFinancialJobListItem } from '@/types/runs';

const POLL_INTERVAL_MS = 1500;

const INITIAL_FORM_STATE: PortfolioSubmitFormState = {
	budget: '',
	riskAversion: '0.5',
	maxAssetsConsidered: '6',
	valueMode: 'auto',
	parameterSearchSteps: '9',
	dateColumn: '',
	tickerColumn: '',
	valueColumn: ''
};

type FinanceSubmitResponse = {
	job_id: string;
	status: FinancialJobStatus;
	problem_type?: string;
};

function isTerminalStatus(status: FinancialJobStatus | null | undefined) {
	return status === 'COMPLETED' || status === 'FAILED';
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, {
		...init,
		cache: 'no-store',
		headers: {
			Accept: 'application/json',
			...(init?.headers ?? {})
		}
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

export function FinancialAnalyticsClient() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const activeJobId = searchParams.get('jobId');

	const [form, setForm] = React.useState(INITIAL_FORM_STATE);
	const [job, setJob] = React.useState<FinancialJobResponse | null>(null);
	const [recentJobs, setRecentJobs] = React.useState<BackendFinancialJobListItem[]>([]);
	const [uploadError, setUploadError] = React.useState<string | null>(null);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [isUploading, setIsUploading] = React.useState(false);
	const [isJobLoading, setIsJobLoading] = React.useState(false);
	const [isJobRefreshing, setIsJobRefreshing] = React.useState(false);
	const [isRecentJobsRefreshing, setIsRecentJobsRefreshing] = React.useState(false);
	const [lastSubmittedFileName, setLastSubmittedFileName] = React.useState<string | null>(null);

	React.useEffect(() => {
		const hash = window.location.hash.slice(1);
		if (hash) {
			setTimeout(() => {
				const element = document.getElementById(hash);
				if (element) {
					element.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			}, 100);
		}
	}, [job]);

	const loadRecentJobs = React.useEffectEvent(async () => {
		setIsRecentJobsRefreshing(true);
		try {
			const jobs = await requestJson<BackendFinancialJobListItem[]>('/api/finance');
			setRecentJobs(jobs);
		} catch (error) {
			setUploadError(error instanceof Error ? error.message : 'Failed to load finance jobs.');
		} finally {
			setIsRecentJobsRefreshing(false);
		}
	});

	const loadJob = React.useEffectEvent(
		async (jobId: string, { silent = false }: { silent?: boolean } = {}) => {
			if (silent) {
				setIsJobRefreshing(true);
			} else {
				setIsJobLoading(true);
			}

			try {
				const nextJob = await requestJson<FinancialJobResponse>(
					`/api/finance/${encodeURIComponent(jobId)}?result_detail=summary`
				);
				setJob(nextJob);
				setLoadError(null);

				if (isTerminalStatus(nextJob.status)) {
					void loadRecentJobs();
				}
			} catch (error) {
				setLoadError(error instanceof Error ? error.message : 'Failed to load finance job.');
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
		void loadRecentJobs();
	}, []);

	React.useEffect(() => {
		if (!activeJobId) {
			setJob(null);
			setLoadError(null);
			return;
		}

		void loadJob(activeJobId);
	}, [activeJobId]);

	React.useEffect(() => {
		if (!activeJobId || !job || isTerminalStatus(job.status) || loadError) {
			return;
		}

		const intervalId = window.setInterval(() => {
			void loadJob(activeJobId, { silent: true });
		}, POLL_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	}, [activeJobId, job, loadError]);

	const handleFormChange = React.useCallback((patch: Partial<PortfolioSubmitFormState>) => {
		setForm(current => ({ ...current, ...patch }));
	}, []);

	const navigateToJob = React.useCallback(
		(jobId: string | null) => {
			React.startTransition(() => {
				router.replace(jobId ? `/finance?jobId=${encodeURIComponent(jobId)}` : '/finance', { scroll: false });
			});
		},
		[router]
	);

	const handleFileSelected = React.useCallback(
		async (file: File) => {
			setIsUploading(true);
			setUploadError(null);
			setLoadError(null);
			setLastSubmittedFileName(file.name);

			try {
				const body = new FormData();
				body.append('file', file);
				body.append('problem_type', 'portfolio_optimization');

				if (form.budget.trim()) {
					body.append('budget', form.budget.trim());
				}
				body.append('risk_aversion', form.riskAversion.trim() || INITIAL_FORM_STATE.riskAversion);
				body.append(
					'max_assets_considered',
					form.maxAssetsConsidered.trim() || INITIAL_FORM_STATE.maxAssetsConsidered
				);
				body.append('value_mode', form.valueMode);
				body.append(
					'parameter_search_steps',
					form.parameterSearchSteps.trim() || INITIAL_FORM_STATE.parameterSearchSteps
				);

				if (form.dateColumn.trim()) {
					body.append('date_column', form.dateColumn.trim());
				}
				if (form.tickerColumn.trim()) {
					body.append('ticker_column', form.tickerColumn.trim());
				}
				if (form.valueColumn.trim()) {
					body.append('value_column', form.valueColumn.trim());
				}

				const submitted = await requestJson<FinanceSubmitResponse>('/api/finance', {
					method: 'POST',
					body
				});

				navigateToJob(submitted.job_id);
				void loadRecentJobs();
			} catch (error) {
				setUploadError(error instanceof Error ? error.message : 'Failed to submit finance job.');
			} finally {
				setIsUploading(false);
			}
		},
		[form, navigateToJob]
	);

	const result = job?.result ?? null;
	const displayedFileName = lastSubmittedFileName ?? job?.filename ?? 'No file submitted in this session.';

	return (
		<div className='space-y-6 p-4 pb-12 md:p-6'>
			<FinanceHero displayedFileName={displayedFileName} />

			{uploadError ? (
				<Alert variant='destructive'>
					<XCircleIcon className='size-4' />
					<AlertTitle>Submission error</AlertTitle>
					<AlertDescription>{uploadError}</AlertDescription>
				</Alert>
			) : null}

			{activeJobId ? (
				<div className='space-y-4'>
					<FinanceJobCard
						job={job}
						jobId={activeJobId}
						loadError={loadError}
						loading={isJobLoading}
						isRefreshing={isJobRefreshing}
						onRefresh={() => void loadJob(activeJobId, { silent: true })}
						onClear={() => navigateToJob(null)}
					/>
					{job && !isTerminalStatus(job.status) ? <FinanceJobProgress status={job.status} /> : null}
					{job && !result && job.status !== 'FAILED' ? (
						<div className='flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground'>
							<ActivityIcon className='size-3.5 shrink-0' />
							Polling — result payload not yet persisted.
						</div>
					) : null}
					{result && job ? <PortfolioResultDashboard result={result} jobId={job.job_id} /> : null}
				</div>
			) : (
				<div className='grid gap-6 lg:grid-cols-[1fr_320px]'>
					<FinanceUploadPanel
						form={form}
						fileName={lastSubmittedFileName}
						uploading={isUploading}
						onChange={handleFormChange}
						onFileSelected={handleFileSelected}
					/>
					<FinanceRecentJobs
						jobs={recentJobs}
						activeJobId={activeJobId}
						refreshing={isRecentJobsRefreshing}
						onRefresh={() => void loadRecentJobs()}
						onSelect={navigateToJob}
					/>
				</div>
			)}
		</div>
	);
}
