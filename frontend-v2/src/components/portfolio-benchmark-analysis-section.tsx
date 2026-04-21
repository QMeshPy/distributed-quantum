'use client';

import type { ReactNode } from 'react';
import { BarChart2Icon, CheckCircle2Icon, CpuIcon, DatabaseIcon, NetworkIcon, ScaleIcon } from 'lucide-react';

import { PortfolioComparisonReportSection } from '@/components/financial/portfolio-comparison-report-section';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { FinancialAnalysisResult } from '@/types/financial';
import type { RunDetail } from '@/types/runs';

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

function SummaryCard({
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

export function PortfolioBenchmarkAnalysisSection({
	run,
	result
}: {
	run: RunDetail;
	result: FinancialAnalysisResult;
}) {
	const gateCounts = Object.entries(result.quantum_execution?.circuit_summary?.gate_counts ?? {}).sort(
		(left, right) => right[1] - left[1]
	);
	const topStates = result.quantum_execution?.top_states ?? [];
	const frontier = result.benchmark.frontier.efficient_frontier;

	return (
		<section
			id='analysis'
			className='scroll-mt-4 space-y-6'
		>
			<Card className='shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'>
				<CardHeader className='border-b border-border/80'>
					<CardTitle>Portfolio benchmark surfaces</CardTitle>
					<CardDescription>
						Track B run detail mapped to exact portfolio search, QAOA diagnostics, and distributed runtime
						evidence.
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-6 pt-6'>
					{result.comparison_report ? (
						<PortfolioComparisonReportSection
							report={result.comparison_report}
							jobId={run.id}
						/>
					) : null}

					<div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
						<SummaryCard
							icon={<DatabaseIcon className='size-5' />}
							label='Dataset'
							value={`${result.dataset.asset_count} assets`}
							detail={`${result.dataset.period_count} aligned periods from ${result.row_count.toLocaleString()} rows`}
						/>
						<SummaryCard
							icon={<ScaleIcon className='size-5' />}
							label='Search Space'
							value={`${result.solver_diagnostics.feasible_portfolio_count} feasible`}
							detail={`${result.solver_diagnostics.total_binary_states.toLocaleString()} total bitstrings / budget ${result.request.budget}`}
						/>
						<SummaryCard
							icon={<CpuIcon className='size-5' />}
							label='Quantum Rank'
							value={String(result.benchmark.frontier.quantum_rank ?? '-')}
							detail={`Percentile ${formatPercent(result.benchmark.frontier.quantum_percentile)} / feasible mass ${formatPercent(result.benchmark.comparison.feasible_probability_mass)}`}
						/>
						<SummaryCard
							icon={<NetworkIcon className='size-5' />}
							label='Distributed Runtime'
							value={`${result.fragments_executed} fragments`}
							detail={`${result.distributed_nodes_used} nodes / ${formatDuration(result.analysis_duration_ms)}`}
						/>
					</div>

					<div
						id='benchmark'
						className='grid gap-6 xl:grid-cols-[1.05fr_0.95fr]'
					>
						<Card className='shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10'>
							<CardHeader className='border-b border-border/70'>
								<CardTitle>Benchmark summary</CardTitle>
								<CardDescription>
									Exact classical optimum against the highest-ranked feasible quantum state.
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-5 pt-6'>
								<div className='grid gap-4 md:grid-cols-2'>
									<div className='rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4'>
										<div className='flex items-center gap-2'>
											<CheckCircle2Icon className='size-4 text-emerald-600' />
											<p className='font-medium'>Classical optimum</p>
										</div>
										<p className='mt-3 font-mono text-lg'>{result.benchmark.classical.bitstring}</p>
										<div className='mt-3 space-y-1 text-sm text-muted-foreground'>
											<p>Objective: {formatSignedNumber(result.benchmark.classical.objective)}</p>
											<p>Return: {formatPercent(result.benchmark.classical.expected_return)}</p>
											<p>Volatility: {formatPercent(result.benchmark.classical.volatility)}</p>
											<p>
												Assets: {result.benchmark.classical.selected_assets.join(', ') || '-'}
											</p>
										</div>
									</div>
									<div className='rounded-3xl border border-primary/20 bg-primary/5 p-4'>
										<div className='flex items-center gap-2'>
											<CpuIcon className='size-4 text-primary' />
											<p className='font-medium'>Quantum candidate</p>
										</div>
										<p className='mt-3 font-mono text-lg'>{result.benchmark.quantum.bitstring}</p>
										<div className='mt-3 space-y-1 text-sm text-muted-foreground'>
											<p>Objective: {formatSignedNumber(result.benchmark.quantum.objective)}</p>
											<p>Return: {formatPercent(result.benchmark.quantum.expected_return)}</p>
											<p>Volatility: {formatPercent(result.benchmark.quantum.volatility)}</p>
											<p>Probability: {formatPercent(result.benchmark.quantum.probability)}</p>
										</div>
									</div>
								</div>
								<div className='grid gap-3 md:grid-cols-4'>
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
											Asset overlap
										</p>
										<p className='mt-2 text-lg font-semibold'>
											{result.benchmark.comparison.overlap_count} / {result.request.budget}
										</p>
									</div>
									<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
										<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
											On frontier
										</p>
										<p className='mt-2 text-lg font-semibold'>
											{result.benchmark.frontier.quantum_on_frontier ? 'Yes' : 'No'}
										</p>
									</div>
									<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
										<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
											Advantage flag
										</p>
										<p className='mt-2 text-lg font-semibold'>
											{result.benchmark.comparison.quantum_advantage_detected
												? 'Detected'
												: 'Not detected'}
										</p>
									</div>
								</div>
								<Separator />
								<dl className='grid grid-cols-[10rem_minmax(0,1fr)] gap-y-2 text-sm'>
									<dt className='text-muted-foreground'>Objective</dt>
									<dd className='break-words'>{result.benchmark.objective_label}</dd>
									<dt className='text-muted-foreground'>Allocation model</dt>
									<dd>
										{result.benchmark.allocation_model ??
											result.solver_diagnostics.allocation_model}
									</dd>
									<dt className='text-muted-foreground'>Penalty</dt>
									<dd>{formatNumber(result.request.penalty, 4)}</dd>
									<dt className='text-muted-foreground'>Timings</dt>
									<dd>
										Classical {formatDuration(result.benchmark.timings.classical_duration_ms)} /
										Quantum {formatDuration(result.benchmark.timings.quantum_duration_ms)}
									</dd>
									<dt className='text-muted-foreground'>Run surface</dt>
									<dd>
										{run.circuitText.trim() ? 'QASM surfaced in this run' : 'Run text unavailable'}
									</dd>
								</dl>
							</CardContent>
						</Card>

						<Card
							id='frontier'
							className='shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10'
						>
							<CardHeader className='border-b border-border/70'>
								<CardTitle>Exact frontier</CardTitle>
								<CardDescription>
									Every point below is an exact feasible portfolio from the screened binary search
									space.
								</CardDescription>
							</CardHeader>
							<CardContent className='pt-6'>
								<div className='max-h-[28rem] overflow-auto rounded-3xl border border-border/70'>
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
														<TableCell className='font-mono'>
															{candidate.bitstring}
														</TableCell>
														<TableCell className='text-right'>
															{formatPercent(candidate.expected_return)}
														</TableCell>
														<TableCell className='text-right'>
															{formatPercent(candidate.volatility)}
														</TableCell>
														<TableCell className='text-right'>
															{formatSignedNumber(candidate.objective)}
														</TableCell>
														<TableCell>
															{candidate.selected_assets.join(', ') || '-'}
														</TableCell>
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
					</div>

					<div className='grid gap-6 xl:grid-cols-[0.9fr_1.1fr]'>
						<Card
							id='execution'
							className='shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10'
						>
							<CardHeader className='border-b border-border/70'>
								<CardTitle>Execution metadata</CardTitle>
								<CardDescription>
									QAOA search settings, compiled circuit size, and routed execution metadata.
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-5 pt-6'>
								<div className='grid gap-3 sm:grid-cols-2'>
									<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
										<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
											Qubits
										</p>
										<p className='mt-2 text-lg font-semibold'>
											{result.quantum_execution?.circuit_summary?.qubit_count ?? '-'}
										</p>
									</div>
									<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
										<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
											Depth
										</p>
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
										<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
											Gamma
										</p>
										<p className='mt-2 text-lg font-semibold'>
											{formatNumber(result.quantum_execution?.qaoa_parameters?.gamma, 4)}
										</p>
									</div>
								</div>
								<dl className='grid grid-cols-[11rem_minmax(0,1fr)] gap-y-2 text-sm'>
									<dt className='text-muted-foreground'>Quantum solver</dt>
									<dd>{result.solver_diagnostics.quantum_solver.strategy}</dd>
									<dt className='text-muted-foreground'>Parameter evaluations</dt>
									<dd>{result.solver_diagnostics.quantum_solver.parameter_evaluations}</dd>
									<dt className='text-muted-foreground'>Coarse grid</dt>
									<dd>{result.solver_diagnostics.quantum_solver.coarse_grid_steps} steps</dd>
									<dt className='text-muted-foreground'>Local refinement</dt>
									<dd>{result.solver_diagnostics.quantum_solver.local_refinement_rounds} rounds</dd>
									<dt className='text-muted-foreground'>Fragments</dt>
									<dd>{result.fragments_executed}</dd>
									<dt className='text-muted-foreground'>Nodes used</dt>
									<dd>{result.distributed_nodes_used}</dd>
								</dl>
								<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
										Gate counts
									</p>
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
							</CardContent>
						</Card>

						<Card
							id='states'
							className='shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10'
						>
							<CardHeader className='border-b border-border/70'>
								<CardTitle>Top quantum states</CardTitle>
								<CardDescription>
									Highest-probability states from the QAOA wavefunction after parameter search.
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-5 pt-6'>
								<div className='max-h-[24rem] overflow-auto rounded-3xl border border-border/70'>
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
								<Separator />
								<div className='rounded-3xl border border-border/70 bg-muted/20 p-4'>
									<div className='flex items-center gap-2'>
										<BarChart2Icon className='size-4 text-primary' />
										<p className='font-medium'>Asset universe</p>
									</div>
									<div className='mt-4 max-h-[18rem] overflow-auto rounded-2xl border border-border/70 bg-background/60'>
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Ticker</TableHead>
													<TableHead className='text-right'>Return</TableHead>
													<TableHead className='text-right'>Volatility</TableHead>
													<TableHead className='text-right'>Selection</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{result.asset_universe.map(asset => (
													<TableRow key={`asset-${asset.ticker}`}>
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
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{result.warnings.length ? (
						<Card className='shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10'>
							<CardHeader className='border-b border-border/70'>
								<CardTitle>Warnings</CardTitle>
								<CardDescription>
									Carry these caveats into any quantum-vs-classical claims.
								</CardDescription>
							</CardHeader>
							<CardContent className='space-y-3 pt-6'>
								{result.warnings.map(warning => (
									<div
										key={warning}
										className='rounded-3xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground'
									>
										{warning}
									</div>
								))}
							</CardContent>
						</Card>
					) : null}
				</CardContent>
			</Card>
		</section>
	);
}
