'use client';

import { DashboardNetwork3D } from '@/components/dashboard-network-3d';
import { useDashboardData } from '@/hooks/use-dashboard-data';

export default function DAGViewPage() {
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
					<h1 className='text-2xl font-semibold tracking-tight'>DAG View</h1>
					<p className='text-sm text-muted-foreground'>
						Directed acyclic graph visualization of quantum circuit execution flow
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
					<h1 className='text-2xl font-semibold tracking-tight'>DAG View</h1>
					<p className='text-sm text-muted-foreground'>
						Directed acyclic graph visualization of quantum circuit execution flow
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
				<h1 className='text-2xl font-semibold tracking-tight'>DAG View</h1>
				<p className='text-sm text-muted-foreground'>
					Directed acyclic graph visualization of quantum circuit execution flow
				</p>
			</div>

			<DashboardNetwork3D
				network={snapshot.network}
				selectedNodeId={selectedNodeId}
				onSelectNode={handleSelectNode}
			/>
		</div>
	);
}
