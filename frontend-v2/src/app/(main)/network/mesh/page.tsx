import { DashboardNetwork3D } from '@/components/dashboard-network-3d';
import { DashboardNetworkStats } from '@/components/dashboard-network-stats';

export default function ServiceMeshPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Service Mesh</h1>
				<p className='text-sm text-muted-foreground'>
					Real-time 3D visualization of the distributed quantum network topology
				</p>
			</div>

			<div className='grid gap-6 md:grid-cols-2'>
				<DashboardNetworkStats />
				<DashboardNetwork3D />
			</div>
		</div>
	);
}
