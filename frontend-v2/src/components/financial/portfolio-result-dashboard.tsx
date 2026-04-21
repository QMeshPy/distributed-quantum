'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
	AlertTriangleIcon,
	BarChart2Icon,
	CheckCircle2Icon,
	CpuIcon,
	FileCode2Icon,
	GitBranchIcon,
	NetworkIcon,
	ScaleIcon,
	TrendingUpIcon,
	ZapIcon
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { PortfolioComparisonReportSection } from '@/components/financial/portfolio-comparison-report-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { FinancialAnalysisResult, PortfolioQuantumState } from '@/types/financial';

function formatNumber(value: number | null | undefined, digits = 4) {
	if (value == null || Number.isNaN(value)) {
		return '-';
	}

	return value.toFixed(digits);
}

function formatSignedNumber(value: number | null | undefined, digits = 6) {
	if (value == null || Number.isNaN(value)) {
		return '-';
	}

	return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatPercent(value: number | null | undefined, digits = 2) {
	if (value == null || Number.isNaN(value)) {
		return '-';
	}

	return `${(value * 100).toFixed(digits)}%`;
}

function formatDuration(milliseconds: number | null | undefined) {
	if (milliseconds == null || Number.isNaN(milliseconds)) {
		return '-';
	}

	if (milliseconds < 1000) {
		return `${milliseconds} ms`;
	}

	return `${(milliseconds / 1000).toFixed(2)} s`;
}

function ResultMetricCard({
	icon,
	label,
	value,
	detail
}: {
	icon: ReactNode;
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<div className='rounded-3xl border border-border/70 bg-background/70 p-4 shadow-sm'>
			<div className='flex items-start justify-between gap-3'>
				<div className='space-y-1'>
					<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>{label}</p>
					<p className='text-xl font-semibold tracking-tight'>{value}</p>
				</div>
				<div className='flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
					{icon}
				</div>
			</div>
			<p className='mt-3 text-sm text-muted-foreground'>{detail}</p>
		</div>
	);
}

function SelectionSummaryCard({
	title,
	icon,
	accentClassName,
	selection,
	extraLine
}: {
	title: string;
	icon: React.ReactNode;
	accentClassName: string;
	selection: PortfolioQuantumState;
	extraLine?: string;
}) {
	return (
		<div className={`rounded-3xl border p-4 ${accentClassName}`}>
			<div className='flex items-start justify-between gap-3'>
				<div>
					<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>{title}</p>
					<p className='mt-2 font-mono text-xl font-semibold'>{selection.bitstring || '-'}</p>
				</div>
				<div className='mt-1'>{icon}</div>
			</div>
			<div className='mt-4 space-y-1 text-sm text-muted-foreground'>
				<p>Objective: {formatSignedNumber(selection.objective)}</p>
				<p>Return: {formatPercent(selection.expected_return)}</p>
				<p>Volatility: {formatPercent(selection.volatility)}</p>
				<p>Assets: {selection.selected_assets.join(', ') || '-'}</p>
				{extraLine ? <p>{extraLine}</p> : null}
			</div>
		</div>
	);
}

export function PortfolioResultDashboard({ result, jobId }: { result: FinancialAnalysisResult; jobId: string }) {
	const frontier = result.benchmark.frontier.efficient_frontier;
	const topStates = result.quantum_execution?.top_states ?? [];
	const gateCounts = Object.entries(result.quantum_execution?.circuit_summary?.gate_counts ?? {}).sort(
		(left, right) => right[1] - left[1]
	);
	const assetChartData = result.asset_universe
		.slice()
		.sort((left, right) => right.selection_probability - left.selection_probability)
		.slice(0, 10)
		.map(asset => ({
			ticker: asset.ticker,
			returnPct: Number((asset.annualized_return * 100).toFixed(2)),
			selectionPct: Number((asset.selection_probability * 100).toFixed(2))
		}));
	const plan = result.quantum_execution?.plan;
	const hasPlan = Boolean(plan?.plan_id);
	const planAssignments = plan?.assignments ?? {};
	const planFragmentCount = hasPlan ? (plan?.fragment_order.length ?? 0) : 0;
	const fragmentResults = result.quantum_execution?.fragment_results ?? [];
	const fragmentStatusCounts = fragmentResults.reduce<Record<string, number>>((acc, fragment) => {
		acc[fragment.status] = (acc[fragment.status] ?? 0) + 1;
		return acc;
	}, {});
	const routedNodeCount = hasPlan
		? new Set(
				Object.values(planAssignments)
					.map(assignment => assignment.primary_node_id)
					.filter(nodeId => nodeId.length > 0)
			).size
		: result.distributed_nodes_used;
	const quantumResult = result.quantum_execution?.quantum_result;
	const observedBasisStates = quantumResult?.counts ? Object.keys(quantumResult.counts).length : 0;
	const hamiltonian = result.quantum_execution?.hamiltonian;

	return (
		<div className='space-y-6'>
			<div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
				<ResultMetricCard
					icon={<ScaleIcon className='size-5' />}
					label='Search Space'
					value={`${result.solver_diagnostics.feasible_portfolio_count} feasible`}
					detail={`${result.solver_diagnostics.total_binary_states.toLocaleString()} binary states screened at budget ${result.request.budget}`}
				/>
				<ResultMetricCard
					icon={<ZapIcon className='size-5' />}
					label='Quantum Rank'
					value={String(result.benchmark.frontier.quantum_rank ?? '-')}
					detail={`Percentile ${formatPercent(result.benchmark.frontier.quantum_percentile)} on the exact feasible set`}
				/>
				<ResultMetricCard
					icon={<TrendingUpIcon className='size-5' />}
					label='Feasible Mass'
					value={formatPercent(result.benchmark.comparison.feasible_probability_mass)}
					detail={`Optimum state probability ${formatPercent(result.benchmark.comparison.optimum_probability)}`}
				/>
				<ResultMetricCard
					icon={<NetworkIcon className='size-5' />}
					label='Runtime Route'
					value={`${result.fragments_executed} fragments`}
					detail={`${routedNodeCount} routed nodes and ${formatDuration(result.analysis_duration_ms)} end-to-end`}
				/>
			</div>

			{result.comparison_report ? (
				<PortfolioComparisonReportSection
					report={result.comparison_report}
					jobId={jobId}
				/>
			) : null}

			<div className='grid gap-6 xl:grid-cols-[1.15fr_0.85fr]'>
				<Card className='shadow-md ring-1 ring-foreground/5'>
					<CardHeader className='border-b border-border/70'>
						<CardTitle id='benchmark'>Exact benchmark summary</CardTitle>
						<CardDescription>
							Professional Track B baseline: exact classical enumeration against the best feasible quantum
							state.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-5 pt-6'>
						<p className='text-sm text-muted-foreground'>{result.summary}</p>
						<div className='grid gap-4 md:grid-cols-2'>
							<SelectionSummaryCard
								title='Classical optimum'
								icon={<CheckCircle2Icon className='size-5 text-emerald-600' />}
								accentClassName='border-emerald-500/20 bg-emerald-500/5'
								selection={result.benchmark.classical}
							/>
							<SelectionSummaryCard
								title='Quantum candidate'
								icon={<CpuIcon className='size-5 text-primary' />}
								accentClassName='border-primary/20 bg-primary/5'
								selection={result.benchmark.quantum}
								extraLine={`Probability: ${formatPercent(result.benchmark.quantum.probability)}`}
							/>
						</div>
						<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Objective gap
								</p>
								<p className='mt-2 text-lg font-semibold'>
									{formatSignedNumber(result.benchmark.comparison.objective_gap)}
								</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Objective ratio
								</p>
								<p className='mt-2 text-lg font-semibold'>
									{formatNumber(result.benchmark.comparison.objective_ratio, 4)}
								</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Asset overlap
								</p>
								<p className='mt-2 text-lg font-semibold'>
									{formatPercent(result.benchmark.comparison.overlap_ratio)}
								</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>On frontier</p>
								<p className='mt-2 text-lg font-semibold'>
									{result.benchmark.frontier.quantum_on_frontier ? 'Yes' : 'No'}
								</p>
							</div>
						</div>
						<div className='flex flex-wrap gap-2'>
							<Badge variant='secondary'>{result.dataset.input_layout} input</Badge>
							<Badge variant='secondary'>{result.dataset.inferred_frequency}</Badge>
							<Badge variant='secondary'>{result.request.resolved_value_mode}</Badge>
							<Badge variant='outline'>{result.solver_diagnostics.allocation_model}</Badge>
						</div>
						<Button asChild>
							<Link href={`/runs/${encodeURIComponent(jobId)}`}>
								<GitBranchIcon className='size-4' />
								Inspect distributed run detail
							</Link>
						</Button>
					</CardContent>
				</Card>

				<Card className='shadow-md ring-1 ring-foreground/5'>
					<CardHeader className='border-b border-border/70'>
						<CardTitle>Dataset and solver context</CardTitle>
						<CardDescription>
							Resolved schema, optimization request, and parameter search diagnostics.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-5 pt-6'>
						<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
							<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Dataset</p>
							<dl className='mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm'>
								<dt className='text-muted-foreground'>Date range</dt>
								<dd>
									{result.dataset.start_date} to {result.dataset.end_date}
								</dd>
								<dt className='text-muted-foreground'>Periods</dt>
								<dd>{result.dataset.period_count}</dd>
								<dt className='text-muted-foreground'>Raw assets</dt>
								<dd>{result.dataset.raw_asset_count}</dd>
								<dt className='text-muted-foreground'>Screened assets</dt>
								<dd>{result.dataset.asset_count}</dd>
								<dt className='text-muted-foreground'>Columns</dt>
								<dd>
									{result.dataset.date_column}
									{result.dataset.ticker_column ? ` / ${result.dataset.ticker_column}` : ''}
									{result.dataset.value_column ? ` / ${result.dataset.value_column}` : ''}
								</dd>
								<dt className='text-muted-foreground'>Dropped rows</dt>
								<dd>{result.dataset.dropped_records}</dd>
							</dl>
						</div>
						<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
							<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Solver request</p>
							<dl className='mt-4 grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm'>
								<dt className='text-muted-foreground'>Objective</dt>
								<dd className='break-words'>{result.benchmark.objective_label}</dd>
								<dt className='text-muted-foreground'>Risk aversion</dt>
								<dd>{formatNumber(result.request.risk_aversion, 4)}</dd>
								<dt className='text-muted-foreground'>Penalty</dt>
								<dd>{formatNumber(result.request.penalty, 4)}</dd>
								<dt className='text-muted-foreground'>QAOA reps</dt>
								<dd>{result.request.qaoa_reps}</dd>
								<dt className='text-muted-foreground'>Search steps</dt>
								<dd>{result.request.parameter_search_steps}</dd>
								<dt className='text-muted-foreground'>Timings</dt>
								<dd>
									Classical {formatDuration(result.benchmark.timings.classical_duration_ms)} / Quantum{' '}
									{formatDuration(result.benchmark.timings.quantum_duration_ms)}
								</dd>
							</dl>
						</div>
						<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
							<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Parameter search</p>
							<dl className='mt-4 grid grid-cols-[9rem_minmax(0,1fr)] gap-y-2 text-sm'>
								<dt className='text-muted-foreground'>Strategy</dt>
								<dd>{result.solver_diagnostics.quantum_solver.strategy}</dd>
								<dt className='text-muted-foreground'>Evaluations</dt>
								<dd>{result.solver_diagnostics.quantum_solver.parameter_evaluations}</dd>
								<dt className='text-muted-foreground'>Coarse grid</dt>
								<dd>{result.solver_diagnostics.quantum_solver.coarse_grid_steps}</dd>
								<dt className='text-muted-foreground'>Local rounds</dt>
								<dd>{result.solver_diagnostics.quantum_solver.local_refinement_rounds}</dd>
								<dt className='text-muted-foreground'>Local points</dt>
								<dd>{result.solver_diagnostics.quantum_solver.local_refinement_points}</dd>
							</dl>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className='grid gap-6 xl:grid-cols-[1.15fr_0.85fr]'>
				<Card className='shadow-md ring-1 ring-foreground/5'>
					<CardHeader className='border-b border-border/70'>
						<CardTitle id='frontier'>Exact efficient frontier</CardTitle>
						<CardDescription>
							Feasible portfolios ranked from the exact screened search space, not a heuristic sample.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-5 pt-6'>
						<div className='grid gap-3 sm:grid-cols-3'>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Frontier points
								</p>
								<p className='mt-2 text-lg font-semibold'>{frontier.length}</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Best frontier return
								</p>
								<p className='mt-2 text-lg font-semibold'>
									{formatPercent(frontier[0]?.expected_return)}
								</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Quantum percentile
								</p>
								<p className='mt-2 text-lg font-semibold'>
									{formatPercent(result.benchmark.frontier.quantum_percentile)}
								</p>
							</div>
						</div>
						<div className='max-h-[30rem] overflow-auto rounded-3xl border border-border/70'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Rank</TableHead>
										<TableHead>Bitstring</TableHead>
										<TableHead className='text-right'>Return</TableHead>
										<TableHead className='text-right'>Volatility</TableHead>
										<TableHead className='text-right'>Objective</TableHead>
										<TableHead>Assets</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{frontier.length ? (
										frontier.map(candidate => (
											<TableRow key={`frontier-${candidate.bitstring}`}>
												<TableCell>{candidate.rank ?? '-'}</TableCell>
												<TableCell className='font-mono'>{candidate.bitstring}</TableCell>
												<TableCell className='text-right'>
													{formatPercent(candidate.expected_return)}
												</TableCell>
												<TableCell className='text-right'>
													{formatPercent(candidate.volatility)}
												</TableCell>
												<TableCell className='text-right'>
													{formatSignedNumber(candidate.objective)}
												</TableCell>
												<TableCell>{candidate.selected_assets.join(', ') || '-'}</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan={6}
												className='text-center text-muted-foreground'
											>
												No frontier points returned.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>

				<Card className='shadow-md ring-1 ring-foreground/5'>
					<CardHeader className='border-b border-border/70'>
						<CardTitle>Runtime evidence</CardTitle>
						<CardDescription>
							What actually got routed and observed after the portfolio circuit left the solver.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-5 pt-6'>
						<div className='grid gap-3 sm:grid-cols-2'>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Plan</p>
								<p className='mt-2 text-sm font-medium'>{hasPlan ? plan?.plan_id : 'Not returned'}</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Quality snapshot
								</p>
								<p className='mt-2 text-sm font-medium'>
									{hasPlan ? plan?.quality_snapshot_id || '-' : '-'}
								</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Plan fragments
								</p>
								<p className='mt-2 text-lg font-semibold'>{planFragmentCount}</p>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
									Observed basis states
								</p>
								<p className='mt-2 text-lg font-semibold'>{observedBasisStates}</p>
							</div>
						</div>
						<Separator />
						<div className='space-y-3'>
							<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
								Fragment statuses
							</p>
							<div className='flex flex-wrap gap-2'>
								{Object.keys(fragmentStatusCounts).length ? (
									Object.entries(fragmentStatusCounts).map(([status, count]) => (
										<Badge
											key={status}
											variant='secondary'
										>
											{status}: {count}
										</Badge>
									))
								) : (
									<span className='text-sm text-muted-foreground'>No fragment results returned.</span>
								)}
							</div>
						</div>
						<Separator />
						<dl className='grid grid-cols-[9rem_minmax(0,1fr)] gap-y-2 text-sm'>
							<dt className='text-muted-foreground'>Shots</dt>
							<dd>{quantumResult?.shots ?? '-'}</dd>
							<dt className='text-muted-foreground'>Measured qubits</dt>
							<dd>{quantumResult?.measured_qubits?.join(', ') || '-'}</dd>
							<dt className='text-muted-foreground'>Top counts</dt>
							<dd>
								{quantumResult?.counts ? Object.keys(quantumResult.counts).slice(0, 4).join(', ') : '-'}
							</dd>
							<dt className='text-muted-foreground'>Advantage flag</dt>
							<dd>
								{result.benchmark.comparison.quantum_advantage_detected ? 'Detected' : 'Not detected'}
							</dd>
						</dl>
					</CardContent>
				</Card>
			</div>

			<div className='grid gap-6 xl:grid-cols-[1.05fr_0.95fr]'>
				<Card className='shadow-md ring-1 ring-foreground/5'>
					<CardHeader className='border-b border-border/70'>
						<CardTitle>Screened asset universe</CardTitle>
						<CardDescription>
							Annualized return and selection mass for the tickers that made the binary solve.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-5 pt-6'>
						<div className='h-72'>
							<ResponsiveContainer
								width='100%'
								height='100%'
							>
								<BarChart data={assetChartData}>
									<CartesianGrid
										strokeDasharray='4 4'
										vertical={false}
									/>
									<XAxis dataKey='ticker' />
									<YAxis />
									<Tooltip />
									<Bar
										dataKey='returnPct'
										fill='hsl(var(--chart-2))'
										name='Annualized return %'
										radius={[8, 8, 0, 0]}
									/>
									<Bar
										dataKey='selectionPct'
										fill='hsl(var(--chart-4))'
										name='Selection probability %'
										radius={[8, 8, 0, 0]}
									/>
								</BarChart>
							</ResponsiveContainer>
						</div>
						<div className='max-h-[26rem] overflow-auto rounded-3xl border border-border/70'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Ticker</TableHead>
										<TableHead className='text-right'>Return</TableHead>
										<TableHead className='text-right'>Volatility</TableHead>
										<TableHead className='text-right'>Selection</TableHead>
										<TableHead>Flags</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{result.asset_universe.map(asset => (
										<TableRow key={asset.ticker}>
											<TableCell className='font-medium'>{asset.ticker}</TableCell>
											<TableCell className='text-right'>
												{formatPercent(asset.annualized_return)}
											</TableCell>
											<TableCell className='text-right'>
												{formatPercent(asset.annualized_volatility)}
											</TableCell>
											<TableCell className='text-right'>
												{formatPercent(asset.selection_probability)}
											</TableCell>
											<TableCell>
												<div className='flex flex-wrap gap-2'>
													{asset.selected_classical ? (
														<Badge variant='secondary'>classical</Badge>
													) : null}
													{asset.selected_quantum ? (
														<Badge variant='outline'>quantum</Badge>
													) : null}
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>

				<Card className='shadow-md ring-1 ring-foreground/5'>
					<CardHeader className='border-b border-border/70'>
						<CardTitle id='states'>Top quantum states</CardTitle>
						<CardDescription>
							Highest-probability bitstrings seen in the QAOA state distribution after tuning.
						</CardDescription>
					</CardHeader>
					<CardContent className='space-y-5 pt-6'>
						<div className='max-h-[26rem] overflow-auto rounded-3xl border border-border/70'>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Rank</TableHead>
										<TableHead>Bitstring</TableHead>
										<TableHead className='text-right'>Probability</TableHead>
										<TableHead className='text-right'>Objective</TableHead>
										<TableHead>Assets</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{topStates.length ? (
										topStates.map(state => (
											<TableRow key={`${state.bitstring}-${state.rank ?? 0}`}>
												<TableCell>{state.rank ?? '-'}</TableCell>
												<TableCell className='font-mono'>{state.bitstring}</TableCell>
												<TableCell className='text-right'>
													{formatPercent(state.probability)}
												</TableCell>
												<TableCell className='text-right'>
													{formatSignedNumber(state.objective)}
												</TableCell>
												<TableCell>{state.selected_assets.join(', ') || '-'}</TableCell>
											</TableRow>
										))
									) : (
										<TableRow>
											<TableCell
												colSpan={5}
												className='text-center text-muted-foreground'
											>
												No top-state payload returned.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</div>
						<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
							<div className='flex items-center gap-2'>
								<BarChart2Icon className='size-4 text-primary' />
								<p className='font-medium'>Benchmark interpretation</p>
							</div>
							<p className='mt-3 text-sm text-muted-foreground'>
								The quantum benchmark is derived from the highest-probability feasible bitstring, not
								from a classical post-hoc replacement. Non-feasible states stay visible here to show
								where amplitude mass was actually concentrated.
							</p>
						</div>
					</CardContent>
				</Card>
			</div>

			<Card className='shadow-md ring-1 ring-foreground/5'>
				<CardHeader className='border-b border-border/70'>
					<CardTitle id='execution'>Quantum execution details</CardTitle>
					<CardDescription>
						Compiled QASM, circuit size, and Hamiltonian terms that define the routed solve.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-5 pt-6'>
					<div className='grid gap-6 xl:grid-cols-[0.85fr_1.15fr]'>
						<div className='space-y-5'>
							<div className='grid gap-3 sm:grid-cols-2'>
								<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Qubits</p>
									<p className='mt-2 text-lg font-semibold'>
										{result.quantum_execution?.circuit_summary?.qubit_count ?? '-'}
									</p>
								</div>
								<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Depth</p>
									<p className='mt-2 text-lg font-semibold'>
										{result.quantum_execution?.circuit_summary?.depth ?? '-'}
									</p>
								</div>
								<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Beta</p>
									<p className='mt-2 text-lg font-semibold'>
										{formatNumber(result.quantum_execution?.qaoa_parameters?.beta, 4)}
									</p>
								</div>
								<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Gamma</p>
									<p className='mt-2 text-lg font-semibold'>
										{formatNumber(result.quantum_execution?.qaoa_parameters?.gamma, 4)}
									</p>
								</div>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Gate counts</p>
								<div className='mt-3 flex flex-wrap gap-2'>
									{gateCounts.length ? (
										gateCounts.map(([gate, count]) => (
											<Badge
												key={gate}
												variant='secondary'
											>
												{gate}: {count}
											</Badge>
										))
									) : (
										<span className='text-sm text-muted-foreground'>
											No circuit summary returned.
										</span>
									)}
								</div>
							</div>
							<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
								<div className='flex items-center gap-2'>
									<FileCode2Icon className='size-4 text-primary' />
									<p className='font-medium'>Hamiltonian summary</p>
								</div>
								<dl className='mt-4 grid grid-cols-[9rem_minmax(0,1fr)] gap-y-2 text-sm'>
									<dt className='text-muted-foreground'>Offset</dt>
									<dd>{formatSignedNumber(hamiltonian?.offset, 6)}</dd>
									<dt className='text-muted-foreground'>Linear fields</dt>
									<dd>{hamiltonian?.linear_fields.length ?? 0}</dd>
									<dt className='text-muted-foreground'>Couplings</dt>
									<dd>{hamiltonian?.couplings.length ?? 0}</dd>
									<dt className='text-muted-foreground'>Penalty strategy</dt>
									<dd>{hamiltonian?.penalty_strategy ?? '-'}</dd>
								</dl>
							</div>
						</div>
						<div className='space-y-2'>
							<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
								Compiled OpenQASM
							</p>
							<Textarea
								readOnly
								value={result.quantum_execution?.circuit_text ?? ''}
								className='min-h-[22rem] resize-y font-mono text-xs'
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className='shadow-md ring-1 ring-foreground/5'>
				<CardHeader className='border-b border-border/70'>
					<CardTitle>Warnings and caveats</CardTitle>
					<CardDescription>
						Carry these into any investor-facing quantum versus classical claim.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-5 pt-6'>
					<div className='grid gap-4 md:grid-cols-2'>
						<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
							<div className='flex items-center gap-2'>
								<TrendingUpIcon className='size-4 text-emerald-600' />
								<p className='font-medium'>Classical selection</p>
							</div>
							<p className='mt-3 text-sm text-muted-foreground'>
								{result.benchmark.classical.selected_assets.join(', ') || '-'}
							</p>
						</div>
						<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
							<div className='flex items-center gap-2'>
								<CpuIcon className='size-4 text-primary' />
								<p className='font-medium'>Quantum selection</p>
							</div>
							<p className='mt-3 text-sm text-muted-foreground'>
								{result.benchmark.quantum.selected_assets.join(', ') || '-'}
							</p>
						</div>
					</div>
					<Separator />
					<div className='space-y-3'>
						<div className='flex items-center gap-2'>
							<AlertTriangleIcon className='size-4 text-amber-600' />
							<p className='font-medium'>Warnings</p>
						</div>
						{result.warnings.length ? (
							<div className='space-y-2'>
								{result.warnings.map(warning => (
									<div
										key={warning}
										className='rounded-3xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground'
									>
										{warning}
									</div>
								))}
							</div>
						) : (
							<div className='rounded-3xl border border-dashed border-border bg-muted/15 p-4 text-sm text-muted-foreground'>
								No warnings returned by the backend.
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
