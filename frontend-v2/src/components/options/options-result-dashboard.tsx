'use client';

import type { OptionsAnalysisResult } from '@/types/options';
import { OPTION_TYPE_LABELS, OPTION_TYPE_INPUT_LABELS } from '@/types/options';

function fmt(n: number | null | undefined, decimals = 4): string {
	if (n == null || !isFinite(n)) return '—';
	return n.toFixed(decimals);
}

function fmtPct(n: number | null | undefined): string {
	if (n == null || !isFinite(n)) return '—';
	return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className='flex items-baseline justify-between gap-2 py-0.5'>
			<span className='text-xs text-muted-foreground'>{label}</span>
			<span className='text-xs font-medium text-foreground'>{value}</span>
		</div>
	);
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
	return (
		<div className='rounded-md border border-border bg-card p-3'>
			<p className='text-[0.68rem] uppercase tracking-wide text-muted-foreground'>{label}</p>
			<p className='mt-1 text-xl font-semibold text-foreground'>{value}</p>
			{sub ? <p className='mt-0.5 text-[0.68rem] text-muted-foreground'>{sub}</p> : null}
		</div>
	);
}

function GreeksBlock({
	label,
	delta,
	gamma,
	vega,
	theta,
	highlight
}: {
	label: string;
	delta: number;
	gamma: number;
	vega: number;
	theta: number;
	highlight?: boolean;
}) {
	return (
		<div
			className={`rounded border p-3 space-y-0.5 ${highlight ? 'border-blue-200 bg-blue-50/40' : 'border-border bg-muted/20'}`}
		>
			<p className='text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>{label}</p>
			<KV label='Δ Delta' value={fmt(delta, 4)} />
			<KV label='Γ Gamma' value={fmt(gamma, 6)} />
			<KV label='ν Vega' value={fmt(vega, 4)} />
			<KV label='Θ Theta' value={`${fmt(theta, 4)} (classical)`} />
		</div>
	);
}

function CIBar({
	lower,
	upper,
	classical
}: {
	lower: number;
	upper: number;
	classical: number;
}) {
	const range = upper - lower;
	if (range <= 0) return null;
	const ext = range * 0.5;
	const min = Math.min(lower - ext, classical - ext * 0.5);
	const max = Math.max(upper + ext, classical + ext * 0.5);
	const span = max - min;

	const toPos = (v: number) => `${(((v - min) / span) * 100).toFixed(1)}%`;

	return (
		<div className='space-y-1'>
			<p className='text-xs font-medium text-foreground'>IQAE confidence interval vs Black-Scholes</p>
			<div className='relative h-6 rounded bg-muted'>
				{/* CI band */}
				<div
					className='absolute top-1 bottom-1 rounded bg-blue-200'
					style={{ left: toPos(lower), right: `${(100 - parseFloat(toPos(upper))).toFixed(1)}%` }}
				/>
				{/* Classical marker */}
				<div
					className='absolute top-0 bottom-0 w-0.5 bg-orange-500'
					style={{ left: toPos(classical) }}
					title={`B-S: ${classical.toFixed(4)}`}
				/>
			</div>
			<div className='flex justify-between text-[0.65rem] text-muted-foreground'>
				<span>IQAE CI: [{fmt(lower)}, {fmt(upper)}]</span>
				<span className='text-orange-600'>B-S: {fmt(classical)}</span>
			</div>
		</div>
	);
}

