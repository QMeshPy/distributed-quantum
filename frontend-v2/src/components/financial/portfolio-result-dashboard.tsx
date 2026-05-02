'use client';

import Link from 'next/link';
import { GitBranchIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { PortfolioComparisonReportSection } from '@/components/financial/portfolio-comparison-report-section';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import type { FinancialAnalysisResult } from '@/types/financial';

function fmt(value: number | null | undefined, digits = 4) {
	return value == null || Number.isNaN(value) ? '—' : value.toFixed(digits);
}
function fmtPct(value: number | null | undefined, digits = 2) {
	return value == null || Number.isNaN(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
}
function fmtDur(ms: number | null | undefined) {
	if (ms == null || Number.isNaN(ms)) return '—';
	return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}
function fmtN(value: number | null | undefined) {
	return value == null || Number.isNaN(value) ? '—' : value.toLocaleString();
}
function fmtDate(value: string | null | undefined) {
	if (!value) return '—';
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(d);
}
function fmtSigned(value: number | null | undefined, digits = 6) {
	if (value == null || Number.isNaN(value)) return '—';
	return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}
function titleCase(value: string) {
	return value.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return <p className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>{children}</p>;
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<>
			<dt className='text-muted-foreground'>{label}</dt>
			<dd className='text-foreground'>{value}</dd>
		</>
	);
}

function DL({ children }: { children: React.ReactNode }) {
	return (
		<dl className='grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm leading-6'>
			{children}
		</dl>
	);
}

function Block({ id, title, children }: { id?: string; title?: string; children: React.ReactNode }) {
	return (
		<div
			id={id}
			className='rounded-md border border-border bg-card p-4 space-y-3'
			style={id ? { scrollMarginTop: '5rem' } : undefined}
		>
			{title ? <SectionTitle>{title}</SectionTitle> : null}
			{children}
		</div>
	);
}

export function PortfolioResultDashboard({ result, jobId }: { result: FinancialAnalysisResult; jobId: string }) {
	const frontier = result.benchmark.frontier.efficient_frontier;
	const topStates = result.quantum_execution?.top_states ?? [];
	const gateCounts = Object.entries(result.quantum_execution?.circuit_summary?.gate_counts ?? {}).sort(
		(a, b) => b[1] - a[1]
	);
	const assetChartData = result.asset_universe
		.slice()
		.sort((a, b) => b.selection_probability - a.selection_probability)
		.slice(0, 10)
		.map(asset => ({
			ticker: asset.ticker,
			returnPct: Number((asset.annualized_return * 100).toFixed(2)),
			selectionPct: Number((asset.selection_probability * 100).toFixed(2))
		}));
	const plan = result.quantum_execution?.plan;
	const hasPlan = Boolean(plan?.plan_id);
	const planAssignments = plan?.assignments ?? {};
	const fragmentResults = result.quantum_execution?.fragment_results ?? [];
	const fragmentStatusCounts = fragmentResults.reduce<Record<string, number>>((acc, f) => {
		acc[f.status] = (acc[f.status] ?? 0) + 1;
		return acc;
	}, {});
	const routedNodeCount = hasPlan
		? new Set(Object.values(planAssignments).map(a => a.primary_node_id).filter(Boolean)).size
		: result.distributed_nodes_used;
	const quantumResult = result.quantum_execution?.quantum_result;
	const observedBasisStates = quantumResult?.counts ? Object.keys(quantumResult.counts).length : 0;
	const combinedWarnings = Array.from(new Set([...result.warnings, ...(result.comparison_report?.evidence.warnings ?? [])]));

	return (
		<div className='space-y-5'>

			{/* ── Tier 1: At-a-glance stat boxes ─────────────────────────── */}
			<div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
				{[
					{
						label: 'Search space',
						value: `${result.solver_diagnostics.feasible_portfolio_count} feasible`,
						sub: `${result.solver_diagnostics.total_binary_states.toLocaleString()} binary states · budget ${result.request.budget}`
					},
					{
						label: 'Quantum rank',
						value: String(result.benchmark.frontier.quantum_rank ?? '—'),
						sub: `Percentile ${fmtPct(result.benchmark.frontier.quantum_percentile)} on exact feasible set`
					},
					{
						label: 'Feasible mass',
						value: fmtPct(result.benchmark.comparison.feasible_probability_mass),
						sub: `Optimum state probability ${fmtPct(result.benchmark.comparison.optimum_probability)}`
					},
					{
						label: 'Runtime route',
						value: `${result.fragments_executed} fragments`,
						sub: `${routedNodeCount} routed nodes · ${fmtDur(result.analysis_duration_ms)} end-to-end`
					}
				].map(({ label, value, sub }) => (
					<Block key={label}>
						<SectionTitle>{label}</SectionTitle>
						<p className='text-xl font-semibold text-foreground'>{value}</p>
						<p className='text-xs text-muted-foreground'>{sub}</p>
					</Block>
				))}
			</div>

			{/* ── Tier 2: Investor comparison report (high importance) ────── */}
			{result.comparison_report ? (
				<PortfolioComparisonReportSection report={result.comparison_report} jobId={jobId} />
			) : null}

			{/* ── Tier 3: Exact benchmark — classical vs quantum ─────────── */}
			<Block id='benchmark' title='Exact benchmark'>
				<div className='grid gap-4 sm:grid-cols-2'>
					<div className='rounded border border-border bg-muted/30 p-3 space-y-1.5'>
						<p className='text-xs font-medium text-muted-foreground'>Classical optimum</p>
						<p className='font-mono text-sm font-semibold text-foreground break-all'>{result.benchmark.classical.bitstring || '—'}</p>
						<p className='text-xs text-muted-foreground'>
							Assets: {result.benchmark.classical.selected_assets.join(', ') || '—'}<br />
							Objective: {fmtSigned(result.benchmark.classical.objective)}<br />
							Return: {fmtPct(result.benchmark.classical.expected_return)} · Volatility: {fmtPct(result.benchmark.classical.volatility)}
						</p>
					</div>
					<div className='rounded border border-border bg-muted/30 p-3 space-y-1.5'>
						<p className='text-xs font-medium text-muted-foreground'>Quantum candidate</p>
						<p className='font-mono text-sm font-semibold text-foreground break-all'>{result.benchmark.quantum.bitstring || '—'}</p>
						<p className='text-xs text-muted-foreground'>
							Assets: {result.benchmark.quantum.selected_assets.join(', ') || '—'}<br />
							Objective: {fmtSigned(result.benchmark.quantum.objective)} · Probability: {fmtPct(result.benchmark.quantum.probability)}<br />
							Return: {fmtPct(result.benchmark.quantum.expected_return)} · Volatility: {fmtPct(result.benchmark.quantum.volatility)}
						</p>
					</div>
				</div>

				<div className='grid gap-3 grid-cols-2 sm:grid-cols-4 text-sm'>
					{[
						['Objective gap', fmtSigned(result.benchmark.comparison.objective_gap)],
						['Objective ratio', fmt(result.benchmark.comparison.objective_ratio)],
						['Asset overlap', fmtPct(result.benchmark.comparison.overlap_ratio)],
						['On frontier', result.benchmark.frontier.quantum_on_frontier ? 'Yes' : 'No']
					].map(([label, value]) => (
						<div key={label as string} className='rounded border border-border bg-muted/40 px-3 py-2'>
							<p className='text-xs text-muted-foreground'>{label}</p>
							<p className='font-semibold text-foreground'>{value}</p>
						</div>
					))}
				</div>

				<div className='flex justify-end'>
					<Button size='sm' variant='outline' asChild>
						<Link href={`/runs/${encodeURIComponent(jobId)}`}>
							<GitBranchIcon className='size-3.5' />
							Inspect distributed run
						</Link>
					</Button>
				</div>
			</Block>

			{/* ── Tier 4: Dataset screening + Modeling contract (side by side) */}
			<div className='grid gap-4 xl:grid-cols-2'>
				<Block title='Dataset screening'>
					<DL>
						<KV label='Date range' value={`${fmtDate(result.dataset.start_date)} → ${fmtDate(result.dataset.end_date)}`} />
						<KV label='Layout' value={`${titleCase(result.dataset.input_layout)} / ${titleCase(result.dataset.inferred_frequency)}`} />
						<KV label='Return mode' value={result.dataset.return_method === 'provided_returns' ? 'Provided returns' : 'Simple returns'} />
						<KV label='Periods' value={fmtN(result.dataset.period_count)} />
						<KV label='Raw assets' value={fmtN(result.dataset.raw_asset_count)} />
						<KV label='Screened' value={fmtN(result.dataset.asset_count)} />
					</DL>
					{result.dataset.selected_tickers.length > 0 && (
						<p className='text-xs text-muted-foreground'>{result.dataset.selected_tickers.join(' · ')}</p>
					)}
					{result.summary ? (
						<p className='text-sm text-muted-foreground'>{result.summary}</p>
					) : null}
				</Block>

				<Block title='Modeling contract'>
					<DL>
						<KV label='Objective' value={result.benchmark.objective_label} />
						<KV label='Allocation' value={result.solver_diagnostics.allocation_model} />
						<KV label='Budget' value={result.request.budget} />
						<KV label='Asset cap' value={result.request.max_assets_considered} />
						<KV label='Value mode' value={`${titleCase(result.request.value_mode)} → ${titleCase(result.request.resolved_value_mode)}`} />
						<KV label='Risk aversion' value={fmt(result.request.risk_aversion)} />
						<KV label='Penalty' value={fmt(result.request.penalty)} />
						<KV label='QAOA reps' value={result.request.qaoa_reps} />
						<KV label='Search steps' value={result.request.parameter_search_steps} />
					</DL>
				</Block>
			</div>

			{/* ── Tier 5: Classical solver + Quantum solver (side by side) ── */}
			<div className='grid gap-4 xl:grid-cols-2'>
				<Block title='Classical solver'>
					<DL>
						<KV label='Strategy' value={result.solver_diagnostics.classical_solver.strategy} />
						<KV label='Evaluated' value={fmtN(result.solver_diagnostics.classical_solver.evaluated_portfolios)} />
						<KV label='Feasible' value={fmtN(result.solver_diagnostics.feasible_portfolio_count)} />
						<KV label='Runtime' value={fmtDur(result.benchmark.timings.classical_duration_ms)} />
					</DL>
				</Block>
				<Block title='Quantum solver'>
					<DL>
						<KV label='Strategy' value={result.solver_diagnostics.quantum_solver.strategy} />
						<KV label='Ansatz' value={result.solver_diagnostics.quantum_solver.ansatz} />
						<KV label='Reps' value={result.solver_diagnostics.quantum_solver.reps} />
						<KV label='Evaluations' value={fmtN(result.solver_diagnostics.quantum_solver.parameter_evaluations)} />
					</DL>
				</Block>
			</div>

			{/* ── Tier 6: Runtime evidence ─────────────────────────────────── */}
			<Block id='execution' title='Runtime evidence'>
				<div className='grid gap-4 sm:grid-cols-2'>
					<DL>
						<KV label='Routed nodes' value={routedNodeCount} />
						<KV label='Plan fragments' value={hasPlan ? (plan?.fragment_order.length ?? 0) : '—'} />
						<KV label='Observed states' value={observedBasisStates} />
						<KV label='Shots' value={quantumResult?.shots ?? '—'} />
						<KV label='Advantage' value={result.benchmark.comparison.quantum_advantage_detected ? 'Detected' : 'Not detected'} />
					</DL>
					<div>
						{Object.keys(fragmentStatusCounts).length > 0 ? (
							<div className='space-y-1 text-sm'>
								<p className='text-xs font-medium text-muted-foreground'>Fragment statuses</p>
								{Object.entries(fragmentStatusCounts).map(([status, count]) => (
									<div key={status} className='flex justify-between gap-2'>
										<span className='text-muted-foreground'>{status}</span>
										<span className='font-medium text-foreground'>{count}</span>
									</div>
								))}
							</div>
						) : (
							<p className='text-xs text-muted-foreground'>No fragment results returned.</p>
						)}
					</div>
				</div>
			</Block>

			{/* ── Tier 7: Efficient frontier + Top quantum states (side by side) */}
			<div className='grid gap-4 xl:grid-cols-2'>
				<Block id='frontier' title='Exact efficient frontier'>
					<p className='text-xs text-muted-foreground'>
						{frontier.length} points · Best return {fmtPct(frontier[0]?.expected_return)} · Quantum percentile {fmtPct(result.benchmark.frontier.quantum_percentile)}
					</p>
					<div className='max-h-72 overflow-auto rounded border border-border'>
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
								{frontier.length ? frontier.map(c => (
									<TableRow key={c.bitstring}>
										<TableCell>{c.rank ?? '—'}</TableCell>
										<TableCell className='max-w-[8rem] break-all font-mono text-xs'>{c.bitstring}</TableCell>
										<TableCell className='text-right'>{fmtPct(c.expected_return)}</TableCell>
										<TableCell className='text-right'>{fmtPct(c.volatility)}</TableCell>
										<TableCell className='text-right'>{fmtSigned(c.objective)}</TableCell>
										<TableCell className='text-xs'>{c.selected_assets.join(', ') || '—'}</TableCell>
									</TableRow>
								)) : (
									<TableRow>
										<TableCell colSpan={6} className='text-center text-muted-foreground'>No frontier points returned.</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</Block>

				<Block id='states' title='Top quantum states'>
					<p className='text-xs text-muted-foreground'>
						Highest-probability feasible bitstrings from measurement distribution.
					</p>
					<div className='max-h-72 overflow-auto rounded border border-border'>
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
								{topStates.length ? topStates.map(state => (
									<TableRow key={`${state.bitstring}-${state.rank ?? 0}`}>
										<TableCell>{state.rank ?? '—'}</TableCell>
										<TableCell className='max-w-[8rem] break-all font-mono text-xs'>{state.bitstring}</TableCell>
										<TableCell className='text-right'>{fmtPct(state.probability)}</TableCell>
										<TableCell className='text-right'>{fmtSigned(state.objective)}</TableCell>
										<TableCell className='text-xs'>{state.selected_assets.join(', ') || '—'}</TableCell>
									</TableRow>
								)) : (
									<TableRow>
										<TableCell colSpan={5} className='text-center text-muted-foreground'>No top-state payload returned.</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>
				</Block>
			</div>

			{/* ── Tier 8: Asset universe chart + table (full width) ────────── */}
			<Block title='Screened asset universe'>
				<div className='h-52 rounded border border-border bg-muted/30 p-2'>
					<ResponsiveContainer width='100%' height='100%'>
						<BarChart data={assetChartData}>
							<CartesianGrid stroke='currentColor' strokeOpacity={0.08} strokeDasharray='4 4' vertical={false} />
							<XAxis dataKey='ticker' tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
							<YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
							<Tooltip
								contentStyle={{
									borderRadius: '6px',
									border: '1px solid var(--border)',
									background: 'var(--card)',
									fontSize: '12px'
								}}
							/>
							<Bar dataKey='returnPct' fill='var(--color-chart-1)' name='Ann. return %' radius={[3, 3, 0, 0]} />
							<Bar dataKey='selectionPct' fill='var(--color-chart-3)' name='Selection %' radius={[3, 3, 0, 0]} />
						</BarChart>
					</ResponsiveContainer>
				</div>
				<div className='max-h-60 overflow-auto rounded border border-border'>
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
									<TableCell className='text-right'>{fmtPct(asset.annualized_return)}</TableCell>
									<TableCell className='text-right'>{fmtPct(asset.annualized_volatility)}</TableCell>
									<TableCell className='text-right'>{fmtPct(asset.selection_probability)}</TableCell>
									<TableCell className='text-xs text-muted-foreground'>
										{[asset.selected_classical && 'classical', asset.selected_quantum && 'quantum'].filter(Boolean).join(' · ') || '—'}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</Block>

			{/* ── Tier 9: Circuit summary + OpenQASM (side by side) ───────── */}
			<div className='grid gap-4 xl:grid-cols-2'>
				<Block title='Circuit summary'>
					<DL>
						<KV label='Qubits' value={result.quantum_execution?.circuit_summary?.qubit_count ?? '—'} />
						<KV label='Depth' value={result.quantum_execution?.circuit_summary?.depth ?? '—'} />
						<KV label='Beta' value={fmt(result.quantum_execution?.qaoa_parameters?.beta)} />
						<KV label='Gamma' value={fmt(result.quantum_execution?.qaoa_parameters?.gamma)} />
					</DL>
					{gateCounts.length > 0 && (
						<div className='text-xs text-muted-foreground'>
							<p className='font-medium text-foreground mb-1'>Gate counts</p>
							{gateCounts.map(([gate, count]) => (
								<span key={gate} className='mr-3'>{gate}: {count}</span>
							))}
						</div>
					)}
				</Block>

				<Block title='Compiled OpenQASM'>
					<Textarea
						readOnly
						value={result.quantum_execution?.circuit_text ?? ''}
						className='min-h-[14rem] resize-y font-mono text-xs'
					/>
				</Block>
			</div>

			{/* ── Tier 10: Warnings (bottom, least important) ──────────────── */}
			{combinedWarnings.length > 0 && (
				<Block title='Warnings and caveats'>
					<ul className='space-y-1.5 text-sm leading-6 text-muted-foreground list-disc pl-4'>
						{combinedWarnings.map(w => <li key={w}>{w}</li>)}
					</ul>
				</Block>
			)}
		</div>
	);
}
