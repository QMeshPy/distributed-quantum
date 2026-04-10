'use client';

import Link from 'next/link';
import { AlertCircleIcon, Loader2Icon, RefreshCcwIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useRunDetail } from '@/hooks/use-run-detail';
import { RunStatusBadge } from '@/components/run-status-badge';

type RunDetailPageClientProps = {
	runId: string;
};

export function RunDetailPageClient({ runId }: RunDetailPageClientProps) {
	const { snapshot, error, isLoading, isRefreshing, refresh } = useRunDetail(runId);

	if (!snapshot && !isLoading && error) {
		return (
			<div className='flex flex-col gap-6 p-4 md:p-6'>
				<Empty className='border border-dashed'>
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
		return <div className='p-6 text-sm text-muted-foreground'>Loading run detail...</div>;
	}

	if (!snapshot) {
		return null;
	}

	const { run, plan, health } = snapshot;
	const quantum = run.quantumSummary;
	const circuitSourceMissing = run.circuitText.trim().length === 0;
	const runHeadline = circuitSourceMissing ? 'Circuit source not returned by API' : run.circuitPreview;

	return (
		<div className='flex flex-col gap-6 p-4 md:p-6'>
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div className='space-y-2'>
					<div className='flex flex-wrap items-center gap-2'>
						<h1 className='text-lg font-semibold tracking-tight'>{runHeadline}</h1>
						<RunStatusBadge
							label={run.statusLabel}
							variant={run.badgeVariant}
						/>
					</div>
					<p className='font-mono text-sm text-muted-foreground'>{run.id}</p>
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
						variant='outline'
						size='sm'
						asChild
					>
						<Link href='/runs'>Back to runs</Link>
					</Button>
				</div>
			</div>

			{error ? (
				<Alert variant='destructive'>
					<AlertCircleIcon />
					<AlertTitle>Showing the latest cached run detail</AlertTitle>
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
					<AlertTitle>OpenQASM text is missing from the job payload</AlertTitle>
					<AlertDescription>
						This coordinator build omits <code className='font-mono text-xs'>circuit_text</code> on{' '}
						<code className='font-mono text-xs'>GET /api/v1/jobs/&lt;id&gt;</code>. Restart or upgrade the
						coordinator from the current project source so the field is included. The failed status below
						reflects the real job outcome from the backend.
					</AlertDescription>
				</Alert>
			) : null}

			<div className='grid gap-4 xl:grid-cols-3'>
				<Card>
					<CardHeader>
						<CardDescription>Status</CardDescription>
						<CardTitle>{run.statusLabel}</CardTitle>
					</CardHeader>
					<CardContent className='space-y-3'>
						{run.progress ? (
							<>
								<Progress value={run.progress.completionPercentage} />
								<p className='text-sm text-muted-foreground'>
									{run.progress.completionPercentage}% complete, {run.progress.completedFragments}/
									{run.progress.totalFragments} fragments finished.
								</p>
							</>
						) : (
							<p className='text-sm text-muted-foreground'>No fragment progress has been recorded yet.</p>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardDescription>Timing</CardDescription>
						<CardTitle>{run.createdAtLabel}</CardTitle>
					</CardHeader>
					<CardContent className='space-y-2 text-sm text-muted-foreground'>
						<p>Last updated {run.updatedAtLabel}</p>
						<p>{run.planId ? `Plan ${run.planId}` : 'Plan not generated yet'}</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardDescription>Coordinator</CardDescription>
						<CardTitle>{health ? `${health.service} v${health.version}` : 'Unavailable'}</CardTitle>
					</CardHeader>
					<CardContent className='space-y-2 text-sm text-muted-foreground'>
						<p>
							{health
								? `${health.environment} · uptime ${health.uptimeLabel}`
								: 'Health endpoint unavailable'}
						</p>
						{run.error ? <p className='text-destructive'>{run.error}</p> : null}
					</CardContent>
				</Card>
			</div>

			<div className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]'>
				<Card className='border-border/80 shadow-sm'>
					<CardHeader>
						<CardTitle>Submitted circuit</CardTitle>
						<CardDescription>
							{circuitSourceMissing
								? 'The API did not return stored circuit text for this job.'
								: 'The exact OpenQASM text persisted by the backend.'}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Textarea
							readOnly
							value={
								circuitSourceMissing
									? '(Not available — coordinator response omitted circuit_text.)'
									: run.circuitText
							}
							className='min-h-[360px] resize-y bg-muted/30 font-mono text-sm leading-relaxed'
						/>
					</CardContent>
				</Card>

				<Card className='border-border/80 shadow-sm'>
					<CardHeader>
						<CardTitle>Execution plan</CardTitle>
						<CardDescription>
							{plan
								? `${plan.fragments.length} fragments routed across the mesh.`
								: 'Plan data is not available yet.'}
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4'>
						{plan ? (
							<>
								<div className='grid gap-2 text-sm text-muted-foreground'>
									<p>Plan ID: {plan.planId}</p>
									<p>Quality snapshot: {plan.qualitySnapshotId ?? 'Unavailable'}</p>
								</div>
								<Separator />
								<div className='space-y-3'>
									{plan.fragments.map(fragment => (
										<div
											key={fragment.fragmentId}
											className='rounded-2xl border border-border/70 p-3'
										>
											<div className='flex flex-wrap items-center justify-between gap-2'>
												<p className='font-medium'>{fragment.fragmentId}</p>
												<RunStatusBadge
													label={fragment.serviceType}
													variant='outline'
												/>
											</div>
											<p className='mt-2 text-sm text-muted-foreground'>
												Qubits {fragment.qubitsLabel} • {fragment.operationCount} ops •{' '}
												{fragment.dependencyCount} deps
											</p>
											<p className='mt-1 text-xs text-muted-foreground'>
												Primary node {fragment.primaryNodeId ?? 'Pending'} •{' '}
												{fragment.candidateCount} candidates
											</p>
										</div>
									))}
								</div>
							</>
						) : (
							<p className='text-sm text-muted-foreground'>The run has not produced a plan yet.</p>
						)}
					</CardContent>
				</Card>
			</div>

			<Card className='border-border/80 shadow-sm'>
				<CardHeader>
					<CardTitle>Fragment execution</CardTitle>
					<CardDescription>Live and completed fragment snapshots reported by the runtime.</CardDescription>
				</CardHeader>
				<CardContent>
					{run.fragmentResults.length ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Fragment</TableHead>
									<TableHead>Node</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Attempts</TableHead>
									<TableHead>Fidelity</TableHead>
									<TableHead>Finished</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{run.fragmentResults.map(fragment => (
									<TableRow key={fragment.fragmentId}>
										<TableCell className='font-medium'>{fragment.fragmentId}</TableCell>
										<TableCell className='font-mono text-xs'>{fragment.nodeId}</TableCell>
										<TableCell>{fragment.status}</TableCell>
										<TableCell>{fragment.attempts}</TableCell>
										<TableCell>{fragment.observedFidelity ?? 'n/a'}</TableCell>
										<TableCell>{fragment.finishedAtLabel}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<p className='text-sm text-muted-foreground'>No fragment snapshots yet.</p>
					)}
				</CardContent>
			</Card>

			<Card className='border-border/80 shadow-sm'>
				<CardHeader>
					<CardTitle>Quantum result summary</CardTitle>
					<CardDescription>
						Counts, probabilities, and observables from the summary-grade backend result payload.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-6'>
					{quantum ? (
						<>
							<div className='grid gap-4 md:grid-cols-3'>
								<Card size='sm'>
									<CardHeader>
										<CardDescription>Shots</CardDescription>
										<CardTitle>{quantum.shots ?? 'n/a'}</CardTitle>
									</CardHeader>
								</Card>
								<Card size='sm'>
									<CardHeader>
										<CardDescription>Measured qubits</CardDescription>
										<CardTitle>
											{quantum.measuredQubits.length ? quantum.measuredQubits.join(', ') : 'n/a'}
										</CardTitle>
									</CardHeader>
								</Card>
								<Card size='sm'>
									<CardHeader>
										<CardDescription>Top basis states</CardDescription>
										<CardTitle>{quantum.topBasisStates.length}</CardTitle>
									</CardHeader>
								</Card>
							</div>

							<div className='grid gap-4 xl:grid-cols-2'>
								<div>
									<h3 className='mb-3 text-sm font-medium'>Counts</h3>
									{quantum.countBuckets.length ? (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>State</TableHead>
													<TableHead>Count</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{quantum.countBuckets.slice(0, 8).map(bucket => (
													<TableRow key={bucket.key}>
														<TableCell className='font-mono'>{bucket.key}</TableCell>
														<TableCell>{bucket.value}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									) : (
										<p className='text-sm text-muted-foreground'>
											No measurement counts available.
										</p>
									)}
								</div>
								<div>
									<h3 className='mb-3 text-sm font-medium'>Observable expectations</h3>
									{quantum.observableExpectations.length ? (
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Observable</TableHead>
													<TableHead>Value</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{quantum.observableExpectations.slice(0, 8).map(bucket => (
													<TableRow key={bucket.key}>
														<TableCell>{bucket.key}</TableCell>
														<TableCell>{bucket.value.toFixed(4)}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									) : (
										<p className='text-sm text-muted-foreground'>
											No observable summary available.
										</p>
									)}
								</div>
							</div>

							{quantum.topBasisStates.length ? (
								<div className='space-y-3'>
									<h3 className='text-sm font-medium'>Top basis states payload</h3>
									<pre className='overflow-x-auto rounded-2xl border border-border/70 bg-muted/30 p-4 text-xs'>
										{JSON.stringify(quantum.topBasisStates, null, 2)}
									</pre>
								</div>
							) : null}
						</>
					) : (
						<p className='text-sm text-muted-foreground'>No quantum result has been published yet.</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
