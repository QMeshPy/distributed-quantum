import { Suspense } from 'react';

export default function BenchmarkPage() {
	return (
		<Suspense
			fallback={
				<div className='flex flex-col items-center justify-center gap-3 px-4 py-24 text-muted-foreground'>
					<p className='text-sm'>Loading benchmark analysis…</p>
				</div>
			}
		>
			<div className='flex flex-col gap-6 py-6'>
				<div className='px-4 lg:px-6'>
					<div className='space-y-1'>
						<h1 className='text-lg font-semibold tracking-tight'>Benchmark Analysis</h1>
						<p className='text-sm text-muted-foreground'>
							Exact classical enumeration versus the best feasible quantum state
						</p>
					</div>
				</div>
				<div className='px-4 lg:px-6'>
					<p className='text-sm text-muted-foreground'>
						Select a completed job from Upload & Analyse to view benchmark results here.
					</p>
				</div>
			</div>
		</Suspense>
	);
}
