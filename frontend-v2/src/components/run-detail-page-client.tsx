'use client';

import Link from 'next/link';
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import {
	ActivityIcon,
	AlertCircleIcon,
	FileCode2Icon,
	GitBranchIcon,
	Loader2Icon,
	RefreshCcwIcon,
	ScrollTextIcon,
	TimerIcon
} from 'lucide-react';

import { FragmentExecutionDataTable } from '@/components/fragment-execution-data-table';
import { FragmentFlowCanvas } from '@/components/fragment-flow-canvas';
import { PeerExecutionFlowSection } from '@/components/peer-execution-flow';
import { RunQuantumAnalysisSection } from '@/components/run-quantum-analysis-section';
import { RunStatusBadge } from '@/components/run-status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious
} from '@/components/ui/pagination';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useRunDetail } from '@/hooks/use-run-detail';
import { buildFragmentDagModel } from '@/lib/fragment-dag-model';
import { cn } from '@/lib/utils';

type RunDetailPageClientProps = {
	runId: string;
};

const PLAN_FRAGMENTS_PAGE_SIZE = 10;
const EXECUTION_RESULTS_PAGE_SIZE = 12;

function buildPaginationPageItems(
	current: number,
	total: number
): Array<number | 'ellipsis'> {
	if (total <= 1) {
		return [1];
	}
	const pages = new Set<number>();
	pages.add(1);
	pages.add(total);
	for (let p = current - 1; p <= current + 1; p++) {
		if (p >= 1 && p <= total) {
			pages.add(p);
		}
	}
	const sorted = [...pages].sort((a, b) => a - b);
	const out: Array<number | 'ellipsis'> = [];
	for (let i = 0; i < sorted.length; i++) {
		const p = sorted[i];
		const prev = sorted[i - 1];
		if (i > 0 && prev !== undefined && p - prev > 1) {
			out.push('ellipsis');
		}
		out.push(p);
	}
	return out;
}

/** Client-side pager built from shadcn `Pagination` (links use `href="#"` + `preventDefault`). */
function ClientPagination({
	page,
	pageCount,
	items,
	onPageChange,
	ariaLabel
}: {
	page: number;
	pageCount: number;
	items: Array<number | 'ellipsis'>;
	onPageChange: (next: number) => void;
	ariaLabel: string;
}) {
	if (pageCount <= 1) {
		return null;
	}

	const stop = (e: MouseEvent<HTMLAnchorElement>) => {
		e.preventDefault();
	};

	return (
		<Pagination
			aria-label={ariaLabel}
			className='border-t border-border/60 py-3'
		>
			<PaginationContent className='flex-wrap justify-center gap-2'>
				<PaginationItem>
					<PaginationPrevious
						aria-disabled={page <= 1}
						className={cn(page <= 1 && 'pointer-events-none opacity-50')}
						href='#'
						onClick={e => {
							stop(e);
							if (page > 1) {
								onPageChange(page - 1);
							}
						}}
					/>
				</PaginationItem>
				{items.map((item, index) =>
					item === 'ellipsis' ? (
						<PaginationItem key={`ellipsis-${index}`}>
							<PaginationEllipsis />
						</PaginationItem>
					) : (
						<PaginationItem key={item}>
							<PaginationLink
								href='#'
								isActive={item === page}
								size='icon'
								onClick={e => {
									stop(e);
									onPageChange(item);
								}}
							>
								{item}
							</PaginationLink>
						</PaginationItem>
					)
				)}
				<PaginationItem>
					<PaginationNext
						aria-disabled={page >= pageCount}
						className={cn(page >= pageCount && 'pointer-events-none opacity-50')}
						href='#'
						onClick={e => {
							stop(e);
							if (page < pageCount) {
								onPageChange(page + 1);
							}
						}}
					/>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	);
}

function StatCard({
	label,
	value,
	hint,
	className
}: {
	label: string;
	value: ReactNode;
	hint?: string;
	className?: string;
}) {
	return (
		<Card
			size='sm'
			className={cn(
				'gap-0 py-0 shadow-md ring-1 ring-foreground/5 transition-shadow hover:shadow-lg dark:ring-foreground/10',
				className
			)}
		>
			<CardHeader className='gap-1 px-4 pb-4 pt-4'>
				<CardDescription className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
					{label}
				</CardDescription>
				<CardTitle className='font-heading text-lg font-semibold tracking-tight tabular-nums sm:text-xl'>
					{value}
				</CardTitle>
				{hint ? <p className='text-muted-foreground text-xs leading-snug'>{hint}</p> : null}
			</CardHeader>
		</Card>
	);
}