export function OptionsResultDashboard({ result }: { result: OptionsAnalysisResult }) {
	const optionLabel = OPTION_TYPE_LABELS[result.option_type] ?? result.option_type;
	const inputLabels = OPTION_TYPE_INPUT_LABELS[result.option_type];

	const req = result.request as Record<string, unknown>;

	return (
		<div className='space-y-5'>
			{/* Tier 1 — Stat boxes */}
			<div className='grid grid-cols-2 gap-3 xl:grid-cols-4'>
				<StatBox label='Quantum price (QAE)' value={`$${fmt(result.quantum_price, 4)}`} sub='IQAE estimate' />
				<StatBox label='Classical price (B-S)' value={`$${fmt(result.classical_bs_price, 4)}`} sub='Black-Scholes' />
				<StatBox
					label='Price deviation'
					value={fmtPct(result.price_difference_pct)}
					sub='(quantum − B-S) / B-S'
				/>
				<StatBox
					label='Speedup factor'
					value={`${result.quadratic_speedup_factor}×`}
					sub={`vs ${result.classical_mc_samples_equivalent.toLocaleString()} MC samples`}
				/>
			</div>

			{/* Divergence / sigma-zero warnings */}
			{result.divergence_warning ? (
				<div className='rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800'>
					<span className='font-semibold'>Divergence warning:</span> Quantum and B-S prices differ by
					more than 5%. This may indicate circuit discretization error or an extreme parameter combination.
				</div>
			) : null}
			{result.sigma_zero_fallback ? (
				<div className='rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-800'>
					<span className='font-semibold'>σ = 0 fallback:</span> IQAE was skipped; result is the
					intrinsic value from Black-Scholes only.
				</div>
			) : null}

			{/* Tier 2 — Option summary */}
			<div className='rounded-md border border-border bg-card p-4 space-y-2'>
				<div className='flex flex-wrap items-center justify-between gap-2'>
					<p className='text-sm font-semibold text-foreground'>{optionLabel}</p>
					<span
						className={`rounded px-2 py-0.5 text-[0.7rem] font-semibold ${result.moneyness === 'ITM' ? 'bg-green-100 text-green-700' : result.moneyness === 'OTM' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}
					>
						{result.moneyness} · S/K = {fmt(result.moneyness_ratio, 3)}
					</span>
				</div>
				<div className='grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs md:grid-cols-3'>
					<KV label={inputLabels.s} value={fmt(result.request['current_value'] as number, 2)} />
					<KV label={inputLabels.k} value={fmt(result.request['strike_or_cost'] as number, 2)} />
					<KV label='T (years)' value={fmt(result.request['time_to_expiry'] as number, 3)} />
					<KV label='σ (volatility)' value={`${((result.request['volatility'] as number) * 100).toFixed(1)}%`} />
					<KV label='r (risk-free)' value={`${((result.request['risk_free_rate'] as number) * 100).toFixed(2)}%`} />
				</div>
			</div>

			{/* Tier 3 — Greeks comparison */}
			<div>
				<p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Greeks</p>
				<div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
					<GreeksBlock
						label='Quantum (IQAE finite diff)'
						highlight
						delta={result.quantum_greeks.delta}
						gamma={result.quantum_greeks.gamma}
						vega={result.quantum_greeks.vega}
						theta={result.quantum_greeks.theta}
					/>
					<GreeksBlock
						label='Classical (Black-Scholes)'
						delta={result.classical_greeks.delta}
						gamma={result.classical_greeks.gamma}
						vega={result.classical_greeks.vega}
						theta={result.classical_greeks.theta}
					/>
				</div>
			</div>

			{/* Tier 4 — Classical baselines side-by-side */}
			<div>
				<p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
					Classical baselines
				</p>
				<div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
					<div className='rounded border border-border bg-muted/20 p-3 space-y-0.5'>
						<p className='text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>
							Black-Scholes (closed-form)
						</p>
						<KV label='Price' value={`$${fmt(result.classical_bs_price, 4)}`} />
						<KV label='Delta' value={fmt(result.classical_greeks.delta, 4)} />
						<KV label='Gamma' value={fmt(result.classical_greeks.gamma, 6)} />
					</div>
					<div className='rounded border border-border bg-muted/20 p-3 space-y-0.5'>
						<p className='text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground mb-1'>
							Binomial tree (CRR, 200 steps)
						</p>
						<KV label='Price' value={`$${fmt(result.classical_binomial_price, 4)}`} />
						<KV
							label='Convergence gap'
							value={`$${Math.abs(result.classical_binomial_price - result.classical_bs_price).toFixed(5)}`}
						/>
					</div>
				</div>
			</div>

			{/* Tier 5 — Confidence interval bar */}
			{!result.sigma_zero_fallback ? (
				<div className='rounded-md border border-border bg-card p-4'>
					<CIBar
						lower={result.confidence_interval[0]}
						upper={result.confidence_interval[1]}
						classical={result.classical_bs_price}
					/>
				</div>
			) : null}

			{/* Tier 6 — Quantum advantage evidence */}
			{!result.sigma_zero_fallback ? (
				<div className='rounded-md border border-border bg-card p-4 space-y-1'>
					<p className='text-xs font-semibold text-foreground mb-2'>Quantum advantage evidence</p>
					<KV
						label='IQAE query complexity'
						value={`O(1/ε) = ${Math.round(1 / result.epsilon).toLocaleString()} queries`}
					/>
					<KV
						label='Classical MC equivalent'
						value={`O(1/ε²) = ${result.classical_mc_samples_equivalent.toLocaleString()} samples`}
					/>
					<KV label='Speedup factor' value={`${result.quadratic_speedup_factor}× fewer queries`} />
					<KV label='Epsilon (accuracy)' value={`±${result.epsilon * 100}%`} />
					<KV label='Confidence level' value={`${((1 - result.alpha) * 100).toFixed(0)}%`} />
					<KV label='IQAE runs (5 for price + Greeks)' value={result.num_iqae_runs} />
				</div>
			) : null}

			{/* Tier 7 — Circuit metadata */}
			{!result.sigma_zero_fallback ? (
				<div className='rounded-md border border-border bg-card p-4 space-y-1'>
					<p className='text-xs font-semibold text-foreground mb-2'>Circuit metadata</p>
					<div className='grid grid-cols-2 gap-x-6 gap-y-0.5'>
						<KV label='Total qubits' value={result.num_qubits} />
						<KV label='Circuit depth' value={result.circuit_depth} />
						<KV label='Shots per run' value={result.shots_per_run.toLocaleString()} />
						<KV label='Backend' value='BasicSimulator (statevector)' />
					</div>
				</div>
			) : null}

			{/* Timing footer */}
			<div className='flex items-center justify-between text-[0.65rem] text-muted-foreground pt-1 border-t border-border'>
				<span>Generated {new Date(result.generated_at).toLocaleString()}</span>
				<span>Analysis: {result.analysis_duration_ms} ms</span>
			</div>
		</div>
	);
}
