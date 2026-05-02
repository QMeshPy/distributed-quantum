'use client';

import Link from 'next/link';
import { FileJsonIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
	FinancialComparisonPitchPosition,
	FinancialComparisonReport,
	FinancialComparisonWinner
} from '@/types/financial';

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

function winnerLabel(w: FinancialComparisonWinner) {
	if (w === 'classical') return 'Classical';
	if (w === 'quantum') return 'Quantum';
	if (w === 'tie') return 'Tie';
	return 'Inconclusive';
}

function pitchLabel(p: FinancialComparisonPitchPosition) {
	if (p === 'numerical_advantage') return 'Numerical advantage';
	if (p === 'mixed') return 'Mixed signal';
	if (p === 'workflow_evidence') return 'Workflow evidence';
	return 'Not ready';
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
		<dl className='grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm leading-6'>
			{children}
		</dl>
	);
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
	return (
		<div className='rounded-md border border-border bg-card p-4 space-y-3'>
			{title ? <SectionTitle>{title}</SectionTitle> : null}
			{children}
		</div>
	);
}

function Check({ label, present, detail }: { label: string; present: boolean; detail: string }) {
	return (
		<div className='flex items-start justify-between gap-3 py-1.5 text-sm'>
			<span className='text-foreground'>{label}</span>
			<span className={`shrink-0 rounded px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide ${present ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
				{present ? 'ok' : 'missing'}
			</span>
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
		<section id='comparison' className='space-y-4'>
			<div className='flex items-center justify-between gap-3'>
				<div>
					<SectionTitle>Investor comparison</SectionTitle>
					<p className='mt-1 text-sm font-semibold text-foreground'>{report.verdict.headline}</p>
					<div className='mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground'>
						<span>{pitchLabel(report.verdict.pitch_position)}</span>
						<span>·</span>
						<span>{titleCase(report.verdict.claim_readiness)}</span>
					</div>
				</div>
				<Button size='sm' variant='outline' asChild>
					<Link href={`/api/finance/${encodeURIComponent(jobId)}/comparison`} target='_blank'>
						<FileJsonIcon className='size-3.5' />
						JSON
					</Link>
				</Button>
			</div>

			<p className='text-sm leading-6 text-muted-foreground'>{report.verdict.summary}</p>

			<div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
				{[
					{ label: 'Objective winner', value: winnerLabel(report.scorecard.winner_by_objective), sub: `Gap ${fmtSigned(report.scorecard.objective_gap)}` },
					{ label: 'Return winner', value: winnerLabel(report.scorecard.winner_by_return), sub: `Gap ${fmtSigned(report.scorecard.return_gap)}` },
					{ label: 'Runtime winner', value: winnerLabel(report.scorecard.winner_by_runtime), sub: `Classical ${fmtDur(report.classical.duration_ms)} · Quantum ${fmtDur(report.quantum.duration_ms)}` },
					{ label: 'Feasible mass', value: fmtPct(report.quantum.feasible_probability_mass), sub: `Rank ${report.quantum.rank ?? '—'} / percentile ${fmtPct(report.quantum.percentile)}` }
				].map(({ label, value, sub }) => (
					<Block key={label}>
						<SectionTitle>{label}</SectionTitle>
						<p className='text-xl font-semibold text-foreground'>{value}</p>
						<p className='text-xs text-muted-foreground'>{sub}</p>
					</Block>
				))}
			</div>

			<div className='grid gap-4 xl:grid-cols-2'>
				<Block title='Classical baseline'>
					<DL>
						<KV label='Strategy' value={report.classical.strategy} />
						<KV label='Evaluated' value={fmtN(report.classical.evaluated_portfolios)} />
						<KV label='Exact optimum' value={report.classical.is_exact_optimum ? 'Yes' : 'No'} />
						<KV label='Runtime' value={fmtDur(report.classical.duration_ms)} />
						<KV label='Bitstring' value={<span className='font-mono'>{report.classical.bitstring || '—'}</span>} />
						<KV label='Assets' value={report.classical.selected_assets.join(', ') || '—'} />
						<KV label='Objective' value={fmtSigned(report.classical.objective)} />
					</DL>
				</Block>

				<Block title='Quantum route'>
					<DL>
						<KV label='Strategy' value={report.quantum.strategy} />
						<KV label='Ansatz' value={report.quantum.ansatz} />
						<KV label='Evaluations' value={fmtN(report.quantum.parameter_evaluations)} />
						<KV label='Fragments' value={`${report.quantum.fragments_executed} / ${fmtN(report.quantum.distributed_nodes_used)} nodes`} />
						<KV label='Runtime' value={fmtDur(report.quantum.duration_ms)} />
						<KV label='Bitstring' value={<span className='font-mono'>{report.quantum.bitstring || '—'}</span>} />
						<KV label='Assets' value={report.quantum.selected_assets.join(', ') || '—'} />
						<KV label='Probability' value={fmtPct(report.quantum.probability)} />
					</DL>
				</Block>
			</div>

			<div className='grid gap-4 xl:grid-cols-2'>
				<Block title='Dataset'>
					<DL>
						<KV label='Window' value={`${fmtDate(report.dataset.start_date)} → ${fmtDate(report.dataset.end_date)}`} />
						<KV label='Shape' value={`${fmtN(report.dataset.row_count)} × ${fmtN(report.dataset.col_count)}`} />
						<KV label='Layout' value={`${titleCase(report.dataset.input_layout)} / ${titleCase(report.dataset.inferred_frequency)}`} />
						<KV label='Assets' value={`${fmtN(report.dataset.raw_asset_count)} raw → ${fmtN(report.dataset.asset_count)} modeled`} />
						<KV label='Periods' value={fmtN(report.dataset.period_count)} />
					</DL>
					{report.dataset.selected_tickers.length > 0 && (
						<p className='text-xs text-muted-foreground'>{report.dataset.selected_tickers.join(', ')}</p>
					)}
				</Block>

				<Block title='Evidence checklist'>
					<div className='divide-y divide-border'>
						<Check label='Exact baseline' present={report.evidence.exact_baseline_available} detail='' />
						<Check label='Efficient frontier' present={report.evidence.efficient_frontier_points > 0} detail='' />
						<Check label='Top states' present={report.evidence.top_state_count > 0} detail='' />
						<Check label='Fragment routing' present={report.evidence.fragment_count > 0} detail='' />
						<Check label='OpenQASM' present={report.quantum.has_qasm} detail='' />
						<Check label='Runtime result' present={report.quantum.has_runtime_result} detail='' />
					</div>
					{report.evidence.warnings.length > 0 && (
						<ul className='mt-2 space-y-1 text-xs text-muted-foreground list-disc pl-4'>
							{report.evidence.warnings.map(w => <li key={w}>{w}</li>)}
						</ul>
					)}
				</Block>
			</div>

			<div className='grid gap-4 xl:grid-cols-2'>
				<Block title='What this run supports'>
					<ul className='space-y-1.5 text-sm leading-6 text-muted-foreground list-disc pl-4'>
						{(report.verdict.recommended_claims.length ? report.verdict.recommended_claims : report.verdict.strengths).map(c => (
							<li key={c}>{c}</li>
						))}
					</ul>
				</Block>
				<Block title='What not to claim'>
					<ul className='space-y-1.5 text-sm leading-6 text-muted-foreground list-disc pl-4'>
						{(report.verdict.avoid_claims.length ? report.verdict.avoid_claims : report.verdict.limitations).map(c => (
							<li key={c}>{c}</li>
						))}
					</ul>
				</Block>
			</div>

			{report.fairness.notes.length > 0 && (
				<Block title='Fairness notes'>
					<ul className='space-y-1.5 text-sm leading-6 text-muted-foreground list-disc pl-4'>
						{report.fairness.notes.map(n => <li key={n}>{n}</li>)}
					</ul>
				</Block>
			)}
		</section>
	);
}
