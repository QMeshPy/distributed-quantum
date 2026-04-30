import { Suspense } from 'react';

export default function StatesPage() {
	return (
		<Suspense
			fallback={
				<div className='flex flex-col items-center justify-center gap-3 px-4 py-24 text-muted-foreground'>
					<p className='text-sm'>Loading top states…</p>
				</div>
			}
		>
			<div className='flex flex-col gap-6 py-6'>
				<div className='px-4 lg:px-6'>
					<div className='space-y-1'>
						<h1 className='text-lg font-semibold tracking-tight'>Top Quantum States</h1>
						<p className='text-sm text-muted-foreground'>
							Highest-probability bitstrings seen in the QAOA state distribution after tuning
						</p>
					</div>
				</div>
				<div className='px-4 lg:px-6'>
					<p className='text-sm text-muted-foreground'>
						Select a completed job from Upload & Analyse to view top states here.
					</p>
				</div>
			</div>
		</Suspense>
	);
}
