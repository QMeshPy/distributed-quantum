'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
	ActivityIcon,
	BarChart2Icon,
	CheckCircle2Icon,
	CpuIcon,
	FileTextIcon,
	GitBranchIcon,
	Loader2Icon,
	UploadCloudIcon,
	XCircleIcon
} from 'lucide-react';

import { PortfolioResultDashboard } from '@/components/financial/portfolio-result-dashboard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { FinancialJobResponse, FinancialJobStatus } from '@/types/financial';
import type { BackendFinancialJobListItem } from '@/types/runs';

const POLL_INTERVAL_MS = 1500;

const FORM_INPUT_CLASS_NAME =
	'clay-input h-11 rounded-[1.15rem] border-[var(--clay-oat)] bg-white/90 px-4 text-sm shadow-none focus-visible:border-[var(--clay-blueberry)] focus-visible:ring-[rgb(56_89_249_/_0.18)]';
const FORM_SELECT_CLASS_NAME =
	'w-full [&_select]:clay-input [&_select]:h-11 [&_select]:rounded-[1.15rem] [&_select]:border-[var(--clay-oat)] [&_select]:bg-white/90 [&_select]:px-4 [&_select]:text-sm [&_select]:shadow-none [&_select]:focus-visible:border-[var(--clay-blueberry)] [&_select]:focus-visible:ring-[rgb(56_89_249_/_0.18)] [&_[data-slot=native-select-icon]]:text-[var(--clay-charcoal)]';
const PRIMARY_BUTTON_CLASS_NAME =
	'clay-hover-lift rounded-full border border-black/10 bg-[var(--clay-blueberry)] text-white shadow-[var(--clay-shadow)] hover:bg-[var(--clay-ube-dark)]';
const SECONDARY_BUTTON_CLASS_NAME =
	'clay-hover-lift rounded-full border border-[var(--clay-oat)] bg-white text-foreground shadow-[var(--clay-shadow)] hover:bg-[rgb(248_204_101_/_0.32)]';
const GHOST_BUTTON_CLASS_NAME =
	'rounded-full border border-transparent bg-transparent text-[var(--clay-charcoal)] hover:border-[var(--clay-oat)] hover:bg-white/80 hover:text-foreground';
const SOFT_BADGE_CLASS_NAME =
	'rounded-full border border-black/10 bg-white/78 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-foreground shadow-[var(--clay-shadow)]';

type FinanceSubmitResponse = {
	job_id: string;
	status: FinancialJobStatus;
	problem_type?: string;
};

type PortfolioSubmitFormState = {
	budget: string;
	riskAversion: string;
	maxAssetsConsidered: string;
	valueMode: 'auto' | 'prices' | 'returns';
	parameterSearchSteps: string;
	dateColumn: string;
	tickerColumn: string;
	valueColumn: string;
};

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

const STATUS_STEPS: FinancialJobStatus[] = ['QUEUED', 'INGESTING', 'ANALYSING', 'COMPLETED'];

function isTerminalStatus(status: FinancialJobStatus | null | undefined) {
	return status === 'COMPLETED' || status === 'FAILED';
}

