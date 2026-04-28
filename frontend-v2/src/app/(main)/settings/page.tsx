export default function SettingsPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>General Settings</h1>
				<p className='text-sm text-muted-foreground'>
					Manage your workspace preferences and configuration
				</p>
			</div>

			<div className='space-y-6'>
				<div className='rounded-lg border border-border bg-plane-bg-elevated'>
					<div className='p-4'>
						<h3 className='font-medium'>Workspace Name</h3>
						<p className='mt-1 text-sm text-muted-foreground'>
							The name of your quantum workspace
						</p>
					</div>
				</div>

				<div className='rounded-lg border border-border bg-plane-bg-elevated'>
					<div className='p-4'>
						<h3 className='font-medium'>Theme</h3>
						<p className='mt-1 text-sm text-muted-foreground'>
							Choose your preferred color theme
						</p>
					</div>
				</div>

				<div className='rounded-lg border border-border bg-plane-bg-elevated'>
					<div className='p-4'>
						<h3 className='font-medium'>Language</h3>
						<p className='mt-1 text-sm text-muted-foreground'>
							Select your preferred language
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
