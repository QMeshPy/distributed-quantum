export default function RoadmapPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Product Roadmap</h1>
				<p className='text-sm text-muted-foreground'>
					Future plans and development timeline for the platform
				</p>
			</div>

			<div className='rounded-lg border border-border bg-plane-bg-elevated p-12 text-center'>
				<p className='text-sm text-muted-foreground'>Roadmap coming soon</p>
			</div>
		</div>
	);
}
