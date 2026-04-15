export type DashboardBadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export type DashboardSummaryCard = {
	id: string;
	title: string;
	value: string;
	description: string;
	footnote: string;
	badge?: {
		label: string;
		variant: DashboardBadgeVariant;
	};
};

export type DashboardHealthSummary = {
	status: string;
	service: string;
	version: string;
	environment: string;
	uptimeSeconds: number;
	uptimeLabel: string;
};

export type DashboardNodeSnapshot = {
	nodeId: string;
	nodeLabel: string;
	averageFidelity: number;
	minFidelity: number;
	maxFidelity: number;
	availableServices: number;
	totalServices: number;
	minQubits: number;
	maxQubits: number;
	lastUpdated: string | null;
	lastUpdatedLabel: string;
};

export type DashboardNetworkGraphNodeStatus = 'healthy' | 'degraded' | 'offline';

export type DashboardNetworkGraphNodeKind = 'coordinator' | 'peer';

export type DashboardNetworkGraphNode = {
	id: string;
	nodeId: string | null;
	kind: DashboardNetworkGraphNodeKind;
	status: DashboardNetworkGraphNodeStatus;
	label: string;
	shortLabel: string;
	averageFidelity: number;
	availableServices: number;
	totalServices: number;
	minQubits: number;
	maxQubits: number;
	serviceTypes: string[];
	primaryAddress: string | null;
	lastUpdated: string | null;
	lastUpdatedLabel: string;
	color: string;
	val: number;
};

export type DashboardNetworkGraphLink = {
	id: string;
	source: string;
	target: string;
	kind: 'coordinator' | 'peer';
	color: string;
	availableServices: number;
	totalServices: number;
	serviceTypes: string[];
	width: number;
	particleSpeed: number;
};

export type DashboardNetworkSnapshot = {
	nodes: DashboardNetworkGraphNode[];
	links: DashboardNetworkGraphLink[];
	totalPeers: number;
	activePeers: number;
	totalServices: number;
	availableServices: number;
	averageFidelity: number;
	serviceTypes: string[];
	maxQubits: number;
};

export type DashboardChartMetricKey = 'averageFidelity' | 'availableServices' | 'maxQubits';

export type DashboardChartPoint = {
	nodeId: string;
	nodeLabel: string;
	averageFidelity: number;
	availableServices: number;
	totalServices: number;
	maxQubits: number;
};

export type DashboardServiceRow = {
	id: string;
	nodeId: string;
	nodeLabel: string;
	serviceType: string;
	availability: boolean;
	statusLabel: string;
	fidelity: number;
	fidelityLabel: string;
	qubitMin: number;
	qubitMax: number;
	qubitRangeLabel: string;
	listenAddrs: string[];
	primaryAddress: string | null;
	addressCount: number;
	updatedAt: string;
	updatedLabel: string;
	averageNodeFidelity: number | null;
};

export type DashboardSnapshot = {
	generatedAt: string;
	warnings: string[];
	health: DashboardHealthSummary | null;
	summaryCards: DashboardSummaryCard[];
	nodes: DashboardNodeSnapshot[];
	network: DashboardNetworkSnapshot;
	chart: DashboardChartPoint[];
	services: DashboardServiceRow[];
};

export type DashboardApiError = {
	error: string;
	details?: string;
};
