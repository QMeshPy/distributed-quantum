export default function MeasurementsPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Measurements</h1>
				<p className='text-sm text-muted-foreground'>
					Quantum measurement results and statistical analysis
				</p>
			</div>

			<div className='rounded-lg border border-border bg-plane-bg-elevated p-12 text-center'>
				<p className='text-sm text-muted-foreground'>Measurement analytics coming soon</p>
			</div>
		</div>
	);
}