export function RunDetailPageClient({ runId }: RunDetailPageClientProps) {
	const { snapshot, error, isLoading, isRefreshing, refresh } = useRunDetail(runId);
	const [embedFragmentId, setEmbedFragmentId] = useState<string | null>(null);

	const dagModel = useMemo(
		() =>
			snapshot?.plan ? buildFragmentDagModel(snapshot.plan, snapshot.run.fragmentResults) : null,
		[snapshot]
	);

	const selectedFragmentId = useMemo(() => {
		const plan = snapshot?.plan;
		if (!plan) {
			return null;
		}
		if (embedFragmentId && plan.fragments.some(f => f.fragmentId === embedFragmentId)) {
			return embedFragmentId;
		}
		return plan.fragmentOrder[0] ?? null;
	}, [snapshot?.plan, embedFragmentId]);

	const planForPagination = snapshot?.plan ?? null;
	const paginationScopeKey = `${runId}:${planForPagination?.planId ?? 'no-plan'}`;
	const [paginationState, setPaginationState] = useState(() => ({
		scopeKey: paginationScopeKey,
		planFragmentsPage: 1,
		executionResultsPage: 1
	}));
	const planFragments = planForPagination?.fragments ?? [];
	const planFragmentsPageCount = Math.max(
		1,
		Math.ceil(planFragments.length / PLAN_FRAGMENTS_PAGE_SIZE)
	);
	const rawPlanFragmentsPage =
		paginationState.scopeKey === paginationScopeKey ? paginationState.planFragmentsPage : 1;
	const planFragmentsPage = Math.min(rawPlanFragmentsPage, planFragmentsPageCount);
	const planFragmentsStart = (planFragmentsPage - 1) * PLAN_FRAGMENTS_PAGE_SIZE;
	const visiblePlanFragments = planFragments.slice(
		planFragmentsStart,
		planFragmentsStart + PLAN_FRAGMENTS_PAGE_SIZE
	);

	const fragmentResults = snapshot?.run.fragmentResults ?? [];
	const executionResultsPageCount = Math.max(
		1,
		Math.ceil(fragmentResults.length / EXECUTION_RESULTS_PAGE_SIZE)
	);
	const rawExecutionResultsPage =
		paginationState.scopeKey === paginationScopeKey ? paginationState.executionResultsPage : 1;
	const executionResultsPage = Math.min(rawExecutionResultsPage, executionResultsPageCount);
	const executionResultsStart = (executionResultsPage - 1) * EXECUTION_RESULTS_PAGE_SIZE;
	const visibleFragmentResults = fragmentResults.slice(
		executionResultsStart,
		executionResultsStart + EXECUTION_RESULTS_PAGE_SIZE
	);

	const setPlanFragmentsPage = (nextPage: number) =>
		setPaginationState(current => ({
			scopeKey: paginationScopeKey,
			planFragmentsPage: Math.max(1, nextPage),
			executionResultsPage:
				current.scopeKey === paginationScopeKey ? current.executionResultsPage : 1
		}));

	const setExecutionResultsPage = (nextPage: number) =>
		setPaginationState(current => ({
			scopeKey: paginationScopeKey,
			planFragmentsPage:
				current.scopeKey === paginationScopeKey ? current.planFragmentsPage : 1,
			executionResultsPage: Math.max(1, nextPage)
		}));

	const planFragmentPaginationItems = useMemo(
		() => buildPaginationPageItems(planFragmentsPage, planFragmentsPageCount),
		[planFragmentsPage, planFragmentsPageCount]
	);

	const executionPaginationItems = useMemo(
		() => buildPaginationPageItems(executionResultsPage, executionResultsPageCount),
		[executionResultsPage, executionResultsPageCount]
	);

	if (!snapshot && !isLoading && error) {
		return (
			<div className='p-4 md:p-6'>
				<Empty className='rounded-4xl border border-dashed border-border shadow-md'>
					<EmptyHeader>
						<EmptyMedia variant='icon'>
							<AlertCircleIcon />
						</EmptyMedia>
						<EmptyTitle>Run detail is unavailable</EmptyTitle>
						<EmptyDescription>{error}</EmptyDescription>
					</EmptyHeader>
					<Button asChild>
						<Link href='/runs'>Back to runs</Link>
					</Button>
				</Empty>
			</div>
		);
	}

	if (!snapshot && isLoading) {
		return (
			<div className='flex items-center gap-2 p-4 text-sm text-muted-foreground md:p-6'>
				<Loader2Icon className='size-4 animate-spin text-primary' />
				Loading run detail…
			</div>
		);
	}

	if (!snapshot) {
		return null;
	}

	const { run, plan, health } = snapshot;
	const quantum = run.quantumSummary;
	const circuitSourceMissing = run.circuitText.trim().length === 0;
	const runHeadline = circuitSourceMissing ? 'Circuit source not returned by API' : run.circuitPreview;

	const progressHint = run.progress
		? `${run.progress.completedFragments}/${run.progress.totalFragments} fragments`
		: undefined;

	const shotsDisplay = quantum?.shots != null ? String(quantum.shots) : '—';
	const measuredDisplay = quantum?.measuredQubits.length
		? quantum.measuredQubits.join(', ')
		: '—';

	return (
		<div className='space-y-6 bg-background p-4 pb-10 md:p-6'>
			{/* Hero — shadcn Card + theme gradient accents */}
			<Card className='relative overflow-hidden shadow-lg ring-1 ring-primary/10'>
				<div
					aria-hidden
					className='pointer-events-none absolute -end-32 -top-32 size-[22rem] rounded-full bg-primary/15 blur-3xl dark:bg-primary/25'
				/>
				<div
					aria-hidden
					className='pointer-events-none absolute -bottom-24 -start-24 size-72 rounded-full bg-chart-2/20 blur-3xl dark:bg-chart-2/15'
				/>
				<CardHeader className='relative border-b border-border/80 pb-6'>
					<div className='min-w-0 space-y-2'>
						<div className='flex flex-wrap items-center gap-2'>
							<CardTitle className='font-heading text-xl font-semibold tracking-tight md:text-2xl'>
								{runHeadline}
							</CardTitle>
							<RunStatusBadge
								label={run.statusLabel}
								variant={run.badgeVariant}
							/>
						</div>
						<CardDescription className='font-mono text-xs sm:text-sm'>{run.id}</CardDescription>
					</div>
					<CardAction>
						<div className='flex flex-wrap justify-end gap-2'>
							<Button
								size='sm'
								asChild
							>
								<Link href={`/runs/${encodeURIComponent(runId)}/fragment-flow`}>
									<GitBranchIcon data-icon='inline-start' />
									Fragment flow
								</Link>
							</Button>
							<Button
								variant='outline'
								size='sm'
								onClick={() => void refresh()}
								disabled={isRefreshing}
							>
								{isRefreshing ? (
									<Loader2Icon
										data-icon='inline-start'
										className='animate-spin'
									/>
								) : (
									<RefreshCcwIcon data-icon='inline-start' />
								)}
								Refresh
							</Button>
							<Button
								variant='outline'
								size='sm'
								asChild
							>
								<Link href='/runs'>Runs list</Link>
							</Button>
						</div>
					</CardAction>
					{run.progress ? (
						<div className='col-span-full mt-2 w-full space-y-2 border-t border-border/60 pt-5'>
							<div className='flex justify-between text-xs text-muted-foreground'>
								<span>Run progress</span>
								<span className='tabular-nums font-medium text-foreground'>
									{run.progress.completionPercentage}%
								</span>
							</div>
							<Progress value={run.progress.completionPercentage} />
						</div>
					) : null}
				</CardHeader>
			</Card>

			{/* Stats (3×2) + Provenance — equal height on large screens */}
			<div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22.5rem)] lg:items-stretch'>
				<div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2'>
					<StatCard
						label='Run status'
						value={run.statusLabel}
					/>
					<StatCard
						label='Progress'
						value={
							run.progress ? (
								<span className='tabular-nums'>{run.progress.completionPercentage}%</span>
							) : (
								<span className='text-muted-foreground'>—</span>
							)
						}
						hint={progressHint}
					/>
					<StatCard
						label='Shots'
						value={shotsDisplay}
						hint={quantum ? 'Result summary' : 'Pending'}
					/>
					<StatCard
						label='Measured qubits'
						value={
							<span className='break-all font-mono text-base font-normal sm:text-lg'>{measuredDisplay}</span>
						}
					/>
					<StatCard
						label='Plan'
						value={
							run.planId ? (
								<span className='line-clamp-2 break-all font-mono text-xs font-normal leading-snug sm:text-sm'>
									{run.planId}
								</span>
							) : (
								<span className='text-muted-foreground'>—</span>
							)
						}
					/>
					<StatCard
						label='Coordinator'
						value={
							health ? (
								<span className='text-base'>
									{health.service}{' '}
									<span className='font-mono text-sm font-normal text-muted-foreground'>
										v{health.version}
									</span>
								</span>
							) : (
								<span className='text-muted-foreground'>—</span>
							)
						}
						hint={health ? `${health.environment} · ${health.uptimeLabel}` : 'Health unavailable'}
					/>
				</div>
				<Card
					className={cn(
						'flex h-full min-h-0 flex-col gap-0 py-0 shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'
					)}
				>
					<CardHeader className='gap-3 border-b border-border/80 px-4 pb-4 pt-4'>
						<div className='flex items-start gap-3'>
							<div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground'>
								<TimerIcon className='size-5' />
							</div>
							<div className='min-w-0 space-y-1'>
								<CardTitle className='font-heading text-base'>Provenance</CardTitle>
								<CardDescription>Schedule and lineage.</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className='flex flex-1 flex-col gap-4 px-4 pb-4 pt-4'>
						<div>
							<p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>Created</p>
							<p className='mt-1 text-sm font-medium tabular-nums'>{run.createdAtLabel}</p>
						</div>
						<Separator />
						<div>
							<p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
								Last updated
							</p>
							<p className='text-muted-foreground mt-1 text-sm'>{run.updatedAtLabel}</p>
						</div>
						<Separator />
						<div className='min-h-0 flex-1'>
							<p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
								Plan reference
							</p>
							<p className='mt-1 break-all font-mono text-xs leading-relaxed'>{run.planId ?? '—'}</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{error ? (
				<Alert variant='destructive'>
					<AlertCircleIcon />
					<AlertTitle>Showing cached run detail</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{snapshot.warnings.length ? (
				<Alert>
					<AlertCircleIcon />
					<AlertTitle>Partial backend data</AlertTitle>
					<AlertDescription>{snapshot.warnings.join(' ')}</AlertDescription>
				</Alert>
			) : null}

			{circuitSourceMissing ? (
				<Alert variant='destructive'>
					<AlertCircleIcon />
					<AlertTitle>OpenQASM missing from job payload</AlertTitle>
					<AlertDescription>
						This coordinator build omits <code className='font-mono text-sm'>circuit_text</code> on{' '}
						<code className='font-mono text-sm'>GET /api/v1/jobs/&lt;id&gt;</code>. Upgrade the coordinator so
						the field is included.
					</AlertDescription>
				</Alert>
			) : null}

			{run.error ? (
				<Alert variant='destructive'>
					<AlertCircleIcon />
					<AlertTitle>Job error</AlertTitle>
					<AlertDescription>{run.error}</AlertDescription>
				</Alert>
			) : null}

			<div className='flex min-w-0 flex-col gap-6'>
					{/* Circuit + plan */}
					<div className='grid gap-6 lg:grid-cols-2'>
						<Card className='shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'>
							<CardHeader className='border-b border-border/80'>
								<div className='flex items-start gap-3'>
									<div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground'>
										<FileCode2Icon className='size-5' />
									</div>
									<div className='min-w-0 flex-1 space-y-1'>
										<CardTitle>Submitted circuit</CardTitle>
										<CardDescription>
											{circuitSourceMissing
												? 'API did not return stored circuit text.'
												: 'OpenQASM persisted by the backend.'}
										</CardDescription>
									</div>
								</div>
							</CardHeader>
							<CardContent className='pt-6'>
								<Textarea
									readOnly
									value={
										circuitSourceMissing
											? '(Not available — coordinator omitted circuit_text.)'
											: run.circuitText
									}
									className='min-h-[260px] resize-y rounded-3xl border-border bg-muted/30 font-mono text-sm leading-relaxed shadow-inner dark:bg-muted/20'
								/>
							</CardContent>
						</Card>

						<Card className='shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'>
							<CardHeader className='border-b border-border/80'>
								<div className='flex min-w-0 items-start gap-3'>
									<div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
										<ScrollTextIcon className='size-5' />
									</div>
									<div className='min-w-0 space-y-1'>
										<CardTitle>Execution plan</CardTitle>
										<CardDescription>
											{plan
												? `${plan.fragments.length} fragments · ${plan.fragmentOrder.length} ordered`
												: 'Plan not available yet.'}
										</CardDescription>
									</div>
								</div>
								<CardAction>
									<Button
										variant='secondary'
										size='sm'
										asChild
									>
										<Link href={`/runs/${encodeURIComponent(runId)}/fragment-flow`}>
											<GitBranchIcon data-icon='inline-start' />
											{plan ? 'Open graph' : 'Graph (pending)'}
										</Link>
									</Button>
								</CardAction>
							</CardHeader>
							<CardContent className='space-y-4 pt-6'>
								{plan ? (
									<>
										<dl className='grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm'>
											<dt className='text-muted-foreground font-medium'>Plan ID</dt>
											<dd className='break-all font-mono text-xs'>{plan.planId}</dd>
											<dt className='text-muted-foreground font-medium'>Quality</dt>
											<dd className='break-all font-mono text-xs'>
												{plan.qualitySnapshotId ?? '—'}
											</dd>
										</dl>
										<Separator />
										{dagModel && dagModel.nodes.length > 0 ? (
											<>
												<FragmentFlowCanvas
													variant='embed'
													dagModel={dagModel}
													selectedFragmentId={selectedFragmentId}
													onSelectFragment={setEmbedFragmentId}
												/>
												<Separator />
											</>
										) : null}
										<div className='space-y-2'>
											{visiblePlanFragments.map(fragment => (
												<div
													key={fragment.fragmentId}
													className='rounded-3xl border border-border/80 bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted/30'
												>
													<div className='flex flex-wrap items-center justify-between gap-2'>
														<span className='font-mono text-sm font-medium'>
															{fragment.fragmentId}
														</span>
														<RunStatusBadge
															label={fragment.serviceType}
															variant='outline'
														/>
													</div>
													<p className='text-muted-foreground mt-1.5 text-xs'>
														Qubits {fragment.qubitsLabel} · {fragment.operationCount} ops ·{' '}
														{fragment.dependencyCount} deps
													</p>
													<p className='text-muted-foreground mt-0.5 text-xs opacity-90'>
														Node {fragment.primaryNodeId ?? 'Pending'} · {fragment.candidateCount}{' '}
														candidates
													</p>
												</div>
											))}
										</div>
										<ClientPagination
											ariaLabel='Execution plan fragment pages'
											items={planFragmentPaginationItems}
											page={planFragmentsPage}
											pageCount={planFragmentsPageCount}
											onPageChange={setPlanFragmentsPage}
										/>
									</>
								) : (
									<p className='text-muted-foreground text-sm'>No plan for this run yet.</p>
								)}
							</CardContent>
						</Card>
					</div>

					<PeerExecutionFlowSection
						plan={plan}
						fragmentResults={run.fragmentResults}
					/>

					{/* Fragments */}
					<Card className='shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'>
						<CardHeader className='border-b border-border/80'>
							<div className='flex items-start gap-3'>
								<div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-chart-3/15 text-chart-3'>
									<ActivityIcon className='size-5' />
								</div>
								<div className='min-w-0 flex-1 space-y-1'>
									<CardTitle>Fragment execution</CardTitle>
									<CardDescription>Live and completed snapshots from the runtime.</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className='flex min-w-0 flex-col gap-0 p-0 pt-0'>
							{run.fragmentResults.length ? (
								<>
									<div className='max-h-[min(28rem,70vh)] min-h-0 w-full overflow-auto overscroll-contain'>
										<FragmentExecutionDataTable data={visibleFragmentResults} />
									</div>
									<ClientPagination
										ariaLabel='Fragment execution pages'
										items={executionPaginationItems}
										page={executionResultsPage}
										pageCount={executionResultsPageCount}
										onPageChange={setExecutionResultsPage}
									/>
								</>
							) : (
								<p className='text-muted-foreground px-4 py-6 text-sm md:px-6'>
									No fragment snapshots yet.
								</p>
							)}
						</CardContent>
					</Card>

					<RunQuantumAnalysisSection
						planQualitySnapshotId={plan?.qualitySnapshotId ?? null}
						quantum={quantum}
						run={run}
						runId={runId}
					/>
			</div>
		</div>
	);
}