function formatDateTime(isoValue: string | null | undefined) {
	if (!isoValue) {
		return '-';
	}

	const date = new Date(isoValue);
	if (Number.isNaN(date.getTime())) {
		return '-';
	}

	return new Intl.DateTimeFormat('en-US', {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(date);
}

function statusBadgeClassName(status: FinancialJobStatus) {
	switch (status) {
		case 'COMPLETED':
			return 'border-[rgb(2_73_42_/_0.14)] bg-[rgb(132_231_165_/_0.62)] text-[var(--clay-matcha-dark)]';
		case 'FAILED':
			return 'border-[rgb(201_76_87_/_0.24)] bg-[rgb(252_121_129_/_0.22)] text-[#842432]';
		default:
			return 'border-[rgb(1_65_141_/_0.16)] bg-[rgb(59_211_253_/_0.2)] text-[var(--clay-blueberry)]';
	}
}

function jobSummaryPanelClassName(status: FinancialJobStatus) {
	switch (status) {
		case 'COMPLETED':
			return 'clay-panel-matcha';
		case 'FAILED':
			return 'clay-panel-pomegranate';
		case 'ANALYSING':
			return 'clay-panel-ube';
		default:
			return 'clay-panel-slushie';
	}
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

function WorkflowStatusBadge({ status, className }: { status: FinancialJobStatus; className?: string }) {
	return (
		<Badge
			variant='outline'
			className={cn(
				'rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] shadow-[var(--clay-shadow)]',
				statusBadgeClassName(status),
				className
			)}
		>
			{status.toLowerCase()}
		</Badge>
	);
}

function HeroSignalCard({
	icon,
	label,
	description,
	toneClassName
}: {
	icon: React.ReactNode;
	label: string;
	description: string;
	toneClassName: string;
}) {
	return (
		<div
			className={cn(
				'clay-hover-lift rounded-[2rem] border border-black/10 p-5 shadow-[var(--clay-shadow)]',
				toneClassName
			)}
		>
			<div className='flex items-center gap-3'>
				<div className='clay-icon-chip bg-white/72 text-foreground'>{icon}</div>
				<p className='clay-label text-foreground'>{label}</p>
			</div>
			<p className='mt-4 text-sm leading-6 text-black/72'>{description}</p>
		</div>
	);
}

function FormField({
	label,
	htmlFor,
	hint,
	children
}: {
	label: string;
	htmlFor: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className='rounded-[1.55rem] border border-[var(--clay-oat-light)] bg-white/80 p-4 shadow-[var(--clay-shadow)]'>
			<Label
				htmlFor={htmlFor}
				className='clay-label text-[var(--clay-charcoal)]'
			>
				{label}
			</Label>
			<div className='mt-3'>{children}</div>
			{hint ? <p className='mt-3 text-xs leading-5 text-muted-foreground'>{hint}</p> : null}
		</div>
	);
}

function JobProgressBar({ status }: { status: FinancialJobStatus }) {
	const stepIndex = STATUS_STEPS.indexOf(status);
	const isFailed = status === 'FAILED';
	const effectiveIndex = isFailed ? STATUS_STEPS.length - 2 : Math.max(stepIndex, 0);
	const progress = isFailed ? 100 : Math.round(((Math.max(stepIndex, 0) + 1) / STATUS_STEPS.length) * 100);

	return (
		<div className='clay-card clay-panel-slushie space-y-5 p-5'>
			<div className='flex items-center justify-between gap-4'>
				<div>
					<p className='clay-label'>Live workflow</p>
					<p className='mt-2 text-base font-semibold text-foreground'>
						{isFailed
							? 'Execution stopped before completion'
							: status === 'QUEUED'
								? 'Queued for processing'
								: status === 'INGESTING'
									? 'Normalizing portfolio dataset'
									: status === 'ANALYSING'
										? 'Building and routing quantum solve'
										: 'Execution complete'}
					</p>
				</div>
				<WorkflowStatusBadge status={status} />
			</div>
			<Progress
				value={progress}
				className={cn(
					'h-3 rounded-full border border-black/10 bg-white/70 [&>div]:rounded-full',
					isFailed ? '[&>div]:bg-destructive' : '[&>div]:bg-[var(--clay-blueberry)]'
				)}
			/>
			<div className='grid grid-cols-2 gap-3 text-xs sm:grid-cols-4'>
				{STATUS_STEPS.map((step, index) => {
					const completed = index <= effectiveIndex;
					const current = !isFailed && index === stepIndex && status !== 'COMPLETED';
					const terminalFailure = isFailed && index === STATUS_STEPS.length - 1;

					return (
						<div
							key={step}
							className='rounded-[1.35rem] border border-black/10 bg-white/72 p-3 text-center shadow-[var(--clay-shadow)]'
						>
							<div
								className={cn(
									'mx-auto flex size-8 items-center justify-center rounded-full border text-[11px] shadow-[var(--clay-shadow)]',
									terminalFailure
										? 'border-[rgb(201_76_87_/_0.24)] bg-[rgb(252_121_129_/_0.2)] text-[#842432]'
										: completed
											? 'border-[rgb(2_73_42_/_0.14)] bg-[rgb(132_231_165_/_0.7)] text-[var(--clay-matcha-dark)]'
											: current
												? 'border-[rgb(1_65_141_/_0.16)] bg-[rgb(59_211_253_/_0.3)] text-[var(--clay-blueberry)]'
												: 'border-[var(--clay-oat)] bg-[var(--clay-cream)] text-muted-foreground'
								)}
							>
								{terminalFailure ? (
									<XCircleIcon className='size-3.5' />
								) : current ? (
									<Loader2Icon className='size-3.5 animate-spin' />
								) : completed ? (
									<CheckCircle2Icon className='size-3.5' />
								) : (
									index + 1
								)}
							</div>
							<p className='mt-3 font-medium text-foreground'>
								{step === 'QUEUED'
									? 'Queued'
									: step === 'INGESTING'
										? 'Ingest'
										: step === 'ANALYSING'
											? 'Optimize'
											: isFailed
												? 'Failed'
												: 'Complete'}
							</p>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function UploadPanel({
	form,
	fileName,
	uploading,
	onChange,
	onFileSelected
}: {
	form: PortfolioSubmitFormState;
	fileName: string | null;
	uploading: boolean;
	onChange: (patch: Partial<PortfolioSubmitFormState>) => void;
	onFileSelected: (file: File) => void;
}) {
	const fileInputRef = React.useRef<HTMLInputElement>(null);
	const [dragActive, setDragActive] = React.useState(false);

	const handleDrop = React.useCallback(
		(event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			setDragActive(false);
			const file = event.dataTransfer.files[0];
			if (file && file.name.toLowerCase().endsWith('.csv')) {
				onFileSelected(file);
			}
		},
		[onFileSelected]
	);

	return (
		<Card
			id='upload'
			style={{ scrollMarginTop: '5rem' }}
			className='clay-section overflow-hidden border-[var(--clay-oat)] bg-[rgb(255_255_255_/_0.76)] shadow-[var(--clay-shadow)]'
		>
			<CardHeader className='border-b border-[var(--clay-oat)]'>
				<div className='flex flex-wrap items-start justify-between gap-4'>
					<div className='max-w-2xl space-y-3'>
						<p className='clay-label'>Run a benchmark</p>
						<CardTitle className='text-2xl font-semibold tracking-[-0.04em] text-foreground md:text-4xl'>
							Feed one market dataset into the exact classical baseline and the routed quantum flow.
						</CardTitle>
						<CardDescription className='max-w-2xl text-sm leading-6 text-muted-foreground md:text-base'>
							Upload a real CSV, resolve the schema, compute the exact optimum, and submit the same screened
							problem into the Track B quantum stack. The UI below stays on the same data contract the backend
							now returns.
						</CardDescription>
					</div>
					<div className='rounded-[1.5rem] border border-black/10 bg-[rgb(255_255_255_/_0.8)] px-4 py-3 shadow-[var(--clay-shadow)]'>
						<p className='clay-label'>Accepted shapes</p>
						<div className='mt-3 flex flex-wrap gap-2'>
							<Badge className={SOFT_BADGE_CLASS_NAME}>long market tape</Badge>
							<Badge className={SOFT_BADGE_CLASS_NAME}>wide price matrix</Badge>
							<Badge className={SOFT_BADGE_CLASS_NAME}>returns or prices</Badge>
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className='space-y-6 pt-6'>
				<input
					ref={fileInputRef}
					type='file'
					accept='.csv'
					className='hidden'
					onChange={event => {
						const file = event.target.files?.[0];
						if (file) {
							onFileSelected(file);
						}
					}}
				/>

				<div
					onDragOver={event => {
						event.preventDefault();
						setDragActive(true);
					}}
					onDragLeave={() => setDragActive(false)}
					onDrop={handleDrop}
					className={cn(
						'clay-dashed rounded-[2.3rem] border-2 p-6 shadow-[var(--clay-shadow)] transition md:p-8',
						dragActive
							? 'border-[var(--clay-blueberry)] bg-[linear-gradient(135deg,rgba(59,211,253,0.34),rgba(255,255,255,0.94))]'
							: 'border-[var(--clay-oat)] bg-[linear-gradient(135deg,rgba(59,211,253,0.18),rgba(255,255,255,0.94))]'
					)}
				>
					<div className='flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between'>
						<div className='max-w-2xl space-y-4'>
							<div className='flex items-center gap-3'>
								<div className='clay-icon-chip bg-white/78 text-[var(--clay-blueberry)]'>
									<UploadCloudIcon className='size-5' />
								</div>
								<div>
									<p className='clay-label text-foreground'>Dataset intake</p>
									<p className='mt-2 text-xl font-semibold tracking-[-0.03em] text-foreground'>
										Drop a CSV or choose a file
									</p>
								</div>
							</div>
							<p className='text-sm leading-6 text-black/72 md:text-base'>
								Supported layouts: long format (`date`, `ticker`, `adjusted_close` or `return`) and wide
								format (`date`, `AAPL`, `MSFT`, `NVDA`, ...). The backend will infer a resolved shape unless
								you override the columns below.
							</p>
							<div className='flex flex-wrap gap-2'>
								<Badge className={SOFT_BADGE_CLASS_NAME}>date,ticker,adjusted_close</Badge>
								<Badge className={SOFT_BADGE_CLASS_NAME}>date,AAPL,MSFT,NVDA</Badge>
								<Badge className={SOFT_BADGE_CLASS_NAME}>value_mode=auto|prices|returns</Badge>
							</div>
						</div>
						<div className='rounded-[1.8rem] border border-black/10 bg-white/82 p-5 shadow-[var(--clay-shadow)] lg:min-w-[18rem]'>
							<p className='clay-label text-[var(--clay-charcoal)]'>Submission</p>
							<p className='mt-3 text-sm leading-6 text-muted-foreground'>
								{fileName ? `Ready: ${fileName}` : 'No CSV selected in this session yet.'}
							</p>
							<div className='mt-5 flex flex-wrap gap-3'>
								<Button
									type='button'
									onClick={() => fileInputRef.current?.click()}
									disabled={uploading}
									className={cn('h-11 px-5', PRIMARY_BUTTON_CLASS_NAME)}
								>
									{uploading ? (
										<Loader2Icon className='size-4 animate-spin' />
									) : (
										<UploadCloudIcon className='size-4' />
									)}
									{uploading ? 'Submitting...' : 'Choose CSV'}
								</Button>
								<Button
									type='button'
									variant='outline'
									onClick={() => fileInputRef.current?.click()}
									disabled={uploading}
									className={cn('h-11 px-5', SECONDARY_BUTTON_CLASS_NAME)}
								>
									Replace file
								</Button>
							</div>
						</div>
					</div>
				</div>

				<div className='grid gap-4 md:grid-cols-2'>
					<FormField
						label='Portfolio budget'
						htmlFor='budget'
						hint='Optional cardinality constraint. The backend validates it against the screened asset count.'
					>
						<Input
							id='budget'
							type='number'
							inputMode='numeric'
							min='1'
							placeholder='Optional'
							value={form.budget}
							onChange={event => onChange({ budget: event.target.value })}
							className={FORM_INPUT_CLASS_NAME}
						/>
					</FormField>
					<FormField
						label='Risk aversion'
						htmlFor='risk-aversion'
						hint='Higher values increase the penalty for volatility in the objective.'
					>
						<Input
							id='risk-aversion'
							type='number'
							inputMode='decimal'
							step='0.1'
							min='0'
							max='10'
							value={form.riskAversion}
							onChange={event => onChange({ riskAversion: event.target.value })}
							className={FORM_INPUT_CLASS_NAME}
						/>
					</FormField>
					<FormField
						label='Max assets considered'
						htmlFor='max-assets'
						hint='Upper bound for the screened universe sent into the binary optimization layer.'
					>
						<Input
							id='max-assets'
							type='number'
							inputMode='numeric'
							min='2'
							max='8'
							value={form.maxAssetsConsidered}
							onChange={event => onChange({ maxAssetsConsidered: event.target.value })}
							className={FORM_INPUT_CLASS_NAME}
						/>
					</FormField>
					<FormField
						label='Parameter search steps'
						htmlFor='search-steps'
						hint='Coarse search width for QAOA parameter exploration before local refinement.'
					>
						<Input
							id='search-steps'
							type='number'
							inputMode='numeric'
							min='3'
							max='25'
							value={form.parameterSearchSteps}
							onChange={event => onChange({ parameterSearchSteps: event.target.value })}
							className={FORM_INPUT_CLASS_NAME}
						/>
					</FormField>
					<FormField
						label='Value mode'
						htmlFor='value-mode'
						hint='Auto-detect raw prices versus already-derived returns from the uploaded columns.'
					>
						<NativeSelect
							id='value-mode'
							className={FORM_SELECT_CLASS_NAME}
							value={form.valueMode}
							onChange={event => onChange({ valueMode: event.target.value as PortfolioSubmitFormState['valueMode'] })}
						>
							<NativeSelectOption value='auto'>Auto detect</NativeSelectOption>
							<NativeSelectOption value='prices'>Prices</NativeSelectOption>
							<NativeSelectOption value='returns'>Returns</NativeSelectOption>
						</NativeSelect>
					</FormField>
					<FormField
						label='Date column override'
						htmlFor='date-column'
						hint='Use when your dataset does not expose a standard date column name.'
					>
						<Input
							id='date-column'
							placeholder='Optional'
							value={form.dateColumn}
							onChange={event => onChange({ dateColumn: event.target.value })}
							className={FORM_INPUT_CLASS_NAME}
						/>
					</FormField>
					<FormField
						label='Ticker column override'
						htmlFor='ticker-column'
						hint='Useful for long-format datasets where the symbol column uses a custom name.'
					>
						<Input
							id='ticker-column'
							placeholder='Optional'
							value={form.tickerColumn}
							onChange={event => onChange({ tickerColumn: event.target.value })}
							className={FORM_INPUT_CLASS_NAME}
						/>
					</FormField>
					<FormField
						label='Value column override'
						htmlFor='value-column'
						hint='Set this explicitly if the prices or returns column cannot be inferred cleanly.'
					>
						<Input
							id='value-column'
							placeholder='Optional'
							value={form.valueColumn}
							onChange={event => onChange({ valueColumn: event.target.value })}
							className={FORM_INPUT_CLASS_NAME}
						/>
					</FormField>
				</div>
			</CardContent>
		</Card>
	);
}

function SelectedJobCard({
	job,
	jobId,
	loadError,
	loading,
	isRefreshing,
	onRefresh,
	onClear
}: {
	job: FinancialJobResponse | null;
	jobId: string | null;
	loadError: string | null;
	loading: boolean;
	isRefreshing: boolean;
	onRefresh: () => void;
	onClear: () => void;
}) {
	return (
		<Card className='clay-card border-[var(--clay-oat)] bg-white/84 shadow-[var(--clay-shadow)]'>
			<CardHeader className='border-b border-[var(--clay-oat)]'>
				<div className='space-y-2'>
					<p className='clay-label'>Selected benchmark run</p>
					<CardTitle className='text-2xl font-semibold tracking-[-0.04em]'>Watch the active Track B job.</CardTitle>
					<CardDescription className='text-sm leading-6 text-muted-foreground'>
						{jobId
							? 'Track the live optimization workflow, inspect the result payload, and jump into the distributed run detail.'
							: 'Select a submitted finance job or upload a new market dataset.'}
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent className='space-y-4 pt-6'>
				{loadError ? (
					<Alert variant='destructive'>
						<XCircleIcon className='size-4' />
						<AlertTitle>Job load failed</AlertTitle>
						<AlertDescription>{loadError}</AlertDescription>
					</Alert>
				) : null}

				{loading && !job ? (
					<div className='clay-card clay-panel-slushie flex items-center gap-3 p-4 text-sm text-muted-foreground'>
						<Loader2Icon className='size-4 animate-spin' />
						Loading selected finance run...
					</div>
				) : null}

				{job ? (
					<>
						<div
							className={cn(
								'rounded-[2.15rem] border border-black/10 p-5 shadow-[var(--clay-shadow)]',
								jobSummaryPanelClassName(job.status)
							)}
						>
							<div className='flex flex-wrap items-start justify-between gap-4'>
								<div className='space-y-3'>
									<div className='flex flex-wrap items-center gap-2'>
										<WorkflowStatusBadge status={job.status} />
										<Badge className={SOFT_BADGE_CLASS_NAME}>
											{job.problem_type ?? job.result?.problem_type ?? 'portfolio_optimization'}
										</Badge>
									</div>
									<div className='space-y-2'>
										<p className='clay-label text-foreground'>Benchmark file</p>
										<p className='text-2xl font-semibold tracking-[-0.04em] text-foreground'>
											{job.filename}
										</p>
										<p className='font-mono text-xs text-black/65'>{job.job_id}</p>
									</div>
								</div>
								<div className='flex flex-wrap gap-2'>
									<Button
										variant='outline'
										size='sm'
										onClick={onRefresh}
										disabled={isRefreshing}
										className={cn('h-10 px-4', SECONDARY_BUTTON_CLASS_NAME)}
									>
										{isRefreshing ? (
											<Loader2Icon className='size-4 animate-spin' />
										) : (
											<ActivityIcon className='size-4' />
										)}
										Refresh
									</Button>
									<Button
										size='sm'
										asChild
										className={cn('h-10 px-4', PRIMARY_BUTTON_CLASS_NAME)}
									>
										<Link href={`/runs/${encodeURIComponent(job.job_id)}`}>
											<GitBranchIcon className='size-4' />
											Open run detail
										</Link>
									</Button>
									<Button
										variant='ghost'
										size='sm'
										onClick={onClear}
										className={cn('h-10 px-4', GHOST_BUTTON_CLASS_NAME)}
									>
										Clear
									</Button>
								</div>
							</div>
							<div className='mt-5 grid gap-3 sm:grid-cols-2'>
								<div className='rounded-[1.45rem] border border-black/10 bg-white/74 p-4 shadow-[var(--clay-shadow)]'>
									<p className='clay-label text-[var(--clay-charcoal)]'>Created</p>
									<p className='mt-2 text-sm text-foreground'>{formatDateTime(job.created_at)}</p>
								</div>
								<div className='rounded-[1.45rem] border border-black/10 bg-white/74 p-4 shadow-[var(--clay-shadow)]'>
									<p className='clay-label text-[var(--clay-charcoal)]'>Updated</p>
									<p className='mt-2 text-sm text-foreground'>{formatDateTime(job.updated_at)}</p>
								</div>
							</div>
						</div>

						{!isTerminalStatus(job.status) ? <JobProgressBar status={job.status} /> : null}
						{job.status === 'FAILED' && job.error ? (
							<Alert variant='destructive'>
								<XCircleIcon className='size-4' />
								<AlertTitle>Finance job failed</AlertTitle>
								<AlertDescription>{job.error}</AlertDescription>
							</Alert>
						) : null}
					</>
				) : !loading && !loadError ? (
					<div className='clay-card clay-dashed p-6 text-sm text-muted-foreground'>
						No finance run selected yet. Pick one from the recent jobs lane or submit a new CSV.
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function RecentJobsCard({
	jobs,
	activeJobId,
	refreshing,
	onRefresh,
	onSelect
}: {
	jobs: BackendFinancialJobListItem[];
	activeJobId: string | null;
	refreshing: boolean;
	onRefresh: () => void;
	onSelect: (jobId: string) => void;
}) {
	return (
		<Card className='clay-card border-[var(--clay-oat)] bg-white/84 shadow-[var(--clay-shadow)]'>
			<CardHeader className='border-b border-[var(--clay-oat)]'>
				<div className='flex flex-wrap items-start justify-between gap-4'>
					<div className='space-y-2'>
						<p className='clay-label'>Recent finance jobs</p>
						<CardTitle className='text-2xl font-semibold tracking-[-0.04em]'>Jump back into existing runs.</CardTitle>
						<CardDescription className='text-sm leading-6 text-muted-foreground'>
							Use an existing benchmark result or watch a live submission finish.
						</CardDescription>
					</div>
					<Button
						variant='outline'
						size='sm'
						onClick={onRefresh}
						disabled={refreshing}
						className={cn('h-10 px-4', SECONDARY_BUTTON_CLASS_NAME)}
					>
						{refreshing ? <Loader2Icon className='size-4 animate-spin' /> : <ActivityIcon className='size-4' />}
						Refresh jobs
					</Button>
				</div>
			</CardHeader>
			<CardContent className='space-y-3 pt-6'>
				{jobs.length === 0 ? (
					<div className='clay-card clay-dashed p-4 text-sm text-muted-foreground'>
						No finance jobs have been submitted yet.
					</div>
				) : (
					<div className='space-y-3'>
						{jobs.map(job => (
							<button
								key={job.job_id}
								type='button'
								onClick={() => onSelect(job.job_id)}
								className={cn(
									'clay-hover-lift w-full rounded-[1.7rem] border p-4 text-left shadow-[var(--clay-shadow)] transition',
									activeJobId === job.job_id
										? 'border-black/10 bg-[linear-gradient(135deg,rgba(132,231,165,0.34),rgba(255,255,255,0.95))]'
										: 'border-[var(--clay-oat)] bg-white/78 hover:bg-[linear-gradient(135deg,rgba(248,204,101,0.18),rgba(255,255,255,0.95))]'
								)}
							>
								<div className='flex flex-wrap items-start justify-between gap-3'>
									<div className='space-y-2'>
										<p className='font-semibold tracking-[-0.02em] text-foreground'>{job.filename}</p>
										<p className='font-mono text-xs text-muted-foreground'>{job.job_id}</p>
									</div>
									<WorkflowStatusBadge status={job.status} />
								</div>
								<div className='mt-4 flex flex-wrap gap-2'>
									<Badge className={SOFT_BADGE_CLASS_NAME}>{job.problem_type ?? 'portfolio_optimization'}</Badge>
									<Badge className={SOFT_BADGE_CLASS_NAME}>{formatDateTime(job.updated_at)}</Badge>
									<Badge className={SOFT_BADGE_CLASS_NAME}>
										{job.row_count != null && job.col_count != null
											? `${job.row_count.toLocaleString()} rows x ${job.col_count} cols`
											: 'Pending result'}
									</Badge>
								</div>
							</button>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
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

	// Handle hash-based navigation for section scrolling
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
		<div className='space-y-8 p-4 pb-12 md:p-6 lg:p-8'>
			<section className='clay-section overflow-hidden p-4 md:p-6'>
				<div className='grid gap-4 xl:grid-cols-[1.15fr_0.85fr]'>
					<div className='rounded-[2.6rem] border border-black/10 bg-[linear-gradient(135deg,rgba(248,204,101,0.9),rgba(255,255,255,0.62),rgba(193,176,255,0.32))] p-6 shadow-[var(--clay-shadow)] md:p-8'>
						<p className='clay-label text-foreground'>Track B / quantum versus classical</p>
						<h1 className='mt-4 max-w-4xl text-4xl font-semibold leading-[0.94] tracking-[-0.055em] text-foreground md:text-6xl'>
							One market dataset. One exact baseline. One routed quantum solve.
						</h1>
						<p className='mt-5 max-w-3xl text-base leading-7 text-black/72'>
							This finance page is wired to `backend-v2`. It screens the same portfolio universe, computes the
							exact classical optimum, synthesizes a QAOA circuit, and surfaces the distributed quantum evidence
							on the same run. No legacy analytics stub remains in this path.
						</p>
						<div className='mt-6 flex flex-wrap gap-2'>
							<Badge className={SOFT_BADGE_CLASS_NAME}>exact classical search</Badge>
							<Badge className={SOFT_BADGE_CLASS_NAME}>QAOA state ranking</Badge>
							<Badge className={SOFT_BADGE_CLASS_NAME}>distributed fragment routing</Badge>
							<Badge className={SOFT_BADGE_CLASS_NAME}>OpenQASM surfaced</Badge>
						</div>
					</div>

					<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-2'>
						<HeroSignalCard
							icon={<CheckCircle2Icon className='size-5' />}
							label='Accepted inputs'
							description='Long or wide market CSVs with dates plus prices or returns. Override columns only when inference is ambiguous.'
							toneClassName='clay-panel-matcha'
						/>
						<HeroSignalCard
							icon={<CpuIcon className='size-5' />}
							label='Quantum surface'
							description='Compiled QASM, top states, plan fragments, runtime route, and observed basis-state evidence are all exposed downstream.'
							toneClassName='clay-panel-ube'
						/>
						<HeroSignalCard
							icon={<BarChart2Icon className='size-5' />}
							label='Benchmark output'
							description='Objective gaps, overlap ratio, feasible probability mass, frontier rank, and comparison-report language land in the same payload.'
							toneClassName='clay-panel-slushie'
						/>
						<HeroSignalCard
							icon={<FileTextIcon className='size-5' />}
							label='Current file'
							description={displayedFileName}
							toneClassName='clay-panel-pomegranate'
						/>
					</div>
				</div>
			</section>

			{uploadError ? (
				<Alert variant='destructive'>
					<XCircleIcon className='size-4' />
					<AlertTitle>Submission error</AlertTitle>
					<AlertDescription>{uploadError}</AlertDescription>
				</Alert>
			) : null}

			<div className='grid gap-6 xl:grid-cols-[1.16fr_0.84fr]'>
				<UploadPanel
					form={form}
					fileName={lastSubmittedFileName}
					uploading={isUploading}
					onChange={handleFormChange}
					onFileSelected={handleFileSelected}
				/>
				<div className='space-y-6'>
					<SelectedJobCard
						job={job}
						jobId={activeJobId}
						loadError={loadError}
						loading={isJobLoading}
						isRefreshing={isJobRefreshing}
						onRefresh={() => {
							if (activeJobId) {
								void loadJob(activeJobId, { silent: true });
							}
						}}
						onClear={() => navigateToJob(null)}
					/>
					<RecentJobsCard
						jobs={recentJobs}
						activeJobId={activeJobId}
						refreshing={isRecentJobsRefreshing}
						onRefresh={() => void loadRecentJobs()}
						onSelect={navigateToJob}
					/>
				</div>
			</div>

			{job && !result && job.status !== 'FAILED' ? (
				<Alert>
					<ActivityIcon className='size-4' />
					<AlertTitle>Awaiting result payload</AlertTitle>
					<AlertDescription>
						The job record exists, but the final benchmark payload has not been persisted yet. Polling stays
						active until the backend returns the completed portfolio result.
					</AlertDescription>
				</Alert>
			) : null}

			{result && job ? <PortfolioResultDashboard result={result} jobId={job.job_id} /> : null}
		</div>
	);
}
