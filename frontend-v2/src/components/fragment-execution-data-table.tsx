'use client';

import { AlertCircleIcon } from 'lucide-react';
import {
	flexRender,
	getCoreRowModel,
	useReactTable,
	type ColumnDef
} from '@tanstack/react-table';

import { RunStatusBadge } from '@/components/run-status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { RunBadgeVariant, RunFragmentResultSummary } from '@/types/runs';

function fragmentStatusLabel(status: string): string {
	const s = status.trim();
	if (!s.length) {
		return 'Unknown';
	}
	return s
		.toLowerCase()
		.split(/[_\s]+/)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function fragmentStatusBadgeVariant(status: string): RunBadgeVariant {
	const u = status.trim().toUpperCase();
	if (u === 'SUCCESS') {
		return 'outline';
	}
	if (u === 'FAILED') {
		return 'destructive';
	}
	return 'secondary';
}

const columns: ColumnDef<RunFragmentResultSummary>[] = [
	{
		accessorKey: 'fragmentId',
		header: 'Fragment',
		cell: ({ row }) => (
			<span className='font-mono text-sm font-medium tracking-tight'>{row.original.fragmentId}</span>
		),
		meta: { cellClass: 'w-[8.5rem] min-w-[7rem]' }
	},
	{
		accessorKey: 'nodeId',
		header: 'Node',
		cell: ({ row }) => (
			<span
				className='block max-w-[14rem] truncate font-mono text-xs text-foreground/90'
				title={row.original.nodeId}
			>
				{row.original.nodeId}
			</span>
		),
		meta: { cellClass: 'min-w-[10rem] max-w-[14rem]' }
	},
	{
		accessorKey: 'status',
		header: 'Status',
		cell: ({ row }) => (
			<RunStatusBadge
				label={fragmentStatusLabel(row.original.status)}
				variant={fragmentStatusBadgeVariant(row.original.status)}
			/>
		),
		meta: { cellClass: 'w-[7.5rem]' }
	},
	{
		accessorKey: 'attempts',
		header: () => <span className='block w-full text-end'>Attempts</span>,
		cell: ({ row }) => (
			<span className='block w-full text-end tabular-nums'>{row.original.attempts}</span>
		),
		meta: { headClass: 'text-end', cellClass: 'w-[5.5rem] tabular-nums' }
	},
	{
		accessorKey: 'observedFidelity',
		header: () => <span className='block w-full text-end'>Fidelity</span>,
		cell: ({ row }) => (
			<span className='block w-full text-end font-mono text-xs tabular-nums'>
				{row.original.observedFidelity ?? '—'}
			</span>
		),
		meta: { headClass: 'text-end', cellClass: 'w-[6.5rem]' }
	},
	{
		accessorKey: 'finishedAtLabel',
		header: 'Finished',
		cell: ({ row }) => (
			<div className='flex min-w-0 items-center gap-2'>
				<span className='text-muted-foreground min-w-0 truncate text-xs'>
					{row.original.finishedAtLabel}
				</span>
				{row.original.error ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type='button'
								className='text-destructive hover:text-destructive/90 shrink-0'
								aria-label='Fragment error details'
							>
								<AlertCircleIcon className='size-4' />
							</button>
						</TooltipTrigger>
						<TooltipContent
							side='left'
							className='max-w-xs text-xs'
						>
							{row.original.error}
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		),
		meta: { cellClass: 'min-w-[8rem] max-w-[12rem] whitespace-normal' }
	}
];

export function FragmentExecutionDataTable({ data }: { data: RunFragmentResultSummary[] }) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: row => row.fragmentId
	});

	return (
		<Table className='min-w-[44rem]'>
			<TableHeader>
				{table.getHeaderGroups().map(headerGroup => (
					<TableRow
						key={headerGroup.id}
						className='border-border bg-muted/50 hover:bg-muted/50'
					>
						{headerGroup.headers.map(header => {
							const meta = header.column.columnDef.meta as
								| { headClass?: string; cellClass?: string }
								| undefined;
							return (
								<TableHead
									key={header.id}
									className={cn(
										'sticky top-0 z-10 border-b border-border/80 bg-muted/95 font-medium backdrop-blur-sm supports-[backdrop-filter]:bg-muted/80',
										meta?.headClass
									)}
								>
									{header.isPlaceholder
										? null
										: flexRender(header.column.columnDef.header, header.getContext())}
								</TableHead>
							);
						})}
					</TableRow>
				))}
			</TableHeader>
			<TableBody>
				{table.getRowModel().rows.length ? (
					table.getRowModel().rows.map(row => (
						<TableRow
							key={row.id}
							className='border-border text-sm transition-colors hover:bg-muted/40'
						>
							{row.getVisibleCells().map(cell => {
								const meta = cell.column.columnDef.meta as { cellClass?: string } | undefined;
								return (
									<TableCell
										key={cell.id}
										className={cn(meta?.cellClass)}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								);
							})}
						</TableRow>
					))
				) : (
					<TableRow>
						<TableCell
							colSpan={columns.length}
							className='text-muted-foreground h-24 text-center whitespace-normal'
						>
							No rows on this page.
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}
