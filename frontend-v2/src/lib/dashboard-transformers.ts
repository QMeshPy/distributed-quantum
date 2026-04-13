import type { BackendFidelityMetricsResponse, BackendHealthResponse, BackendServiceResponse } from '@/types/backend';
import type {
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

function buildNodeSnapshots(
	services: BackendServiceResponse[],
	metrics: BackendFidelityMetricsResponse[],
	referenceDate: Date
) {
	const metricsByNodeId = new Map(metrics.map(metric => [metric.node_id, metric]));
	const servicesByNodeId = new Map<string, BackendServiceResponse[]>();

	for (const service of services) {
		const existingServices = servicesByNodeId.get(service.node_id) ?? [];
		existingServices.push(service);
		servicesByNodeId.set(service.node_id, existingServices);
	}

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
