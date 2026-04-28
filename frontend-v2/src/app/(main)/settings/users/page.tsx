export default function UsersPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Users & Permissions</h1>
				<p className='text-sm text-muted-foreground'>
					Manage workspace members and their access permissions
				</p>
			</div>

			<div className='rounded-lg border border-border bg-plane-bg-elevated p-12 text-center'>
				<p className='text-sm text-muted-foreground'>User management coming soon</p>
			</div>
		</div>
	);
}
