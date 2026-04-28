export default function ZonesPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Network Zones</h1>
				<p className='text-sm text-muted-foreground'>
					Geographic and logical zones in the distributed quantum network
				</p>
			</div>

			<div className='rounded-lg border border-border bg-plane-bg-elevated p-12 text-center'>
				<p className='text-sm text-muted-foreground'>Zone management coming soon</p>
			</div>
		</div>
	);
}
