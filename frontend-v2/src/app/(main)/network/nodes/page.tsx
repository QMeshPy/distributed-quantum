import { DashboardNetworkStats } from '@/components/dashboard-network-stats';

export default function NodesPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Network Nodes</h1>
				<p className='text-sm text-muted-foreground'>
					Monitor and manage quantum processing nodes across the network
				</p>
			</div>

			<DashboardNetworkStats />
		</div>
	);
}
