'use client';

import { Suspense } from 'react';

import { RunsPageClient } from '@/components/runs-page-client';

export default function RunsPage() {
	return (
		<Suspense fallback={<div className='p-6 text-sm text-muted-foreground'>Loading runs...</div>}>
			<RunsPageClient />
		</Suspense>
	);
}
