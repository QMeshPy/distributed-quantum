export default function FidelityPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Network Fidelity</h1>
				<p className='text-sm text-muted-foreground'>
					Track quantum gate fidelity and error rates across the network
				</p>
			</div>

			<div className='rounded-lg border border-border bg-plane-bg-elevated p-12 text-center'>
				<p className='text-sm text-muted-foreground'>Fidelity metrics coming soon</p>
			</div>
		</div>
	);
}
