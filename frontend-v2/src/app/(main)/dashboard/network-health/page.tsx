'use client';

import { DashboardNetwork3D } from '@/components/dashboard-network-3d';
import { DashboardNetworkStats } from '@/components/dashboard-network-stats';
import { useDashboardData } from '@/hooks/use-dashboard-data';

export default function NetworkHealthPage() {
	const { snapshot, isLoading, error, selectedNodeId, selectNode, clearSelectedNode } = useDashboardData();

	const handleSelectNode = (nodeId: string | null) => {
		if (nodeId === null) {
			clearSelectedNode();
		} else {
			selectNode(nodeId);
		}
	};

	if (isLoading && !snapshot) {
		return (
			<div className='flex flex-col gap-6 p-6'>
				<div className='flex flex-col gap-2'>
					<h1 className='text-2xl font-semibold tracking-tight'>Network Health</h1>
					<p className='text-sm text-muted-foreground'>
						Real-time monitoring of quantum network status and performance
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
					<h1 className='text-2xl font-semibold tracking-tight'>Network Health</h1>
					<p className='text-sm text-muted-foreground'>
						Real-time monitoring of quantum network status and performance
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
				<h1 className='text-2xl font-semibold tracking-tight'>Network Health</h1>
				<p className='text-sm text-muted-foreground'>
					Real-time monitoring of quantum network status and performance
				</p>
			</div>

			<div className='grid gap-6 md:grid-cols-2'>
				<DashboardNetworkStats
					network={snapshot.network}
					health={snapshot.health}
					selectedNodeId={selectedNodeId}
				/>
				<DashboardNetwork3D
					network={snapshot.network}
					selectedNodeId={selectedNodeId}
					onSelectNode={handleSelectNode}
				/>
			</div>
		</div>
	);
}
