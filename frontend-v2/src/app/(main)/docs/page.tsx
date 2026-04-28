export default function DocsPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>System Documentation</h1>
				<p className='text-sm text-muted-foreground'>
					Comprehensive documentation for the distributed quantum computing platform
				</p>
			</div>

			<div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
				<div className='rounded-lg border border-border bg-plane-bg-elevated p-6'>
					<h3 className='font-medium'>Getting Started</h3>
					<p className='mt-2 text-sm text-muted-foreground'>
						Quick start guide for new users
					</p>
				</div>
				<div className='rounded-lg border border-border bg-plane-bg-elevated p-6'>
					<h3 className='font-medium'>Architecture</h3>
					<p className='mt-2 text-sm text-muted-foreground'>
						System architecture and design principles
					</p>
				</div>
				<div className='rounded-lg border border-border bg-plane-bg-elevated p-6'>
					<h3 className='font-medium'>Tutorials</h3>
					<p className='mt-2 text-sm text-muted-foreground'>
						Step-by-step tutorials and guides
					</p>
				</div>
			</div>
		</div>
	);
}
