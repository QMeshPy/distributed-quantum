'use client';

import { DashboardNetworkStats } from '@/components/dashboard-network-stats';
import { useDashboardData } from '@/hooks/use-dashboard-data';

export default function NodesPage() {
	const { snapshot, isLoading, error, selectedNodeId } = useDashboardData();

	if (isLoading && !snapshot) {
		return (
			<div className='flex flex-col gap-6 p-6'>
				<div className='flex flex-col gap-2'>
					<h1 className='text-2xl font-semibold tracking-tight'>Network Nodes</h1>
					<p className='text-sm text-muted-foreground'>
						Monitor and manage quantum processing nodes across the network
					</p>
				</div>
				<div className='text-sm text-muted-foreground'>Loading network data...</div>
			</div>
		);
	}

	if (error && !snapshot) {
		return (
			<div className='flex flex-col gap-6 p-6'>
				<div className='flex flex-col gap-2'>
					<h1 className='text-2xl font-semibold tracking-tight'>Network Nodes</h1>
					<p className='text-sm text-muted-foreground'>
						Monitor and manage quantum processing nodes across the network
					</p>
				</div>
				<div className='rounded-2xl border border-destructive/50 bg-destructive/10 p-4'>
					<p className='text-sm text-destructive'>{error}</p>
				</div>
			</div>
		);
	}

	if (!snapshot) {
		return null;
	}

	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Network Nodes</h1>
				<p className='text-sm text-muted-foreground'>
					Monitor and manage quantum processing nodes across the network
				</p>
			</div>

			<DashboardNetworkStats
				network={snapshot.network}
				health={snapshot.health}
				selectedNodeId={selectedNodeId}
			/>
		</div>
	);
}
