'use client';

import type { DashboardHealthSummary, DashboardNetworkGraphNode, DashboardNetworkSnapshot } from '@/types/dashboard';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type DashboardNetworkStatsProps = {
	network: DashboardNetworkSnapshot | null;
	health: DashboardHealthSummary | null;
	selectedNodeId: string | null;
	isLoading?: boolean;
};

function formatRatioAsPercent(value: number) {
	return `${(value * 100).toFixed(2)}%`;
}

function getStatusBadgeVariant(status: DashboardNetworkGraphNode['status']) {
	switch (status) {
		case 'healthy':
			return 'secondary' as const;
		case 'degraded':
			return 'outline' as const;
		default:
			return 'destructive' as const;
	}
}

export function DashboardNetworkStats({
	network,
	health,
	selectedNodeId,
	isLoading = false
}: DashboardNetworkStatsProps) {
	if (isLoading) {
		return (
			<div className='grid gap-4 auto-rows-fr'>
				{Array.from({ length: 3 }, (_, index) => (
					<Card
						key={index}
						size='sm'
					>
						<CardHeader>
							<Skeleton className='h-4 w-24' />
							<Skeleton className='h-8 w-28' />
							<CardAction>
								<Skeleton className='h-5 w-16 rounded-full' />
							</CardAction>
						</CardHeader>
						<CardFooter className='flex-col items-start gap-1.5 text-sm'>
							<Skeleton className='h-4 w-full max-w-40' />
							<Skeleton className='h-4 w-full max-w-56' />
						</CardFooter>
					</Card>
				))}
			</div>
		);
	}

	const selectedNode = network?.nodes.find(node => node.kind === 'peer' && node.nodeId === selectedNodeId) ?? null;
	const serviceTypesLabel = network?.serviceTypes.length ? network.serviceTypes.join(' · ') : 'No service types advertised yet.';

	if (selectedNode) {
		return (
			<div className='grid gap-4 auto-rows-fr'>
				<Card
					size='sm'
					className='bg-gradient-to-br from-card via-card to-primary/10'
				>
					<CardHeader>
						<CardDescription>Focused peer</CardDescription>
						<CardTitle className='text-2xl font-semibold'>{selectedNode.shortLabel}</CardTitle>
						<CardAction>
							<Badge variant={getStatusBadgeVariant(selectedNode.status)}>{selectedNode.status}</Badge>
						</CardAction>
					</CardHeader>
					<CardFooter className='flex-col items-start gap-1.5 text-sm'>
						<div className='font-medium'>{selectedNode.label}</div>
						<div className='text-muted-foreground'>
							{selectedNode.availableServices}/{selectedNode.totalServices} services live · {selectedNode.lastUpdatedLabel}
						</div>
					</CardFooter>
				</Card>

				<Card
					size='sm'
					className='bg-gradient-to-br from-card via-card to-secondary'
				>
					<CardHeader>
						<CardDescription>Capabilities</CardDescription>
						<CardTitle className='text-2xl font-semibold'>{selectedNode.serviceTypes.length}</CardTitle>
						<CardAction>
							<Badge variant='outline'>{selectedNode.maxQubits}q max</Badge>
						</CardAction>
					</CardHeader>
					<CardFooter className='flex-col items-start gap-1.5 text-sm'>
						<div className='font-medium'>
							{selectedNode.minQubits}-{selectedNode.maxQubits} qubit span
						</div>
						<div className='text-muted-foreground'>
							{selectedNode.serviceTypes.length ? selectedNode.serviceTypes.join(' · ') : 'No gate types reported.'}
						</div>
					</CardFooter>
				</Card>

				<Card
					size='sm'
					className='bg-gradient-to-br from-card via-card to-accent'
				>
					<CardHeader>
						<CardDescription>Mean fidelity</CardDescription>
						<CardTitle className='text-2xl font-semibold'>
							{selectedNode.totalServices > 0 ? formatRatioAsPercent(selectedNode.averageFidelity) : '—'}
						</CardTitle>
						<CardAction>
							<Badge variant='secondary'>{selectedNode.status}</Badge>
						</CardAction>
					</CardHeader>
					<CardFooter className='flex-col items-start gap-1.5 text-sm'>
						<div className='font-medium'>Average across this peer&apos;s advertised services.</div>
						<div className='text-muted-foreground'>
							{selectedNode.primaryAddress ?? 'No listen address reported by the backend.'}
						</div>
					</CardFooter>
				</Card>
			</div>
		);
	}

	return (
		<div className='grid gap-4 auto-rows-fr'>
			<Card
				size='sm'
				className='bg-gradient-to-br from-card via-card to-primary/10'
			>
				<CardHeader>
					<CardDescription>Live peers</CardDescription>
					<CardTitle className='text-2xl font-semibold'>
						{network ? `${network.activePeers}/${network.totalPeers}` : '0/0'}
					</CardTitle>
					<CardAction>
						<Badge variant='outline'>{network?.totalServices ?? 0} services</Badge>
					</CardAction>
				</CardHeader>
				<CardFooter className='flex-col items-start gap-1.5 text-sm'>
					<div className='font-medium'>Peers with at least one schedulable service right now.</div>
					<div className='text-muted-foreground'>
						{network ? `${network.totalPeers - network.activePeers} peers are currently unavailable.` : 'Waiting for network data.'}
					</div>
				</CardFooter>
			</Card>

			<Card
				size='sm'
				className='bg-gradient-to-br from-card via-card to-secondary'
			>
				<CardHeader>
					<CardDescription>Capability mix</CardDescription>
					<CardTitle className='text-2xl font-semibold'>{network?.serviceTypes.length ?? 0}</CardTitle>
					<CardAction>
						<Badge variant='outline'>{network?.maxQubits ?? 0}q ceiling</Badge>
					</CardAction>
				</CardHeader>
				<CardFooter className='flex-col items-start gap-1.5 text-sm'>
					<div className='font-medium'>Distinct gate services visible in the live registry snapshot.</div>
					<div className='text-muted-foreground'>{serviceTypesLabel}</div>
				</CardFooter>
			</Card>

			<Card
				size='sm'
				className='bg-gradient-to-br from-card via-card to-accent'
			>
				<CardHeader>
					<CardDescription>Network fidelity</CardDescription>
					<CardTitle className='text-2xl font-semibold'>
						{network && network.totalPeers > 0 ? formatRatioAsPercent(network.averageFidelity) : '—'}
					</CardTitle>
					<CardAction>
						<Badge variant={health?.status === 'ok' ? 'secondary' : 'destructive'}>
							{health ? health.environment : 'offline'}
						</Badge>
					</CardAction>
				</CardHeader>
				<CardFooter className='flex-col items-start gap-1.5 text-sm'>
					<div className='font-medium'>Average fidelity across peers in the current dashboard snapshot.</div>
					<div className='text-muted-foreground'>
						{health ? `Coordinator ${health.status.toUpperCase()} · uptime ${health.uptimeLabel}.` : 'Coordinator health metadata is unavailable.'}
					</div>
				</CardFooter>
			</Card>
		</div>
	);
}
