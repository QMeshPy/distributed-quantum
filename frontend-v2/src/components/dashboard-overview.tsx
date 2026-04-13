'use client';

import { AlertCircleIcon, LoaderIcon, RefreshCcwIcon } from 'lucide-react';

import { ChartAreaInteractive } from '@/components/chart-area-interactive';
import { DataTable } from '@/components/data-table';
import { SectionCards } from '@/components/section-cards';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { useDashboardData } from '@/hooks/use-dashboard-data';

export function DashboardOverview() {
	const { snapshot, error, isLoading, isRefreshing, selectedNodeId, selectNode, clearSelectedNode, refresh } =
		useDashboardData();

	const selectedNode = snapshot?.nodes.find(node => node.nodeId === selectedNodeId) ?? null;
	const handleNodeSelection = (nodeId: string | null) => {
		if (!nodeId) {
			clearSelectedNode();
			return;
		}

		selectNode(nodeId);
	};

	if (!snapshot && !isLoading && error) {
		return (
			<div className='flex flex-1 flex-col px-4 py-6 lg:px-6'>
				<Empty className='border border-dashed'>
					<EmptyHeader>
						<EmptyMedia variant='icon'>
							<AlertCircleIcon />
						</EmptyMedia>
						<EmptyTitle>Dashboard data is unavailable</EmptyTitle>
						<EmptyDescription>{error}</EmptyDescription>
					</EmptyHeader>
					<Button onClick={() => void refresh()}>Retry</Button>
				</Empty>
			</div>
		);
	}

	return (
		<div className='flex flex-1 flex-col'>
			<div className='@container/main flex flex-1 flex-col gap-2'>
				<div className='flex flex-col gap-4 py-4 md:gap-6 md:py-6'>
					<div className='flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:justify-between lg:px-6'>
						<div className='space-y-1'>
							<div className='flex flex-wrap items-center gap-2'>
								<h1 className='text-lg font-semibold'>Coordinator overview</h1>
								{snapshot?.health ? (
									<Badge variant='outline'>{snapshot.health.environment}</Badge>
								) : null}
								{selectedNode ? (
									<Badge variant='secondary'>Focused on {selectedNode.nodeLabel}</Badge>
								) : null}
							</div>
							<p className='text-sm text-muted-foreground'>
								{snapshot
									? `${snapshot.nodes.length} nodes and ${snapshot.services.length} services are flowing through the frontend-owned dashboard route.`
									: 'Loading the latest coordinator snapshot.'}
							</p>
						</div>
						<div className='flex flex-wrap items-center gap-2'>
							{selectedNode ? (
								<Button
									variant='outline'
									size='sm'
									onClick={clearSelectedNode}
								>
									Clear node focus
								</Button>
							) : null}
							<Button
								variant='outline'
								size='sm'
								onClick={() => void refresh()}
								disabled={isRefreshing}
							>
								{isRefreshing ? <LoaderIcon className='animate-spin' /> : <RefreshCcwIcon />}
								Refresh
							</Button>
						</div>
					</div>

					{error && snapshot ? (
						<div className='px-4 lg:px-6'>
							<Alert variant='destructive'>
								<AlertCircleIcon />
								<AlertTitle>Using the latest cached dashboard snapshot</AlertTitle>
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						</div>
					) : null}

					{snapshot?.warnings.length ? (
						<div className='px-4 lg:px-6'>
							<Alert>
								<AlertCircleIcon />
								<AlertTitle>Partial backend data</AlertTitle>
								<AlertDescription>{snapshot.warnings.join(' ')}</AlertDescription>
							</Alert>
						</div>
					) : null}

					<SectionCards
						cards={snapshot?.summaryCards ?? []}
						isLoading={isLoading}
					/>

					<div className='px-4 lg:px-6'>
						<ChartAreaInteractive
							nodes={snapshot?.chart ?? []}
							isLoading={isLoading}
							selectedNodeId={selectedNodeId}
							onSelectNode={handleNodeSelection}
						/>
					</div>

					<DataTable
						rows={snapshot?.services ?? []}
						isLoading={isLoading}
						selectedNodeId={selectedNodeId}
						onSelectNode={selectNode}
						onClearSelectedNode={clearSelectedNode}
					/>
				</div>
			</div>
		</div>
	);
}
