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
	chart: DashboardChartPoint[];
	services: DashboardServiceRow[];
};

export type DashboardApiError = {
	error: string;
	details?: string;
};
