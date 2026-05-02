'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { AlertCircleIcon, ChevronDownIcon, Loader2Icon, PlusIcon, RefreshCcwIcon, WalletIcon } from 'lucide-react';

import { SectionCards } from '@/components/section-cards';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRunsList } from '@/hooks/use-runs-list';
import { RunStatusBadge } from '@/components/run-status-badge';
import { cn } from '@/lib/utils';
import type { DashboardSummaryCard } from '@/types/dashboard';
import type { RunStatusFilter } from '@/types/runs';

const FILTER_TABS: Array<{ value: RunStatusFilter; label: string; description: string }> = [
	{ value: 'running', label: 'Current', description: 'Queued and actively running' },
	{ value: 'completed', label: 'Done', description: 'Successfully completed' },
	{ value: 'all', label: 'All', description: 'Complete history' }
];

/** Shown when the list API fails so the grid still matches the dashboard layout */
const RUNS_ERROR_PLACEHOLDER_CARDS: DashboardSummaryCard[] = [
	{
		id: 'total',
		title: 'Total runs',
		value: '—',
		description: 'Metrics load when the coordinator responds.',
		footnote: 'Retry or check backend logs.'
	},
	{
		id: 'queued',
		title: 'Queued',
		value: '—',
		description: 'Queue depth unavailable.',
		footnote: 'Same layout as the dashboard overview.'
	},
	{
		id: 'running',
		title: 'Running',
		value: '—',
		description: 'Live runs unavailable.',
		footnote: 'Confirm QUANTUM_BACKEND_URL if needed.'
	},
	{
		id: 'completed',
		title: 'Completed',
		value: '—',
		description: 'Completed count unavailable.',
		footnote: ''
	},
	{
		id: 'failed',
		title: 'Failed',
		value: '—',
		description: 'Failed count unavailable.',
		footnote: ''
	}
];

function normalizeFilter(value: string | null): RunStatusFilter {
	switch (value) {
		case 'queued':
		case 'current':
		case 'running':
			return 'running';
		case 'completed':
		case 'done':
			return 'completed';
		case 'failed':
			return 'failed';
		default:
			return 'all';
	}
}

