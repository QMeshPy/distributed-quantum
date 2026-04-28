import { DashboardNetwork3D } from '@/components/dashboard-network-3d';
import { DashboardNetworkStats } from '@/components/dashboard-network-stats';

export default function NetworkHealthPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Network Health</h1>
				<p className='text-sm text-muted-foreground'>
					Real-time monitoring of quantum network status and performance
				</p>
			</div>

			<div className='grid gap-6 md:grid-cols-2'>
				<DashboardNetworkStats />
				<DashboardNetwork3D />
			</div>
		</div>
	);
}
