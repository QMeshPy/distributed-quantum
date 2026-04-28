export default function SchemasPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Data Schemas</h1>
				<p className='text-sm text-muted-foreground'>
					Schema definitions and data models
				</p>
			</div>

			<div className='rounded-lg border border-border bg-plane-bg-elevated p-12 text-center'>
				<p className='text-sm text-muted-foreground'>Schema documentation coming soon</p>
			</div>
		</div>
	);
}
