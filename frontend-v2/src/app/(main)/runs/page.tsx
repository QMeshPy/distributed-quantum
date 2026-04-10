'use client';

import type { RunStatus } from '@/lib/runs-mock';
import { MOCK_RUNS } from '@/lib/runs-mock';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const FILTER_TABS: { value: 'all' | RunStatus; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'current', label: 'Current' },
	{ value: 'pending', label: 'Pending' },
	{ value: 'done', label: 'Done' }
];

function statusBadgeVariant(status: RunStatus) {
	switch (status) {
		case 'current':
			return 'default';
		case 'pending':
			return 'secondary';
		case 'done':
			return 'outline';
	}
}

function RunsPageInner() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const filter = (searchParams.get('status') as 'all' | RunStatus | null) ?? 'all';

	const validFilter: 'all' | RunStatus =
		filter === 'current' || filter === 'pending' || filter === 'done' ? filter : 'all';

	const rows = useMemo(() => {
		if (validFilter === 'all') return MOCK_RUNS;
		return MOCK_RUNS.filter(r => r.status === validFilter);
	}, [validFilter]);

	const setFilter = (next: 'all' | RunStatus) => {
		const params = new URLSearchParams(searchParams.toString());
		if (next === 'all') {
			params.delete('status');
		} else {
			params.set('status', next);
		}
		const q = params.toString();
		router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
	};

	return (
		<div className='flex flex-col gap-4 p-4 md:p-6'>
			<div>
				<h1 className='text-lg font-semibold tracking-tight'>Runs</h1>
				<p className='text-sm text-muted-foreground'>Open runs and history. Select a row to open the run detail.</p>
			</div>

			<div className='flex flex-wrap gap-2 border-b border-border pb-2'>
				{FILTER_TABS.map(tab => {
					const isActive = tab.value === validFilter;
					return (
						<button
							key={tab.value}
							type='button'
							onClick={() => setFilter(tab.value)}
							className={cn(
								'relative rounded-md px-3 py-2 text-sm font-medium transition-colors',
								isActive
									? 'text-foreground after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-full after:bg-primary'
									: 'text-muted-foreground hover:text-foreground'
							)}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			<div className='overflow-hidden rounded-lg border border-border bg-card'>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className='w-[40%]'>Run</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className='hidden sm:table-cell'>Started</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={3}
									className='h-24 text-center text-muted-foreground'
								>
									No runs in this filter.
								</TableCell>
							</TableRow>
						) : (
							rows.map(row => (
								<TableRow key={row.id}>
									<TableCell>
										<Link
											href={`/runs/${row.id}`}
											className='font-medium text-primary underline-offset-4 hover:underline'
										>
											{row.name}
										</Link>
										<div className='mt-0.5 font-mono text-xs text-muted-foreground'>{row.id}</div>
									</TableCell>
									<TableCell>
										<Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
									</TableCell>
									<TableCell className='hidden text-muted-foreground sm:table-cell'>
										{new Date(row.startedAt).toLocaleString()}
									</TableCell>
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

export default function RunsPage() {
	return (
		<Suspense
			fallback={
				<div className='p-6 text-sm text-muted-foreground'>Loading runs…</div>
			}
		>
			<RunsPageInner />
		</Suspense>
	);
}
