import { Suspense } from 'react';

import { DashboardShell } from '@/components/dashboard-shell';

export default function MainLayout({ children }: { children: React.ReactNode }) {
	return (
		<Suspense
			fallback={
				<div className='flex h-svh items-center justify-center bg-muted/30 text-sm text-muted-foreground'>
					Loading…
				</div>
			}
		>
			<DashboardShell>{children}</DashboardShell>
		</Suspense>
	);
}
