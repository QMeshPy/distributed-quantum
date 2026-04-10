import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MOCK_RUNS } from '@/lib/runs-mock';
import { Button } from '@/components/ui/button';

type PageProps = {
	params: Promise<{ runId: string }>;
};

export default async function RunDetailPage({ params }: PageProps) {
	const { runId } = await params;
	const run = MOCK_RUNS.find(r => r.id === runId);

	if (!run) {
		notFound();
	}

	return (
		<div className='flex flex-col gap-6 p-4 md:p-6'>
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div>
					<h1 className='text-lg font-semibold tracking-tight'>{run.name}</h1>
					<p className='mt-1 font-mono text-sm text-muted-foreground'>{run.id}</p>
				</div>
				<Button
					variant='outline'
					size='sm'
					asChild
				>
					<Link href='/runs'>Back to runs</Link>
				</Button>
			</div>

			<dl className='grid max-w-lg gap-3 text-sm'>
				<div className='flex justify-between gap-4'>
					<dt className='text-muted-foreground'>Status</dt>
					<dd className='font-medium capitalize'>{run.status}</dd>
				</div>
				<div className='flex justify-between gap-4'>
					<dt className='text-muted-foreground'>Started</dt>
					<dd>{new Date(run.startedAt).toLocaleString()}</dd>
				</div>
			</dl>

			<p className='text-sm text-muted-foreground'>
				Run detail view — connect metrics, logs, and DAG here when the API is available.
			</p>
		</div>
	);
}
