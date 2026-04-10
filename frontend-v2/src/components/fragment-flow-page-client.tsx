'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { AlertCircleIcon, Loader2Icon, RefreshCcwIcon } from 'lucide-react';

import { FragmentFlowCanvas } from '@/components/fragment-flow-canvas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RunStatusBadge } from '@/components/run-status-badge';
import { useRunDetail } from '@/hooks/use-run-detail';
import { buildFragmentDagModel } from '@/lib/fragment-dag-model';
import {
	formatFragmentPercent,
	formatFragmentServiceLabel,
	shortFragmentId
} from '@/lib/fragment-flow-format';

type FragmentFlowPageClientProps = {
	runId: string;
};

export function FragmentFlowPageClient({ runId }: FragmentFlowPageClientProps) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const { snapshot, error, isLoading, isRefreshing, refresh } = useRunDetail(runId);

	const dagModel = React.useMemo(
		() =>
			snapshot ? buildFragmentDagModel(snapshot.plan, snapshot.run.fragmentResults) : null,
		[snapshot]
	);

	const fragmentParam = searchParams.get('fragment');
	const [selectedFragmentId, setSelectedFragmentId] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!snapshot?.plan) {
			setSelectedFragmentId(null);
			return;
		}

		const plan = snapshot.plan;
		const validIds = new Set(plan.fragments.map(f => f.fragmentId));

		if (fragmentParam && validIds.has(fragmentParam)) {
			setSelectedFragmentId(fragmentParam);
			return;
		}

		const fallback = plan.fragmentOrder[0] ?? null;
		setSelectedFragmentId(fallback);

		if (fragmentParam && !validIds.has(fragmentParam) && fallback) {
			const params = new URLSearchParams(searchParams.toString());
			params.set('fragment', fallback);
			router.replace(`/runs/${encodeURIComponent(runId)}/fragment-flow?${params.toString()}`, {
				scroll: false
			});
		}
	}, [fragmentParam, router, runId, searchParams, snapshot]);

	const selectFragment = React.useCallback(
		(fragmentId: string) => {
			setSelectedFragmentId(fragmentId);
			const params = new URLSearchParams(searchParams.toString());
			params.set('fragment', fragmentId);
			router.replace(`/runs/${encodeURIComponent(runId)}/fragment-flow?${params.toString()}`, {
				scroll: false
			});
		},
		[router, runId, searchParams]
	);

	if (!snapshot && !isLoading && error) {
		return (
			<div className='flex flex-col gap-6 p-4 md:p-6'>
				<Empty className='border border-dashed'>
					<EmptyHeader>
						<EmptyMedia variant='icon'>
							<AlertCircleIcon />
						</EmptyMedia>
						<EmptyTitle>Fragment flow unavailable</EmptyTitle>
						<EmptyDescription>{error}</EmptyDescription>
					</EmptyHeader>
					<Button asChild>
						<Link href={`/runs/${encodeURIComponent(runId)}`}>Back to run</Link>
					</Button>
				</Empty>
			</div>
		);
	}

	if (!snapshot && isLoading) {
		return <div className='p-6 text-sm text-muted-foreground'>Loading fragment flow…</div>;
	}

	if (!snapshot) {
		return null;
	}

	const { run, plan } = snapshot;
	const selectedFragment = plan?.fragments.find(f => f.fragmentId === selectedFragmentId) ?? null;
	const runtimeResult = run.fragmentResults.find(r => r.fragmentId === selectedFragmentId) ?? null;

	return (
		<div className='flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6'>
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div className='space-y-1'>
					<h1 className='text-lg font-semibold tracking-tight'>Fragment flow</h1>
					<p className='font-mono text-sm text-muted-foreground'>{run.id}</p>
				</div>
				<div className='flex flex-wrap gap-2'>
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
						<Link href={`/runs/${encodeURIComponent(runId)}`}>Run detail</Link>
					</Button>
					<Button
						variant='outline'
						size='sm'
						asChild
					>
						<Link href='/runs'>All runs</Link>
					</Button>
				</div>
			</div>

			{error ? (
				<Alert variant='destructive'>
					<AlertCircleIcon />
					<AlertTitle>Showing cached data</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{!plan || !dagModel ? (
				<Card>
					<CardHeader>
						<CardTitle>No plan graph yet</CardTitle>
						<CardDescription>
							This run does not have a loaded execution plan, so the fragment DAG cannot be rendered.
						</CardDescription>
					</CardHeader>
				</Card>
			) : (
				<div className='flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch'>
					<div className='flex min-h-0 min-w-0 flex-1 flex-col'>
						<FragmentFlowCanvas
							dagModel={dagModel}
							selectedFragmentId={selectedFragmentId}
							onSelectFragment={selectFragment}
						/>
					</div>

					<Card className='flex w-full shrink-0 flex-col border-border/80 shadow-sm lg:w-[min(100%,420px)] lg:max-w-md'>
						<CardHeader className='space-y-1'>
							<CardDescription>Selected fragment</CardDescription>
							<CardTitle className='font-mono text-base'>
								{selectedFragment ? selectedFragment.fragmentId : 'None'}
							</CardTitle>
						</CardHeader>
						<CardContent className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto'>
							{selectedFragment ? (
								<>
									<div className='flex flex-wrap items-center gap-2'>
										<RunStatusBadge
											label={formatFragmentServiceLabel(selectedFragment.serviceType)}
											variant='outline'
										/>
										<span className='text-sm text-muted-foreground'>
											{selectedFragment.operationCount} operations • q
											{selectedFragment.qubitsLabel}
										</span>
									</div>

									<div>
										<h3 className='mb-2 text-sm font-medium'>Planner routing</h3>
										<dl className='space-y-2 text-sm'>
											<div>
												<dt className='text-muted-foreground'>Primary node</dt>
												<dd className='font-mono text-xs break-all'>
													{selectedFragment.primaryNodeId ?? 'Not assigned'}
												</dd>
											</div>
											<div>
												<dt className='text-muted-foreground'>Fallback peers</dt>
												<dd className='font-mono text-xs break-all'>
													{selectedFragment.fallbackNodeIds.length
														? selectedFragment.fallbackNodeIds.join(', ')
														: 'None'}
												</dd>
											</div>
											<div>
												<dt className='text-muted-foreground'>Depends on</dt>
												<dd className='text-xs'>
													{selectedFragment.dependencies.length
														? selectedFragment.dependencies.join(', ')
														: 'Root fragment'}
												</dd>
											</div>
										</dl>
									</div>

									<div>
										<h3 className='mb-2 text-sm font-medium'>Operation IDs</h3>
										<pre className='max-h-40 overflow-auto rounded-xl border border-border/70 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed'>
											{selectedFragment.operationIds.length
												? selectedFragment.operationIds.join('\n')
												: '(none)'}
										</pre>
									</div>

									<Separator />

									<div>
										<h3 className='mb-2 text-sm font-medium'>Runtime execution</h3>
										{runtimeResult ? (
											<dl className='space-y-2 text-sm'>
												<div className='flex flex-wrap items-center gap-2'>
													<dt className='text-muted-foreground'>Status</dt>
													<dd>
														<RunStatusBadge
															label={runtimeResult.status}
															variant='secondary'
														/>
													</dd>
												</div>
												<div>
													<dt className='text-muted-foreground'>Worker node</dt>
													<dd className='font-mono text-xs break-all'>{runtimeResult.nodeId}</dd>
												</div>
												<div>
													<dt className='text-muted-foreground'>Attempts</dt>
													<dd>{runtimeResult.attempts}</dd>
												</div>
												<div>
													<dt className='text-muted-foreground'>Observed fidelity</dt>
													<dd>
														{runtimeResult.observedFidelity ??
															formatFragmentPercent(runtimeResult.observedFidelityRatio)}
													</dd>
												</div>
												<div>
													<dt className='text-muted-foreground'>Timeline</dt>
													<dd className='text-xs text-muted-foreground'>
														{runtimeResult.startedAtLabel} → {runtimeResult.finishedAtLabel}
													</dd>
												</div>
												{runtimeResult.error ? (
													<div>
														<dt className='text-destructive'>Error</dt>
														<dd className='text-destructive text-sm'>{runtimeResult.error}</dd>
													</div>
												) : null}
											</dl>
										) : (
											<p className='text-sm text-muted-foreground'>
												No runtime snapshot for this fragment yet.
											</p>
										)}
									</div>

									{selectedFragment.candidates.length ? (
										<>
											<Separator />
											<div>
												<h3 className='mb-2 text-sm font-medium'>Route candidates</h3>
												<p className='mb-2 text-xs text-muted-foreground'>
													Planner-scored alternatives (primary is the chosen route).
												</p>
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>Node</TableHead>
															<TableHead className='text-right'>Score</TableHead>
															<TableHead className='text-right'>Fidelity</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{selectedFragment.candidates.map(candidate => {
															const isPrimary = candidate.nodeId === selectedFragment.primaryNodeId;
															return (
																<TableRow
																	key={candidate.nodeId}
																	className={isPrimary ? 'bg-primary/5' : undefined}
																>
																	<TableCell className='max-w-[140px] font-mono text-[11px] break-all'>
																		{shortFragmentId(candidate.nodeId, 10, 4)}
																		{isPrimary ? (
																			<span className='ml-1 text-primary'>•</span>
																		) : null}
																	</TableCell>
																	<TableCell className='text-right text-xs'>
																		{candidate.totalCost.toFixed(3)}
																	</TableCell>
																	<TableCell className='text-right text-xs'>
																		{formatFragmentPercent(candidate.fidelity)}
																	</TableCell>
																</TableRow>
															);
														})}
													</TableBody>
												</Table>
											</div>
										</>
									) : null}
								</>
							) : (
								<p className='text-sm text-muted-foreground'>Click a node on the graph to inspect it.</p>
							)}
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
