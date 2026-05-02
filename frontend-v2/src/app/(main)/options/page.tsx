import { Suspense } from 'react';

import { OptionsAnalyticsClient } from '@/components/options/options-analytics-client';

export default function OptionsPage() {
	return (
		<Suspense
			fallback={
				<div className='flex flex-col items-center justify-center gap-3 px-4 py-24 text-muted-foreground'>
					<p className='text-sm'>Loading options pricing…</p>
				</div>
			}
		>
			<OptionsAnalyticsClient />
		</Suspense>
	);
}
