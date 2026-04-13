'use client';

import * as React from 'react';
import type { DashboardServiceRow } from '@/types/dashboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SearchXIcon, ServerIcon } from 'lucide-react';

type DataTableProps = {
	rows: DashboardServiceRow[];
	isLoading?: boolean;
	selectedNodeId: string | null;
	onSelectNode: (nodeId: string) => void;
	onClearSelectedNode: () => void;
};

export function DataTable({
	rows,
	isLoading = false,
	selectedNodeId,
	onSelectNode,
	onClearSelectedNode
}: DataTableProps) {
	const [search, setSearch] = React.useState('');
	const [availabilityFilter, setAvailabilityFilter] = React.useState<'all' | 'available' | 'unavailable'>('all');
	const deferredSearch = React.useDeferredValue(search);
	const normalizedQuery = deferredSearch.trim().toLowerCase();

	const filteredRows = rows.filter(row => {
		if (selectedNodeId && row.nodeId !== selectedNodeId) {
			return false;
		}

		if (availabilityFilter === 'available' && !row.availability) {
			return false;
		}

		if (availabilityFilter === 'unavailable' && row.availability) {
			return false;
		}

		if (!normalizedQuery) {
			return true;
		}

		return [row.nodeId, row.nodeLabel, row.serviceType, row.primaryAddress ?? '']
			.join(' ')
			.toLowerCase()
			.includes(normalizedQuery);
	});

	return (
		<div className='px-4 lg:px-6'>
			<Card>
				<CardHeader className='gap-4'>
					<div className='space-y-1'>
						<CardTitle>Service registry</CardTitle>
						<CardDescription>
							Live backend advertisements filtered through the app-owned dashboard route.
						</CardDescription>
					</div>
					<div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
						<div className='flex flex-1 flex-col gap-3 sm:flex-row'>
							<Input
								value={search}
								onChange={event => setSearch(event.target.value)}
								placeholder='Search by node, service, or address'
								className='sm:max-w-sm'
							/>
							<Select
								value={availabilityFilter}
								onValueChange={value => setAvailabilityFilter(value as typeof availabilityFilter)}
							>
								<SelectTrigger className='sm:max-w-48'>
									<SelectValue placeholder='Availability' />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='all'>All services</SelectItem>
									<SelectItem value='available'>Available only</SelectItem>
									<SelectItem value='unavailable'>Unavailable only</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className='flex flex-wrap items-center gap-2'>
							<Badge variant='outline'>{filteredRows.length} visible</Badge>
							{selectedNodeId ? (
								<Button
									variant='outline'
									size='sm'
									onClick={onClearSelectedNode}
								>
									Clear node focus
								</Button>
							) : null}
						</div>
					</div>
				</CardHeader>
				<CardContent className='space-y-4'>
					{isLoading ? (
						<div className='space-y-3'>
							{Array.from({ length: 6 }, (_, index) => (
								<Skeleton
									key={index}
									className='h-12 w-full rounded-2xl'
								/>
							))}
						</div>
					) : filteredRows.length ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Node</TableHead>
									<TableHead>Service</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Fidelity</TableHead>
									<TableHead>Qubit range</TableHead>
									<TableHead>Address</TableHead>
									<TableHead>Updated</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredRows.map(row => (
									<TableRow key={row.id}>
										<TableCell>
											<button
												type='button'
												onClick={() => onSelectNode(row.nodeId)}
												className='flex max-w-48 flex-col text-left'
											>
												<span className='font-medium'>{row.nodeLabel}</span>
												<span className='truncate text-xs text-muted-foreground'>
													{row.nodeId}
												</span>
											</button>
										</TableCell>
										<TableCell>
											<div className='flex flex-col'>
												<span className='font-medium'>{row.serviceType}</span>
												{row.averageNodeFidelity !== null ? (
													<span className='text-xs text-muted-foreground'>
														Node avg {(row.averageNodeFidelity * 100).toFixed(2)}%
													</span>
												) : null}
											</div>
										</TableCell>
										<TableCell>
											<Badge variant={row.availability ? 'secondary' : 'destructive'}>
												{row.statusLabel}
											</Badge>
										</TableCell>
										<TableCell className='font-mono tabular-nums'>{row.fidelityLabel}</TableCell>
										<TableCell>{row.qubitRangeLabel}</TableCell>
										<TableCell>
											<div className='max-w-56'>
												<div className='truncate font-mono text-xs'>
													{row.primaryAddress ?? 'No address advertised'}
												</div>
												{row.addressCount > 1 ? (
													<div className='text-xs text-muted-foreground'>
														+{row.addressCount - 1} additional address
														{row.addressCount > 2 ? 'es' : ''}
													</div>
												) : null}
											</div>
										</TableCell>
										<TableCell>{row.updatedLabel}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<Empty className='border border-dashed'>
							<EmptyHeader>
								<EmptyMedia variant='icon'>{rows.length ? <SearchXIcon /> : <ServerIcon />}</EmptyMedia>
								<EmptyTitle>
									{rows.length ? 'No services match these filters' : 'No services advertised yet'}
								</EmptyTitle>
								<EmptyDescription>
									{rows.length
										? 'Try a broader search, or clear the focused node to see the full registry again.'
										: 'Once the backend starts reporting services, they will show up here automatically.'}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
