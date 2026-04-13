import { Suspense } from 'react';

import { FragmentFlowPageClient } from '@/components/fragment-flow-page-client';

type PageProps = {
	params: Promise<{ runId: string }>;
};

export default async function RunFragmentFlowPage({ params }: PageProps) {
	const { runId } = await params;

	return (
		<Suspense
			fallback={<div className='p-6 text-sm text-muted-foreground'>Loading fragment flow…</div>}
		>
			<FragmentFlowPageClient runId={runId} />
		</Suspense>
	);
}
