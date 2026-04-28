export default function AuditLogsPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Audit Logs</h1>
				<p className='text-sm text-muted-foreground'>
					View and search system audit logs and user activity
				</p>
			</div>

			<div className='rounded-lg border border-border bg-plane-bg-elevated p-12 text-center'>
				<p className='text-sm text-muted-foreground'>Audit logs coming soon</p>
			</div>
		</div>
	);
}