export function RunsPageClient() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const filter = normalizeFilter(searchParams.get('status'));
	const { snapshot, error, isLoading, isRefreshing, refresh } = useRunsList();
	const [financeOpen, setFinanceOpen] = useState(false);

	const jobsListUnavailable = Boolean(snapshot?.jobsListUnavailable);
	const rows = (snapshot?.runs ?? []).filter(run => {
		if (filter === 'all') return true;
		if (filter === 'running') return run.statusGroup === 'queued' || run.statusGroup === 'running';
		return run.statusGroup === filter;
	});

	const counts = snapshot?.counts ?? {
		total: 0,
		queued: 0,
		running: 0,
		completed: 0,
		failed: 0
	};

	const summaryCards: DashboardSummaryCard[] = useMemo(() => {
		if (!snapshot) return [];
		const c = snapshot.counts;
		return [
			{
				id: 'total',
				title: 'Total runs',
				value: String(c.total),
				description: 'Coordinator-registered jobs across every lifecycle state.',
				footnote: 'Use the status tabs below to match the table.'
			},
			{
				id: 'queued',
				title: 'Queued',
				value: String(c.queued),
				description: 'Waiting for execution capacity or scheduling.',
				footnote: 'Shown as queued in coordinator views.',
				...(c.queued > 0 ? { badge: { label: 'Backlog', variant: 'secondary' as const } } : {})
			},
			{
				id: 'running',
				title: 'Running',
				value: String(c.running),
				description: 'Circuits executing on workers right now.',
				footnote: 'Progress updates stream into the table.',
				...(c.running > 0 ? { badge: { label: 'Live', variant: 'default' as const } } : {})
			},
			{
				id: 'completed',
				title: 'Completed',
				value: String(c.completed),
				description: 'Finished successfully and ready for analysis.',
				footnote: 'Includes all successful terminal states.'
			},
			{
				id: 'failed',
				title: 'Failed',
				value: String(c.failed),
				description: 'Errors, timeouts, or user-cancelled jobs.',
				footnote: 'Open a run for logs and retry hints.',
				...(c.failed > 0 ? { badge: { label: 'Review', variant: 'destructive' as const } } : {})
			}
		];
	}, [snapshot]);

	const setFilter = (next: RunStatusFilter) => {
		const params = new URLSearchParams(searchParams.toString());

		if (next === 'all') {
			params.delete('status');
		} else {
			params.set('status', next);
		}

		const query = params.toString();
		router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
	};

	if (!snapshot && !isLoading && error) {
		return (
			<div className='flex flex-1 flex-col'>
				<div className='@container/main flex flex-1 flex-col gap-2'>
					<div className='flex flex-col gap-6 py-6'>
						<div className='flex flex-wrap items-start justify-between gap-4 px-4 lg:px-6'>
							<div className='space-y-1'>
								<h1 className='text-lg font-semibold tracking-tight'>Runs</h1>
								<p className='text-sm text-muted-foreground'>
									Coordinator-backed run history with live lifecycle status and fragment progress.
								</p>
							</div>
							<div className='flex flex-wrap items-center gap-2'>
								<Button
									variant='outline'
									size='sm'
									onClick={() => void refresh()}
									disabled={isRefreshing}
								>
									{isRefreshing ? <Loader2Icon className='animate-spin' /> : <RefreshCcwIcon />}
									Retry
								</Button>
								<Button
									size='sm'
									asChild
								>
									<Link href='/runs/new'>
										<PlusIcon />
										New run
									</Link>
								</Button>
							</div>
						</div>

						<div className='px-4 lg:px-6'>
							<Alert variant='destructive'>
								<AlertCircleIcon />
								<AlertTitle>Could not load run history</AlertTitle>
								<AlertDescription className='space-y-2'>
									<p>{error}</p>
									<p className='text-destructive/90'>
										Check that the coordinator is running and that{' '}
										<code className='rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs'>
											QUANTUM_BACKEND_URL
										</code>{' '}
										points at it (default{' '}
										<code className='rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs'>
											http://127.0.0.1:8081
										</code>
										). The jobs route must be{' '}
										<code className='rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs'>
											GET /api/v1/jobs
										</code>
										.
									</p>
								</AlertDescription>
							</Alert>
						</div>

						<SectionCards
							cards={RUNS_ERROR_PLACEHOLDER_CARDS}
							isLoading={false}
						/>

						<div className='px-4 lg:px-6'>
							<Card className='border-dashed border-border/80 shadow-sm'>
								<CardContent className='pb-8 pt-8'>
									<Empty className='border-0'>
										<EmptyHeader>
											<EmptyMedia variant='icon'>
												<AlertCircleIcon />
											</EmptyMedia>
											<EmptyTitle>No data loaded</EmptyTitle>
											<EmptyDescription className='max-w-md'>
												Fix the connection issue above, then use Retry. If the API is fixed, you
												should see section metrics and the table populate automatically.
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className='flex flex-1 flex-col'>
			<div className='@container/main flex flex-1 flex-col gap-2'>
				<div className='flex flex-col gap-6 py-6'>
					{/* Header */}
					<div className='flex flex-wrap items-start justify-between gap-4 px-4 lg:px-6'>
						<div className='space-y-1'>
							<div className='flex flex-wrap items-center gap-2'>
								<h1 className='text-lg font-semibold tracking-tight'>Runs</h1>
								{snapshot?.health ? (
									<RunStatusBadge
										label={`${snapshot.health.status.toUpperCase()} · ${snapshot.health.environment}`}
										variant={snapshot.health.status === 'ok' ? 'outline' : 'destructive'}
									/>
								) : null}
							</div>
							<p className='text-sm text-muted-foreground'>
								Quantum circuit runs and financial CSV analyses in one timeline — status, progress, and
								links back to each job.
							</p>
						</div>
						<div className='flex flex-wrap items-center gap-2'>
							<Button
								variant='outline'
								size='sm'
								onClick={() => void refresh()}
								disabled={isRefreshing}
							>
								{isRefreshing ? <Loader2Icon className='animate-spin' /> : <RefreshCcwIcon />}
								Refresh
							</Button>
							<Button
								size='sm'
								asChild
							>
								<Link href='/runs/new'>
									<PlusIcon />
									New run
								</Link>
							</Button>
						</div>
					</div>

					{/* Alerts */}
					{error && snapshot ? (
						<div className='px-4 lg:px-6'>
							<Alert variant='destructive'>
								<AlertCircleIcon />
								<AlertTitle>Showing the latest cached run history</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						</div>
					) : null}

					{jobsListUnavailable ? (
						<div className='px-4 lg:px-6'>
							<Alert variant='destructive'>
								<AlertCircleIcon />
								<AlertTitle>Run history unavailable</AlertTitle>
								<AlertDescription className='space-y-2'>
									<p>{snapshot?.warnings.join(' ')}</p>
									<p className='text-destructive/90'>
										Submits can still succeed while the list endpoint is missing or the coordinator
										is down. Restart the coordinator from this repository so it serves{' '}
										<code className='rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs'>
											GET /api/v1/jobs
										</code>{' '}
										(includes{' '}
										<code className='rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs'>
											circuit_preview
										</code>
										) and returns{' '}
										<code className='rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs'>
											circuit_text
										</code>{' '}
										on{' '}
										<code className='rounded bg-background/80 px-1.5 py-0.5 font-mono text-xs'>
											GET /api/v1/jobs/&lt;id&gt;
										</code>
										.
									</p>
								</AlertDescription>
							</Alert>
						</div>
					) : snapshot?.warnings.length ? (
						<div className='px-4 lg:px-6'>
							<Alert>
								<AlertCircleIcon />
								<AlertTitle>Partial backend data</AlertTitle>
								<AlertDescription>{snapshot.warnings.join(' ')}</AlertDescription>
							</Alert>
						</div>
					) : null}

					{/* Summary Cards */}
					<div className='px-4 lg:px-6'>
						<SectionCards
							cards={summaryCards}
							isLoading={isLoading}
						/>
					</div>

					{/* Tabs */}
					<div className='border-b border-border px-4 lg:px-6'>
						<div className='flex flex-wrap gap-1'>
							{FILTER_TABS.map(tab => {
								const isActive = tab.value === filter;
								const count =
									tab.value === 'all'
										? counts.total
										: tab.value === 'running'
											? counts.queued + counts.running
											: counts.completed;

								return (
									<button
										key={tab.value}
										type='button'
										onClick={() => setFilter(tab.value)}
										className={cn(
											'group relative flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-3 text-sm font-medium transition-colors',
											isActive
												? 'border-primary text-foreground'
												: 'border-transparent text-muted-foreground hover:text-foreground'
										)}
									>
										<span>{tab.label}</span>
										<span
											className={cn(
												'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
												isActive
													? 'bg-primary/10 text-primary'
													: 'bg-muted text-muted-foreground group-hover:bg-muted/80'
											)}
										>
											{count}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					{/* Finance Accordion */}
					<div className='px-4 lg:px-6'>
						<Collapsible
							open={financeOpen}
							onOpenChange={setFinanceOpen}
						>
							<Card className='border-border/80 shadow-sm'>
								<CollapsibleTrigger asChild>
									<CardHeader className='cursor-pointer hover:bg-muted/30'>
										<div className='flex items-center justify-between'>
											<div className='flex items-center gap-3'>
												<div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2'>
													<WalletIcon className='size-5' />
												</div>
												<div>
													<CardTitle className='text-base'>Finance</CardTitle>
													<CardDescription>
														Portfolio analysis and benchmark reports for CSV-based financial jobs
													</CardDescription>
												</div>
											</div>
											<ChevronDownIcon
												className={cn(
													'size-5 text-muted-foreground transition-transform duration-200',
													financeOpen && 'rotate-180'
												)}
											/>
										</div>
									</CardHeader>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<CardContent className='pt-0'>
										<div className='rounded-lg border border-border/60 bg-muted/20 p-4'>
											<p className='text-sm text-muted-foreground'>
												Financial analytics components will appear here. For detailed analysis, visit{' '}
												<Link
													href='/finance'
													className='font-medium text-primary hover:underline'
												>
													the Finance page
												</Link>
												.
											</p>
										</div>
									</CardContent>
								</CollapsibleContent>
							</Card>
						</Collapsible>
					</div>

					{/* Run History Table */}
					<div className='px-4 lg:px-6'>
						<Card className='border-border/80 shadow-sm'>
							<CardHeader>
								<CardTitle>Run history</CardTitle>
								<CardDescription>
									Circuit jobs and financial modelling jobs share this list (newest first). Open a row
									to view the run detail page or financial analytics.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{!snapshot && isLoading ? (
									<div className='p-6 text-sm text-muted-foreground'>Loading runs...</div>
								) : rows.length ? (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className='w-[38%]'>Run</TableHead>
												<TableHead>Status</TableHead>
												<TableHead className='hidden lg:table-cell'>Progress</TableHead>
												<TableHead className='hidden md:table-cell'>Started</TableHead>
												<TableHead>Updated</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{rows.map(row => {
											const detailHref =
												row.jobKind === 'financial'
													? `/finance?jobId=${encodeURIComponent(row.id)}`
													: row.jobKind === 'options'
														? `/options?jobId=${encodeURIComponent(row.id)}`
														: `/runs/${encodeURIComponent(row.id)}`;
												return (
													<TableRow key={row.id}>
														<TableCell>
															<Link
																href={detailHref}
																className='font-medium text-primary underline-offset-4 hover:underline'
															>
																{row.circuitPreview}
															</Link>
															<div className='mt-0.5 font-mono text-xs text-muted-foreground'>
																{row.id}
															</div>
															{row.jobKind === 'financial' ? (
																<div className='mt-1 text-xs text-muted-foreground'>
																	Financial analysis
																	{row.resultAvailable &&
																	row.backendStatus === 'COMPLETED'
																		? ' · result ready'
																		: ''}
																</div>
															) : row.jobKind === 'options' ? (
																<div className='mt-1 text-xs text-muted-foreground'>
																	Options pricing
																	{row.resultAvailable ? ' · result ready' : ''}
																</div>
															) : null}
															{row.planId ? (
																<div className='mt-1 text-xs text-muted-foreground'>
																	Plan {row.planId}
																</div>
															) : null}
															{row.error ? (
																<div className='mt-1 text-xs text-destructive'>
																	{row.error}
																</div>
															) : null}
														</TableCell>
														<TableCell>
															<div className='space-y-2'>
																<RunStatusBadge
																	label={row.statusLabel}
																	variant={row.badgeVariant}
																/>
																{row.progress ? (
																	<div className='text-xs text-muted-foreground'>
																		{row.progress.completedFragments}/
																		{row.progress.totalFragments}{' '}
																		{row.jobKind === 'financial'
																			? 'analysis phases'
																			: 'fragments'}{' '}
																		complete
																	</div>
																) : null}
															</div>
														</TableCell>
														<TableCell className='hidden lg:table-cell'>
															{row.progress ? (
																<div className='min-w-44 space-y-2'>
																	<Progress
																		value={row.progress.completionPercentage}
																	/>
																	<div className='text-xs text-muted-foreground'>
																		{row.progress.completionPercentage}% •{' '}
																		{row.progress.latestEventLabel}
																	</div>
																</div>
															) : (
																<span className='text-sm text-muted-foreground'>
																	Awaiting execution events
																</span>
															)}
														</TableCell>
														<TableCell className='hidden text-muted-foreground md:table-cell'>
															{row.createdAtLabel}
														</TableCell>
														<TableCell className='text-muted-foreground'>
															{row.updatedAtLabel}
														</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								) : (
									<Empty className='border border-dashed'>
										<EmptyHeader>
											<EmptyMedia variant='icon'>
												<AlertCircleIcon />
											</EmptyMedia>
											<EmptyTitle>
												{jobsListUnavailable
													? 'No rows to show — list API unavailable'
													: snapshot?.runs.length
														? 'No runs match this filter'
														: 'No runs have been queued yet'}
											</EmptyTitle>
											<EmptyDescription>
												{jobsListUnavailable
													? 'Fix the coordinator issue above (GET /api/v1/jobs). Jobs you already submitted may still exist; they will appear here after the API is available.'
													: snapshot?.runs.length
														? 'Switch filters or clear the current status view to see more runs.'
														: 'Queue a circuit from the new run screen to start tracking job status here.'}
											</EmptyDescription>
										</EmptyHeader>
										<Button asChild>
											<Link href='/runs/new'>Queue a run</Link>
										</Button>
									</Empty>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
