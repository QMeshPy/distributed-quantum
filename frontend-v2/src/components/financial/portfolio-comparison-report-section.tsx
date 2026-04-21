'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	CpuIcon,
	FileJsonIcon,
	ScaleIcon,
	ShieldCheckIcon,
	TimerIcon
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type {
	FinancialComparisonPitchPosition,
	FinancialComparisonReport,
	FinancialComparisonWinner
} from '@/types/financial';

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

function titleCaseFromKey(value: string) {
	return value
		.split('_')
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function winnerLabel(winner: FinancialComparisonWinner) {
	switch (winner) {
		case 'classical':
			return 'Classical';
		case 'quantum':
			return 'Quantum';
		case 'tie':
			return 'Tie';
		default:
			return 'Inconclusive';
	}
}

function pitchLabel(position: FinancialComparisonPitchPosition) {
	switch (position) {
		case 'numerical_advantage':
			return 'Numerical advantage';
		case 'mixed':
			return 'Mixed signal';
		case 'workflow_evidence':
			return 'Workflow evidence';
		default:
			return 'Not ready';
	}
}

function pitchBadgeVariant(position: FinancialComparisonPitchPosition) {
	switch (position) {
		case 'numerical_advantage':
			return 'default' as const;
		case 'mixed':
			return 'secondary' as const;
		case 'workflow_evidence':
			return 'outline' as const;
		default:
			return 'destructive' as const;
	}
}

function readinessBadgeVariant(readiness: FinancialComparisonReport['verdict']['claim_readiness']) {
	switch (readiness) {
		case 'ready':
			return 'default' as const;
		case 'qualified':
			return 'secondary' as const;
		default:
			return 'destructive' as const;
	}
}

function MetricCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
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

function ClaimList({ title, items, accent }: { title: string; items: string[]; accent: 'positive' | 'caution' }) {
	const accentClassName =
		accent === 'positive' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/5';

	return (
		<div className={`rounded-3xl border p-4 ${accentClassName}`}>
			<p className='text-sm font-medium'>{title}</p>
			<div className='mt-3 space-y-2'>
				{items.map(item => (
					<div
						key={item}
						className='rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground'
					>
						{item}
					</div>
				))}
			</div>
		</div>
	);
}

export function PortfolioComparisonReportSection({
	report,
	jobId
}: {
	report: FinancialComparisonReport;
	jobId: string;
}) {
	return (
		<section
			id='comparison'
			className='space-y-6'
		>
			<Card className='overflow-hidden shadow-md ring-1 ring-foreground/5'>
				<div
					aria-hidden
					className='pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-r from-primary/10 via-chart-2/10 to-chart-3/10'
				/>
				<CardHeader className='relative border-b border-border/70'>
					<div className='flex flex-wrap items-start justify-between gap-4'>
						<div className='space-y-3'>
							<div className='flex flex-wrap items-center gap-2'>
								<Badge variant={pitchBadgeVariant(report.verdict.pitch_position)}>
									{pitchLabel(report.verdict.pitch_position)}
								</Badge>
								<Badge variant={readinessBadgeVariant(report.verdict.claim_readiness)}>
									{titleCaseFromKey(report.verdict.claim_readiness)}
								</Badge>
							</div>
							<div className='space-y-1'>
								<CardTitle>Quantum vs classical comparison report</CardTitle>
								<CardDescription>
									Investor-facing readout built from the same dataset, same screened universe, and
									same objective.
								</CardDescription>
							</div>
						</div>
						<Button
							variant='outline'
							asChild
						>
							<Link
								href={`/api/finance/${encodeURIComponent(jobId)}/comparison`}
								target='_blank'
							>
								<FileJsonIcon className='size-4' />
								Open JSON
							</Link>
						</Button>
					</div>
				</CardHeader>
				<CardContent className='space-y-6 pt-6'>
					<div className='rounded-[2rem] border border-border/70 bg-gradient-to-br from-background via-background to-primary/5 p-5'>
						<p className='text-xl font-semibold tracking-tight'>{report.verdict.headline}</p>
						<p className='mt-3 max-w-4xl text-sm leading-6 text-muted-foreground'>
							{report.verdict.summary}
						</p>
					</div>

					<div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
						<MetricCard
							icon={<ShieldCheckIcon className='size-5' />}
							label='Fairness'
							value={
								report.fairness.same_dataset &&
								report.fairness.same_constraints &&
								report.fairness.same_objective
									? 'Aligned'
									: 'Check inputs'
							}
							detail='Same screened dataset, portfolio constraints, and objective on both sides of the comparison.'
						/>
						<MetricCard
							icon={<ScaleIcon className='size-5' />}
							label='Objective Winner'
							value={winnerLabel(report.scorecard.winner_by_objective)}
							detail={`Gap ${formatSignedNumber(report.scorecard.objective_gap)} on ${report.problem.objective_label}.`}
						/>
						<MetricCard
							icon={<TimerIcon className='size-5' />}
							label='Runtime Winner'
							value={winnerLabel(report.scorecard.winner_by_runtime)}
							detail={`Classical ${formatDuration(report.classical.duration_ms)} vs quantum ${formatDuration(report.quantum.duration_ms)}.`}
						/>
						<MetricCard
							icon={<CpuIcon className='size-5' />}
							label='Feasible Mass'
							value={formatPercent(report.quantum.feasible_probability_mass)}
							detail={`Quantum candidate rank ${report.quantum.rank ?? '-'} and percentile ${formatPercent(report.quantum.percentile)}.`}
						/>
					</div>

					<div className='grid gap-6 xl:grid-cols-[1.1fr_0.9fr]'>
						<div className='rounded-3xl border border-border/70 bg-muted/15 p-5'>
							<p className='text-sm font-medium'>Benchmark contract</p>
							<div className='mt-4 space-y-3'>
								{report.fairness.notes.map(note => (
									<div
										key={note}
										className='rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground'
									>
										{note}
									</div>
								))}
							</div>
							<Separator className='my-5' />
							<dl className='grid grid-cols-[10rem_minmax(0,1fr)] gap-y-2 text-sm'>
								<dt className='text-muted-foreground'>Dataset window</dt>
								<dd>
									{report.dataset.start_date} to {report.dataset.end_date}
								</dd>
								<dt className='text-muted-foreground'>Shape</dt>
								<dd>
									{report.dataset.row_count.toLocaleString()} rows x {report.dataset.col_count} cols
								</dd>
								<dt className='text-muted-foreground'>Screened assets</dt>
								<dd>{report.dataset.asset_count}</dd>
								<dt className='text-muted-foreground'>Budget</dt>
								<dd>{report.problem.budget}</dd>
								<dt className='text-muted-foreground'>Risk aversion</dt>
								<dd>{report.problem.risk_aversion.toFixed(4)}</dd>
								<dt className='text-muted-foreground'>Quantum strategy</dt>
								<dd>{report.problem.quantum_strategy}</dd>
							</dl>
						</div>

						<div className='rounded-3xl border border-border/70 bg-muted/15 p-5'>
							<p className='text-sm font-medium'>Scorecard</p>
							<div className='mt-4 grid gap-3 sm:grid-cols-2'>
								<div className='rounded-2xl border border-border/60 bg-background/70 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
										Return winner
									</p>
									<p className='mt-2 text-lg font-semibold'>
										{winnerLabel(report.scorecard.winner_by_return)}
									</p>
									<p className='mt-2 text-sm text-muted-foreground'>
										Gap {formatSignedNumber(report.scorecard.return_gap)}
									</p>
								</div>
								<div className='rounded-2xl border border-border/60 bg-background/70 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
										Risk winner
									</p>
									<p className='mt-2 text-lg font-semibold'>
										{winnerLabel(report.scorecard.winner_by_risk)}
									</p>
									<p className='mt-2 text-sm text-muted-foreground'>
										Variance gap {formatSignedNumber(report.scorecard.variance_gap)}
									</p>
								</div>
								<div className='rounded-2xl border border-border/60 bg-background/70 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>Overlap</p>
									<p className='mt-2 text-lg font-semibold'>
										{formatPercent(report.scorecard.overlap_ratio)}
									</p>
									<p className='mt-2 text-sm text-muted-foreground'>
										{report.scorecard.overlap_count} shared assets between portfolios
									</p>
								</div>
								<div className='rounded-2xl border border-border/60 bg-background/70 p-4'>
									<p className='text-xs uppercase tracking-[0.2em] text-muted-foreground'>
										Runtime evidence
									</p>
									<p className='mt-2 text-lg font-semibold'>
										{report.quantum.fragments_executed} fragments
									</p>
									<p className='mt-2 text-sm text-muted-foreground'>
										{report.quantum.distributed_nodes_used} nodes,{' '}
										{report.evidence.observed_basis_state_count} basis states observed
									</p>
								</div>
							</div>
						</div>
					</div>

					<div className='grid gap-6 xl:grid-cols-2'>
						<ClaimList
							title='What this run supports'
							items={
								report.verdict.recommended_claims.length
									? report.verdict.recommended_claims
									: report.verdict.strengths
							}
							accent='positive'
						/>
						<ClaimList
							title='What not to claim'
							items={
								report.verdict.avoid_claims.length
									? report.verdict.avoid_claims
									: report.verdict.limitations
							}
							accent='caution'
						/>
					</div>

					<div className='grid gap-6 xl:grid-cols-2'>
						<div className='rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-5'>
							<div className='flex items-center gap-2'>
								<CheckCircle2Icon className='size-4 text-emerald-600' />
								<p className='font-medium'>Strengths</p>
							</div>
							<div className='mt-4 space-y-2'>
								{report.verdict.strengths.map(item => (
									<div
										key={item}
										className='rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground'
									>
										{item}
									</div>
								))}
							</div>
						</div>

						<div className='rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5'>
							<div className='flex items-center gap-2'>
								<AlertTriangleIcon className='size-4 text-amber-600' />
								<p className='font-medium'>Limitations</p>
							</div>
							<div className='mt-4 space-y-2'>
								{report.verdict.limitations.map(item => (
									<div
										key={item}
										className='rounded-2xl border border-border/60 bg-background/70 p-3 text-sm text-muted-foreground'
									>
										{item}
									</div>
								))}
							</div>
						</div>
					</div>

					<div className='grid gap-4 md:grid-cols-2'>
						<div className='rounded-3xl border border-border/70 bg-muted/15 p-4'>
							<div className='flex items-center gap-2'>
								<ScaleIcon className='size-4 text-primary' />
								<p className='font-medium'>Classical optimum</p>
							</div>
							<p className='mt-3 font-mono text-lg'>{report.classical.bitstring || '-'}</p>
							<div className='mt-3 space-y-1 text-sm text-muted-foreground'>
								<p>Assets: {report.classical.selected_assets.join(', ') || '-'}</p>
								<p>Objective: {formatSignedNumber(report.classical.objective)}</p>
								<p>Runtime: {formatDuration(report.classical.duration_ms)}</p>
							</div>
						</div>
						<div className='rounded-3xl border border-border/70 bg-muted/15 p-4'>
							<div className='flex items-center gap-2'>
								<CpuIcon className='size-4 text-primary' />
								<p className='font-medium'>Quantum candidate</p>
							</div>
							<p className='mt-3 font-mono text-lg'>{report.quantum.bitstring || '-'}</p>
							<div className='mt-3 space-y-1 text-sm text-muted-foreground'>
								<p>Assets: {report.quantum.selected_assets.join(', ') || '-'}</p>
								<p>Objective: {formatSignedNumber(report.quantum.objective)}</p>
								<p>Runtime: {formatDuration(report.quantum.duration_ms)}</p>
								<p>Probability: {formatPercent(report.quantum.probability)}</p>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</section>
	);
}
