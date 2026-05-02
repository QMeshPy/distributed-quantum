'use client';

export function OptionsHero() {
	return (
		<div className='border-b border-border pb-5'>
			<p className='text-xs font-semibold uppercase tracking-widest text-muted-foreground'>
				Track C — quantum vs classical
			</p>
			<h1 className='mt-2 text-2xl font-semibold tracking-tight text-foreground'>
				Real Options Pricing
			</h1>
			<p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
				Price corporate real options (expand, delay, abandon, patent, natural resource) and financial
				options using Quantum Amplitude Estimation (IQAE). The backend runs a full A–Q–IQAE circuit
				pipeline alongside Black-Scholes and a binomial tree, then computes quantum Greeks via finite
				difference.
			</p>
			<div className='mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground'>
				<span>
					<span className='font-medium text-foreground'>Method:</span> Iterative Amplitude Estimation
					(Suzuki et al. 2020)
				</span>
				<span>8 Damodaran option types · Quantum Greeks · 96-industry σ lookup · Binomial tree baseline</span>
			</div>
		</div>
	);
}
