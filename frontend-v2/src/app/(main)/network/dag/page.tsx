import { DashboardNetwork3D } from '@/components/dashboard-network-3d';

export default function DAGViewPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>DAG View</h1>
				<p className='text-sm text-muted-foreground'>
					Directed acyclic graph visualization of quantum circuit execution flow
				</p>
			</div>

			<DashboardNetwork3D />
		</div>
	);
}
