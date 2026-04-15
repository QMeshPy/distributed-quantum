import type { BackendFidelityMetricsResponse, BackendHealthResponse, BackendServiceResponse } from '@/types/backend';
import type {
	DashboardNetworkGraphNodeStatus,
	DashboardNetworkSnapshot,
	DashboardNodeSnapshot,
	DashboardServiceRow,
	DashboardSnapshot,
	DashboardSummaryCard
} from '@/types/dashboard';

type BuildDashboardSnapshotInput = {
	generatedAt: string;
	health: BackendHealthResponse | null;
	services: BackendServiceResponse[];
	metrics: BackendFidelityMetricsResponse[];
	warnings?: string[];
};

const COORDINATOR_GRAPH_NODE_ID = 'coordinator';

function formatPercentage(value: number, fractionDigits = 2) {
	return `${(value * 100).toFixed(fractionDigits)}%`;
}

function formatCompactNumber(value: number) {
	return new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 0
	}).format(value);
}

function formatUptime(seconds: number) {
	if (seconds < 60) {
		return `${Math.max(0, Math.floor(seconds))}s`;
	}

	if (seconds < 3_600) {
		return `${Math.floor(seconds / 60)}m`;
	}

	if (seconds < 86_400) {
		return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`;
	}

	return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
}

function formatRelativeTime(isoValue: string | null, referenceDate: Date) {
	if (!isoValue) {
		return 'Unavailable';
	}

	const targetDate = new Date(isoValue);
	const diffMs = referenceDate.getTime() - targetDate.getTime();

	if (Number.isNaN(targetDate.getTime())) {
		return 'Unavailable';
	}

	const absDiffMs = Math.abs(diffMs);
	const suffix = diffMs >= 0 ? 'ago' : 'from now';

	if (absDiffMs < 60_000) {
		return `just now`;
	}

	if (absDiffMs < 3_600_000) {
		return `${Math.round(absDiffMs / 60_000)}m ${suffix}`;
	}

	if (absDiffMs < 86_400_000) {
		return `${Math.round(absDiffMs / 3_600_000)}h ${suffix}`;
	}

	return `${Math.round(absDiffMs / 86_400_000)}d ${suffix}`;
}

function formatNodeLabel(nodeId: string) {
	if (nodeId.length <= 18) {
		return nodeId;
	}

	return `${nodeId.slice(0, 8)}...${nodeId.slice(-6)}`;
}

function average(values: number[]) {
	if (!values.length) {
		return 0;
	}

	return values.reduce((total, value) => total + value, 0) / values.length;
}

function buildServicesByNodeId(services: BackendServiceResponse[]) {
	const servicesByNodeId = new Map<string, BackendServiceResponse[]>();

	for (const service of services) {
		const existingServices = servicesByNodeId.get(service.node_id) ?? [];
		existingServices.push(service);
		servicesByNodeId.set(service.node_id, existingServices);
	}

	return servicesByNodeId;
}

function getNetworkNodeStatus(availableServices: number, totalServices: number) {
	if (totalServices === 0 || availableServices === 0) {
		return 'offline' as const;
	}

	if (availableServices === totalServices) {
		return 'healthy' as const;
	}

	return 'degraded' as const;
}

function getNetworkNodeColor(status: 'healthy' | 'degraded' | 'offline', kind: 'coordinator' | 'peer' = 'peer') {
	if (kind === 'coordinator') {
		return status === 'offline' ? '#64748b' : '#f97316';
	}

	switch (status) {
		case 'healthy':
			return '#14b8a6';
		case 'degraded':
			return '#f59e0b';
		default:
			return '#94a3b8';
	}
}

function buildNodeSnapshots(
	services: BackendServiceResponse[],
	metrics: BackendFidelityMetricsResponse[],
	referenceDate: Date
) {
	const metricsByNodeId = new Map(metrics.map(metric => [metric.node_id, metric]));
	const servicesByNodeId = buildServicesByNodeId(services);

	const nodes: DashboardNodeSnapshot[] = Array.from(servicesByNodeId.entries()).map(([nodeId, nodeServices]) => {
		const nodeMetric = metricsByNodeId.get(nodeId);
		const serviceFidelities = nodeServices.map(service => service.fidelity);
		const lastUpdated =
			nodeServices
				.map(service => service.updated_at)
				.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;

		return {
			nodeId,
			nodeLabel: formatNodeLabel(nodeId),
			averageFidelity: nodeMetric?.average_fidelity ?? average(serviceFidelities),
			minFidelity: nodeMetric?.min_fidelity ?? Math.min(...serviceFidelities),
			maxFidelity: nodeMetric?.max_fidelity ?? Math.max(...serviceFidelities),
			availableServices: nodeServices.filter(service => service.availability).length,
			totalServices: nodeServices.length,
			minQubits: Math.min(...nodeServices.map(service => service.qubit_min)),
			maxQubits: Math.max(...nodeServices.map(service => service.qubit_max)),
			lastUpdated,
			lastUpdatedLabel: formatRelativeTime(lastUpdated, referenceDate)
		};
	});

	return nodes.sort((left, right) => {
		if (right.availableServices !== left.availableServices) {
			return right.availableServices - left.availableServices;
		}

		if (right.averageFidelity !== left.averageFidelity) {
			return right.averageFidelity - left.averageFidelity;
		}

		return left.nodeId.localeCompare(right.nodeId);
	});
}

function buildSummaryCards(
	nodes: DashboardNodeSnapshot[],
	services: BackendServiceResponse[],
	health: BackendHealthResponse | null
): DashboardSummaryCard[] {
	const healthyNodes = nodes.filter(node => node.availableServices > 0).length;
	const availableServices = services.filter(service => service.availability).length;
	const serviceTypes = new Set(services.map(service => service.service_type));
	const networkAverageFidelity = average(nodes.map(node => node.averageFidelity));
	const bestNode = [...nodes].sort((left, right) => right.averageFidelity - left.averageFidelity)[0];
	const qubitCeiling = services.length ? Math.max(...services.map(service => service.qubit_max)) : 0;

	return [
		{
			id: 'nodes',
			title: 'Nodes reporting',
			value: formatCompactNumber(nodes.length),
			description: `${healthyNodes} nodes still advertise at least one available service.`,
			footnote: nodes.length
				? `${nodes.filter(node => node.availableServices === node.totalServices).length} fully healthy nodes in the mesh.`
				: 'No nodes have reported into the registry yet.',
			badge: {
				label: `${healthyNodes}/${Math.max(nodes.length, 1)} healthy`,
				variant: healthyNodes === nodes.length && nodes.length > 0 ? 'secondary' : 'outline'
			}
		},
		{
			id: 'services',
			title: 'Advertised services',
			value: formatCompactNumber(services.length),
			description: `${availableServices} services are schedulable across ${serviceTypes.size} gate types.`,
			footnote: services.length
				? `Network qubit ceiling is ${qubitCeiling}.`
				: 'Waiting for service advertisements.',
			badge: {
				label: `${availableServices} available`,
				variant: availableServices === services.length && services.length > 0 ? 'secondary' : 'outline'
			}
		},
		{
			id: 'fidelity',
			title: 'Mean fidelity',
			value: formatPercentage(networkAverageFidelity),
			description: nodes.length
				? `Averaged across ${nodes.length} nodes with live fidelity samples.`
				: 'No fidelity samples available yet.',
			footnote: bestNode
				? `Best node right now is ${bestNode.nodeLabel} at ${formatPercentage(bestNode.averageFidelity)}.`
				: 'No node has reported fidelity metrics yet.',
			badge: bestNode
				? {
						label: formatPercentage(bestNode.averageFidelity),
						variant: 'secondary'
					}
				: undefined
		},
		{
			id: 'coordinator',
			title: 'Coordinator',
			value: health ? health.status.toUpperCase() : 'DOWN',
			description: health
				? `${health.service} is running in ${health.environment}.`
				: 'The frontend route could not reach the backend health endpoint.',
			footnote: health
				? `Uptime ${formatUptime(health.uptime_seconds)}.`
				: 'Check QUANTUM_BACKEND_URL and auth settings.',
			badge: health
				? {
						label: `v${health.version}`,
						variant: health.status === 'ok' ? 'secondary' : 'outline'
					}
				: {
						label: 'offline',
						variant: 'destructive'
					}
		}
	];
}

function buildNetworkSnapshot({
	generatedAt,
	health,
	nodes,
	services,
	referenceDate
}: {
	generatedAt: string;
	health: BackendHealthResponse | null;
	nodes: DashboardNodeSnapshot[];
	services: BackendServiceResponse[];
	referenceDate: Date;
}): DashboardNetworkSnapshot {
	const servicesByNodeId = buildServicesByNodeId(services);
	const serviceTypes = [...new Set(services.map(service => service.service_type))].sort((left, right) =>
		left.localeCompare(right)
	);
	const availableServices = services.filter(service => service.availability).length;
	const averageFidelity = average(nodes.map(node => node.averageFidelity));
	const maxQubits = services.length ? Math.max(...services.map(service => service.qubit_max)) : 0;

	const peerNodes = nodes.map(node => {
		const nodeServices = servicesByNodeId.get(node.nodeId) ?? [];
		const nodeServiceTypes = [...new Set(nodeServices.map(service => service.service_type))].sort((left, right) =>
			left.localeCompare(right)
		);
		const primaryAddress = nodeServices.flatMap(service => service.listen_addrs).find(Boolean) ?? null;
		const status = getNetworkNodeStatus(node.availableServices, node.totalServices);

		return {
			id: node.nodeId,
			nodeId: node.nodeId,
			kind: 'peer' as const,
			status,
			label: node.nodeId,
			shortLabel: node.nodeLabel,
			averageFidelity: node.averageFidelity,
			availableServices: node.availableServices,
			totalServices: node.totalServices,
			minQubits: node.minQubits,
			maxQubits: node.maxQubits,
			serviceTypes: nodeServiceTypes,
			primaryAddress,
			lastUpdated: node.lastUpdated,
			lastUpdatedLabel: node.lastUpdatedLabel,
			color: getNetworkNodeColor(status),
			val: Number(
				(4 + node.availableServices * 1.2 + node.averageFidelity * 6 + node.maxQubits * 0.12).toFixed(2)
			)
		};
	});

	const coordinatorStatus: DashboardNetworkGraphNodeStatus =
		health?.status === 'ok'
			? 'healthy'
			: peerNodes.some(node => node.availableServices > 0)
				? 'degraded'
				: 'offline';
	const coordinatorNode = {
		id: COORDINATOR_GRAPH_NODE_ID,
		nodeId: null,
		kind: 'coordinator' as const,
		status: coordinatorStatus,
		label: health?.service ?? 'Coordinator',
		shortLabel: 'Coord',
		averageFidelity,
		availableServices,
		totalServices: services.length,
		minQubits: 0,
		maxQubits,
		serviceTypes,
		primaryAddress: null,
		lastUpdated: health ? generatedAt : null,
		lastUpdatedLabel: health ? formatRelativeTime(generatedAt, referenceDate) : 'Unavailable',
		color: getNetworkNodeColor(coordinatorStatus, 'coordinator'),
		val: Number((6 + Math.max(nodes.length, 1) * 0.8).toFixed(2))
	};

	const coordinatorLinks = peerNodes.map(node => ({
		id: `${COORDINATOR_GRAPH_NODE_ID}:${node.id}`,
		source: COORDINATOR_GRAPH_NODE_ID,
		target: node.id,
		kind: 'coordinator' as const,
		color: node.color,
		availableServices: node.availableServices,
		totalServices: node.totalServices,
		serviceTypes: node.serviceTypes,
		width: Number((1.2 + node.availableServices * 0.45).toFixed(2)),
		particleSpeed: Number((0.0035 + Math.min(node.availableServices, 4) * 0.0012).toFixed(4))
	}));

	const peerLinks = peerNodes.flatMap((sourceNode, sourceIndex) => {
		return peerNodes.slice(sourceIndex + 1).flatMap(targetNode => {
			const sharedServiceTypes = sourceNode.serviceTypes.filter(serviceType =>
				targetNode.serviceTypes.includes(serviceType)
			);
			if (sharedServiceTypes.length === 0) {
				return [];
			}

			const sharedAvailableServices = Math.min(sourceNode.availableServices, targetNode.availableServices);
			const totalServiceCapacity = Math.min(sourceNode.totalServices, targetNode.totalServices);
			const linkWidth = Number((1 + sharedServiceTypes.length * 0.35 + sharedAvailableServices * 0.1).toFixed(2));
			const particleSpeed = Number((0.0028 + Math.min(sharedServiceTypes.length, 5) * 0.0007).toFixed(4));

			return [
				{
					id: `peer:${sourceNode.id}:${targetNode.id}`,
					source: sourceNode.id,
					target: targetNode.id,
					kind: 'peer' as const,
					color: '#7c3aed',
					availableServices: sharedAvailableServices,
					totalServices: totalServiceCapacity,
					serviceTypes: sharedServiceTypes,
					width: linkWidth,
					particleSpeed
				}
			];
		});
	});

	return {
		nodes: [coordinatorNode, ...peerNodes],
		links: [...coordinatorLinks, ...peerLinks],
		totalPeers: nodes.length,
		activePeers: nodes.filter(node => node.availableServices > 0).length,
		totalServices: services.length,
		availableServices,
		averageFidelity,
		serviceTypes,
		maxQubits
	};
}

export function buildDashboardSnapshot({
	generatedAt,
	health,
	services,
	metrics,
	warnings = []
}: BuildDashboardSnapshotInput): DashboardSnapshot {
	const referenceDate = new Date(generatedAt);
	const nodes = buildNodeSnapshots(services, metrics, referenceDate);
	const metricsByNodeId = new Map(metrics.map(metric => [metric.node_id, metric]));
	const derivedWarnings = [...warnings];

	if (!services.length) {
		derivedWarnings.push(
			'The backend returned zero advertised services, so the dashboard is showing an empty network snapshot.'
		);
	}

	const sortedServices = [...services].sort((left, right) => {
		if (left.availability !== right.availability) {
			return left.availability ? -1 : 1;
		}

		if (right.fidelity !== left.fidelity) {
			return right.fidelity - left.fidelity;
		}

		return `${left.node_id}-${left.service_type}`.localeCompare(`${right.node_id}-${right.service_type}`);
	});

	const serviceRows: DashboardServiceRow[] = sortedServices.map(service => {
		const nodeMetric = metricsByNodeId.get(service.node_id);

		return {
			id: `${service.node_id}:${service.service_type}`,
			nodeId: service.node_id,
			nodeLabel: formatNodeLabel(service.node_id),
			serviceType: service.service_type,
			availability: service.availability,
			statusLabel: service.availability ? 'Available' : 'Unavailable',
			fidelity: service.fidelity,
			fidelityLabel: formatPercentage(service.fidelity),
			qubitMin: service.qubit_min,
			qubitMax: service.qubit_max,
			qubitRangeLabel: `${service.qubit_min}-${service.qubit_max} qubits`,
			listenAddrs: service.listen_addrs,
			primaryAddress: service.listen_addrs[0] ?? null,
			addressCount: service.listen_addrs.length,
			updatedAt: service.updated_at,
			updatedLabel: formatRelativeTime(service.updated_at, referenceDate),
			averageNodeFidelity: nodeMetric?.average_fidelity ?? null
		};
	});

	return {
		generatedAt,
		warnings: derivedWarnings,
		health: health
			? {
					status: health.status,
					service: health.service,
					version: health.version,
					environment: health.environment,
					uptimeSeconds: health.uptime_seconds,
					uptimeLabel: formatUptime(health.uptime_seconds)
				}
			: null,
		summaryCards: buildSummaryCards(nodes, services, health),
		nodes,
		network: buildNetworkSnapshot({
			generatedAt,
			health,
			nodes,
			services,
			referenceDate
		}),
		chart: nodes.map(node => ({
			nodeId: node.nodeId,
			nodeLabel: node.nodeLabel,
			averageFidelity: Number((node.averageFidelity * 100).toFixed(2)),
			availableServices: node.availableServices,
			totalServices: node.totalServices,
			maxQubits: node.maxQubits
		})),
		services: serviceRows
	};
}
