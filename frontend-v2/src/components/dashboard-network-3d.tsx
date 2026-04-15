'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { GitBranchIcon, RefreshCcwIcon } from 'lucide-react';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-3d';
import type ForceGraph3DComponent from 'react-force-graph-3d';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardNetworkGraphLink, DashboardNetworkGraphNode, DashboardNetworkSnapshot } from '@/types/dashboard';

type DashboardNetwork3DProps = {
	network: DashboardNetworkSnapshot | null;
	isLoading?: boolean;
	selectedNodeId: string | null;
	onSelectNode: (nodeId: string | null) => void;
};

type GraphNode = DashboardNetworkGraphNode & NodeObject;

type GraphLink = Omit<DashboardNetworkGraphLink, 'source' | 'target'> &
	LinkObject<GraphNode> & {
		source: string | GraphNode;
		target: string | GraphNode;
	};

type GraphData = {
	nodes: GraphNode[];
	links: GraphLink[];
};

const ForceGraph3D = dynamic(() => import('react-force-graph-3d').then(mod => mod.default), {
	ssr: false
}) as typeof ForceGraph3DComponent;

type OrbitControlsLike = {
	autoRotate?: boolean;
	autoRotateSpeed?: number;
	dampingFactor?: number;
	enableDamping?: boolean;
	maxDistance?: number;
	minDistance?: number;
	panSpeed?: number;
	rotateSpeed?: number;
	zoomSpeed?: number;
};

const CANVAS_HEIGHT_CLASS = 'h-[420px] w-full sm:h-[480px] xl:h-[540px]';

/** Tighter padding in px so zoomToFit fills more of the WebGL canvas (smaller = larger on-screen graph). */
function graphZoomPaddingPx(width: number, height: number) {
	const m = Math.min(width, height);
	return Math.max(8, Math.round(m * 0.018));
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/** Spread simulation in graph units so node layout scales with the visible canvas. */
function graphLinkDistance(width: number, height: number) {
	const m = Math.min(width, height);
	return Math.round(clamp(m * 0.32, 88, 320));
}

function graphChargeStrength(width: number, height: number) {
	const m = Math.min(width, height);
	return -Math.round(clamp(m * 0.52, 160, 420));
}

function graphCameraScale(width: number, height: number) {
	const m = Math.min(width, height);
	return clamp(m / 420, 0.72, 1.55);
}

function graphNodeRelSize(width: number, height: number) {
	const m = Math.min(width, height);
	return clamp(m / 54, 5.5, 16);
}

type ThemePalette = {
	primary: string;
	chart2: string;
	mutedForeground: string;
	card: string;
	background: string;
	foreground: string;
	border: string;
};

const DEFAULT_THEME_PALETTE: ThemePalette = {
	primary: '#7c3aed',
	chart2: '#f59e0b',
	mutedForeground: '#71717a',
	card: '#ffffff',
	background: '#f8fafc',
	foreground: '#18181b',
	border: '#e4e4e7'
};

function formatRatioAsPercent(value: number) {
	return `${(value * 100).toFixed(2)}%`;
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function resolveGraphNodeId(target: string | number | GraphNode | undefined) {
	if (typeof target === 'object' && target !== null) {
		return String(target.id ?? '');
	}

	return typeof target === 'undefined' ? '' : String(target);
}

function normalizeHex(value: string) {
	if (value.length === 4) {
		return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
	}

	return value.toLowerCase();
}

function rgbToHex(value: string) {
	const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
	if (!match) {
		return null;
	}

	const [, red, green, blue] = match;
	return `#${[red, green, blue]
		.map(channel => Number(channel).toString(16).padStart(2, '0'))
		.join('')}`.toLowerCase();
}

function resolveCssColor(value: string, fallback: string) {
	const normalizedValue = value.trim();
	if (!normalizedValue) {
		return fallback;
	}

	if (normalizedValue.startsWith('#')) {
		return normalizeHex(normalizedValue);
	}

	if (normalizedValue.startsWith('rgb')) {
		return rgbToHex(normalizedValue) ?? fallback;
	}

	if (typeof document === 'undefined') {
		return fallback;
	}

	const probe = document.createElement('span');
	probe.style.color = fallback;
	probe.style.color = normalizedValue;
	document.body.appendChild(probe);
	const resolvedColor = getComputedStyle(probe).color;
	probe.remove();
	return rgbToHex(resolvedColor) ?? fallback;
}

function hexToRgbParts(value: string) {
	const normalized = normalizeHex(value).replace('#', '');
	return {
		red: Number.parseInt(normalized.slice(0, 2), 16),
		green: Number.parseInt(normalized.slice(2, 4), 16),
		blue: Number.parseInt(normalized.slice(4, 6), 16)
	};
}

function mixHex(base: string, overlay: string, overlayWeight = 0.25) {
	const baseRgb = hexToRgbParts(base);
	const overlayRgb = hexToRgbParts(overlay);
	const mixChannel = (left: number, right: number) =>
		Math.round(left * (1 - overlayWeight) + right * overlayWeight)
			.toString(16)
			.padStart(2, '0');

	return `#${mixChannel(baseRgb.red, overlayRgb.red)}${mixChannel(baseRgb.green, overlayRgb.green)}${mixChannel(baseRgb.blue, overlayRgb.blue)}`;
}

function hexToRgba(value: string, alpha: number) {
	const { red, green, blue } = hexToRgbParts(value);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function readThemePalette() {
	if (typeof window === 'undefined') {
		return DEFAULT_THEME_PALETTE;
	}

	const styles = getComputedStyle(document.documentElement);
	return {
		primary: resolveCssColor(styles.getPropertyValue('--primary'), DEFAULT_THEME_PALETTE.primary),
		chart2: resolveCssColor(styles.getPropertyValue('--chart-2'), DEFAULT_THEME_PALETTE.chart2),
		mutedForeground: resolveCssColor(
			styles.getPropertyValue('--muted-foreground'),
			DEFAULT_THEME_PALETTE.mutedForeground
		),
		card: resolveCssColor(styles.getPropertyValue('--card'), DEFAULT_THEME_PALETTE.card),
		background: resolveCssColor(styles.getPropertyValue('--background'), DEFAULT_THEME_PALETTE.background),
		foreground: resolveCssColor(styles.getPropertyValue('--foreground'), DEFAULT_THEME_PALETTE.foreground),
		border: resolveCssColor(styles.getPropertyValue('--border'), DEFAULT_THEME_PALETTE.border)
	};
}

function buildNodeTooltip(node: GraphNode, palette: ThemePalette) {
	const title = escapeHtml(node.kind === 'coordinator' ? node.label : node.shortLabel);
	const subtitle = escapeHtml(node.kind === 'coordinator' ? 'Coordinator snapshot' : node.label);
	const servicesLabel =
		node.totalServices > 0
			? `${node.availableServices}/${node.totalServices} services available`
			: 'No services advertised';
	const serviceTypesLabel = node.serviceTypes.length ? node.serviceTypes.join(', ') : 'No capabilities reported';
	const qubitLabel =
		node.maxQubits > 0 ? `${node.minQubits}-${node.maxQubits} qubit range` : 'Qubit range unavailable';
	const fidelityLabel = node.totalServices > 0 ? formatRatioAsPercent(node.averageFidelity) : 'Unavailable';
	const tooltipSurface = mixHex(palette.card, palette.background, 0.35);

	return `
		<div style="min-width:220px;border-radius:16px;border:1px solid ${palette.border};background:${hexToRgba(tooltipSurface, 0.96)};padding:12px 14px;color:${palette.foreground};box-shadow:0 10px 30px ${hexToRgba(palette.foreground, 0.12)};backdrop-filter:blur(12px);">
			<div style="font-size:13px;font-weight:700;letter-spacing:0.01em;">${title}</div>
			<div style="margin-top:3px;font-size:11px;opacity:0.72;">${escapeHtml(subtitle)}</div>
			<div style="margin-top:10px;font-size:12px;line-height:1.5;">
				<div><strong>Status:</strong> ${escapeHtml(node.status)}</div>
				<div><strong>Fidelity:</strong> ${escapeHtml(fidelityLabel)}</div>
				<div><strong>Capacity:</strong> ${escapeHtml(qubitLabel)}</div>
				<div><strong>Services:</strong> ${escapeHtml(servicesLabel)}</div>
				<div><strong>Gate types:</strong> ${escapeHtml(serviceTypesLabel)}</div>
			</div>
		</div>
	`;
}

function buildLinkTooltip(link: GraphLink, palette: ThemePalette) {
	const sourceNodeId = resolveGraphNodeId(link.source);
	const targetNodeId = resolveGraphNodeId(link.target);
	const capabilityLabel = link.serviceTypes.length ? link.serviceTypes.join(', ') : 'No service types reported';
	const tooltipSurface = mixHex(palette.card, palette.background, 0.35);
	const linkTitle = link.kind === 'peer' ? 'Peer-to-peer capability overlap' : 'Coordinator reachability';
	const endpointLabel = link.kind === 'peer' ? `${sourceNodeId} ↔ ${targetNodeId}` : targetNodeId;
	const servicesLabel =
		link.kind === 'peer'
			? `${link.availableServices}/${link.totalServices} shared live services`
			: `${link.availableServices}/${link.totalServices} live services`;

	return `
		<div style="min-width:220px;border-radius:16px;border:1px solid ${palette.border};background:${hexToRgba(tooltipSurface, 0.96)};padding:12px 14px;color:${palette.foreground};box-shadow:0 10px 30px ${hexToRgba(palette.foreground, 0.12)};backdrop-filter:blur(12px);">
			<div style="font-size:13px;font-weight:700;letter-spacing:0.01em;">${escapeHtml(linkTitle)}</div>
			<div style="margin-top:3px;font-size:11px;opacity:0.72;">${escapeHtml(endpointLabel)}</div>
			<div style="margin-top:10px;font-size:12px;line-height:1.5;">
				<div><strong>Live services:</strong> ${escapeHtml(servicesLabel)}</div>
				<div><strong>Gate types:</strong> ${escapeHtml(capabilityLabel)}</div>
			</div>
		</div>
	`;
}

function isLinkActive(link: GraphLink, selectedNodeId: string | null, hoveredLinkId: string | null) {
	if (hoveredLinkId && link.id === hoveredLinkId) {
		return true;
	}

	if (selectedNodeId === null) {
		return false;
	}

	const sourceNodeId = resolveGraphNodeId(link.source);
	const targetNodeId = resolveGraphNodeId(link.target);
	return sourceNodeId === selectedNodeId || targetNodeId === selectedNodeId;
}

function isNodeActive(
	node: GraphNode,
	selectedNodeId: string | null,
	hoveredNodeId: string | null,
	hoveredLink: GraphLink | null
) {
	if (hoveredNodeId && node.id === hoveredNodeId) {
		return true;
	}

	if (selectedNodeId && node.nodeId === selectedNodeId) {
		return true;
	}

	if (!hoveredLink) {
		return false;
	}

	const sourceId = resolveGraphNodeId(hoveredLink.source);
	const targetId = resolveGraphNodeId(hoveredLink.target);
	return node.id === sourceId || node.id === targetId;
}

function findGraphNodeByPeerId(nodes: readonly GraphNode[], nodeId: string | null) {
	if (!nodeId) {
		return null;
	}

	return nodes.find(node => node.nodeId === nodeId) ?? null;
}

export function DashboardNetwork3D({
	network,
	isLoading = false,
	selectedNodeId,
	onSelectNode
}: DashboardNetwork3DProps) {
	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const graphRef = React.useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
	const autoRotateTimerRef = React.useRef<number | null>(null);
	const initialFitFrameRef = React.useRef<number | null>(null);
	const hasInitialFitRef = React.useRef(false);
	const engineBootstrappedRef = React.useRef(false);
	const deferredGraphDataRef = React.useRef<GraphData>({ nodes: [], links: [] });
	const canvasMetricsRef = React.useRef({ width: 0, height: 0 });

	const [hasMounted, setHasMounted] = React.useState(false);
	const [graphReady, setGraphReady] = React.useState(false);
	const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
	const [hoveredLinkId, setHoveredLinkId] = React.useState<string | null>(null);
	const [isInteracting, setIsInteracting] = React.useState(false);
	const [canvasSize, setCanvasSize] = React.useState({
		width: 0,
		height: 0
	});
	const [themePalette, setThemePalette] = React.useState<ThemePalette>(DEFAULT_THEME_PALETTE);

	const selectedNode = React.useMemo(
		() => network?.nodes.find(node => node.kind === 'peer' && node.nodeId === selectedNodeId) ?? null,
		[network, selectedNodeId]
	);

	const graphData = React.useMemo<GraphData>(
		() => ({
			nodes: network?.nodes.map(node => ({ ...node })) ?? [],
			links: network?.links.map(link => ({ ...link })) ?? []
		}),
		[network]
	);
	const deferredGraphData = React.useDeferredValue(graphData);
	const hoveredLink = React.useMemo(
		() => deferredGraphData.links.find(link => link.id === hoveredLinkId) ?? null,
		[deferredGraphData.links, hoveredLinkId]
	);
	const graphPalette = React.useMemo(
		() => ({
			coordinator: themePalette.primary,
			healthy: mixHex(themePalette.primary, themePalette.card, 0.22),
			degraded: mixHex(themePalette.chart2, themePalette.card, 0.08),
			offline: mixHex(themePalette.mutedForeground, themePalette.card, 0.14),
			active: themePalette.chart2,
			selected: themePalette.primary
		}),
		[themePalette]
	);
	const canvasSurfaceStyle = React.useMemo<React.CSSProperties>(
		() => ({
			backgroundImage: `radial-gradient(circle at top, ${hexToRgba(themePalette.primary, 0.18)}, transparent 34%), radial-gradient(circle at bottom, ${hexToRgba(themePalette.chart2, 0.12)}, transparent 30%), linear-gradient(180deg, ${hexToRgba(themePalette.card, 0.98)}, ${hexToRgba(themePalette.background, 0.94)})`
		}),
		[themePalette]
	);
	const hasCanvasDimensions = canvasSize.width > 0 && canvasSize.height > 0;
	const viewLineScale = React.useMemo(() => {
		if (!hasCanvasDimensions) {
			return 1;
		}

		return clamp(Math.min(canvasSize.width, canvasSize.height) / 480, 0.85, 1.48);
	}, [canvasSize.height, canvasSize.width, hasCanvasDimensions]);

	const graphNodeRel = hasCanvasDimensions ? graphNodeRelSize(canvasSize.width, canvasSize.height) : 8;

	const canAttachGraphHost = hasMounted && !isLoading && (network?.totalPeers ?? 0) > 0;

	React.useEffect(() => {
		deferredGraphDataRef.current = deferredGraphData;
	}, [deferredGraphData]);

	React.useEffect(() => {
		canvasMetricsRef.current = { width: canvasSize.width, height: canvasSize.height };
	}, [canvasSize.width, canvasSize.height]);

	const syncGraphLayoutToViewport = React.useEffectEvent(() => {
		const fg = graphRef.current;
		if (!fg) {
			return;
		}

		const { width: w, height: h } = canvasMetricsRef.current;
		if (w <= 0 || h <= 0) {
			return;
		}

		const linkForce = fg.d3Force('link') as { distance?: (value: number) => void } | undefined;
		linkForce?.distance?.(graphLinkDistance(w, h));

		const chargeForce = fg.d3Force('charge') as { strength?: (value: number) => void } | undefined;
		chargeForce?.strength?.(graphChargeStrength(w, h));

		fg.d3ReheatSimulation();

		const controls = fg.controls() as OrbitControlsLike | undefined;
		if (controls) {
			const m = Math.min(w, h);
			controls.minDistance = Math.max(40, m * 0.055);
			controls.maxDistance = Math.max(650, m * 2.35);
		}

		const pad = graphZoomPaddingPx(w, h);
		requestAnimationFrame(() => {
			const inner = graphRef.current;
			if (!inner) {
				return;
			}

			inner.zoomToFit(0, pad, node => (node as GraphNode).kind === 'peer');
		});
	});

	const pauseAutoRotate = React.useEffectEvent((pauseMs = 4_000) => {
		const controls = graphRef.current?.controls() as OrbitControlsLike | undefined;
		if (controls) {
			controls.autoRotate = false;
		}

		setIsInteracting(true);

		if (autoRotateTimerRef.current !== null) {
			window.clearTimeout(autoRotateTimerRef.current);
		}

		autoRotateTimerRef.current = window.setTimeout(() => {
			const currentControls = graphRef.current?.controls() as OrbitControlsLike | undefined;
			if (currentControls) {
				currentControls.autoRotate = true;
			}
			setIsInteracting(false);
		}, pauseMs);
	});

	const focusNode = React.useEffectEvent((node: GraphNode | null, transitionMs = 900) => {
		const graph = graphRef.current;
		if (!graph) {
			return;
		}

		const { width: cw, height: ch } = canvasMetricsRef.current;
		const w = cw > 0 ? cw : 480;
		const h = ch > 0 ? ch : 420;
		const pad = graphZoomPaddingPx(w, h);
		const camScale = graphCameraScale(w, h);

		if (!node) {
			graph.zoomToFit(transitionMs, pad, candidate => (candidate as GraphNode).kind === 'peer');
			return;
		}

		const x = node.x ?? 0;
		const y = node.y ?? 0;
		const z = node.z ?? 0;
		const distance = (110 + (node.val ?? 1) * 14) * camScale;
		const magnitude = Math.hypot(x, y, z);

		if (magnitude < 1) {
			graph.cameraPosition({ x: distance * 0.85, y: distance * 0.35, z: distance }, { x, y, z }, transitionMs);
			return;
		}

		const distRatio = 1 + distance / magnitude;
		graph.cameraPosition(
			{
				x: x * distRatio,
				y: y * distRatio,
				z: z * distRatio
			},
			{ x, y, z },
			transitionMs
		);
	});

	const nodeVal = React.useCallback(
		(node: GraphNode) => {
			const multiplier = isNodeActive(node, selectedNodeId, hoveredNodeId, hoveredLink) ? 1.35 : 1;
			if (selectedNodeId && node.kind === 'peer' && node.nodeId !== selectedNodeId) {
				return node.val * 0.92;
			}

			return node.val * multiplier;
		},
		[hoveredLink, hoveredNodeId, selectedNodeId]
	);

	const nodeColor = React.useCallback(
		(node: GraphNode) => {
			if (node.nodeId === selectedNodeId) {
				return graphPalette.selected;
			}

			if (isNodeActive(node, selectedNodeId, hoveredNodeId, hoveredLink)) {
				return graphPalette.active;
			}

			if (node.kind === 'coordinator') {
				return graphPalette.coordinator;
			}

			switch (node.status) {
				case 'healthy':
					return graphPalette.healthy;
				case 'degraded':
					return graphPalette.degraded;
				default:
					return graphPalette.offline;
			}
		},
		[graphPalette, hoveredLink, hoveredNodeId, selectedNodeId]
	);

	const nodeLabel = React.useCallback((node: GraphNode) => buildNodeTooltip(node, themePalette), [themePalette]);

	const linkLabel = React.useCallback((link: GraphLink) => buildLinkTooltip(link, themePalette), [themePalette]);

	const linkColor = React.useCallback(
		(link: GraphLink) => {
			if (isLinkActive(link, selectedNodeId, hoveredLinkId)) {
				return graphPalette.active;
			}

			return link.kind === 'peer' ? hexToRgba(graphPalette.selected, 0.38) : graphPalette.healthy;
		},
		[graphPalette, hoveredLinkId, selectedNodeId]
	);

	const linkWidth = React.useCallback(
		(link: GraphLink) =>
			link.width * viewLineScale + (isLinkActive(link, selectedNodeId, hoveredLinkId) ? 1.8 * viewLineScale : 0),
		[hoveredLinkId, selectedNodeId, viewLineScale]
	);

	const linkDirectionalParticleSpeed = React.useCallback(
		(link: GraphLink) =>
			isLinkActive(link, selectedNodeId, hoveredLinkId) ? link.particleSpeed * 1.5 : link.particleSpeed,
		[hoveredLinkId, selectedNodeId]
	);

	const linkDirectionalParticleWidth = React.useCallback(
		(link: GraphLink) => (isLinkActive(link, selectedNodeId, hoveredLinkId) ? 5 : 3) * viewLineScale,
		[hoveredLinkId, selectedNodeId, viewLineScale]
	);

	const linkDirectionalParticleColor = React.useCallback(
		(link: GraphLink) =>
			isLinkActive(link, selectedNodeId, hoveredLinkId)
				? graphPalette.active
				: link.kind === 'peer'
					? graphPalette.selected
					: graphPalette.coordinator,
		[graphPalette, hoveredLinkId, selectedNodeId]
	);

	const linkDirectionalArrowLength = React.useCallback(
		(link: GraphLink) => (isLinkActive(link, selectedNodeId, hoveredLinkId) ? 6 : 4) * viewLineScale,
		[hoveredLinkId, selectedNodeId, viewLineScale]
	);

	const linkDirectionalArrowColor = React.useCallback(
		(link: GraphLink) =>
			isLinkActive(link, selectedNodeId, hoveredLinkId)
				? graphPalette.active
				: link.kind === 'peer'
					? graphPalette.selected
					: graphPalette.coordinator,
		[graphPalette, hoveredLinkId, selectedNodeId]
	);

	const resetView = React.useEffectEvent((transitionMs = 700) => {
		const graph = graphRef.current;
		if (!graph) {
			return;
		}

		const mutableNode = findGraphNodeByPeerId(deferredGraphDataRef.current.nodes, selectedNodeId);
		if (mutableNode) {
			focusNode(mutableNode, transitionMs);
			return;
		}

		const { width: rw, height: rh } = canvasMetricsRef.current;
		const rwc = rw > 0 ? rw : 480;
		const rhc = rh > 0 ? rh : 420;
		graph.zoomToFit(transitionMs, graphZoomPaddingPx(rwc, rhc), node => (node as GraphNode).kind === 'peer');
	});

	const handleSelection = React.useEffectEvent((nodeId: string | null) => {
		onSelectNode(nodeId);
	});

	const queueInitialFit = React.useEffectEvent((transitionMs = 0) => {
		if (initialFitFrameRef.current !== null) {
			window.cancelAnimationFrame(initialFitFrameRef.current);
		}

		initialFitFrameRef.current = window.requestAnimationFrame(() => {
			initialFitFrameRef.current = null;
			resetView(transitionMs);
		});
	});

	const onNodeClickFg = React.useEffectEvent((node: GraphNode) => {
		pauseAutoRotate();
		if (node.kind === 'peer') {
			handleSelection(node.nodeId);
			focusNode(node);
			return;
		}

		handleSelection(null);
		resetView();
	});

	const onLinkClickFg = React.useEffectEvent((link: GraphLink) => {
		pauseAutoRotate();
		const targetNodeId = resolveGraphNodeId(link.target);
		handleSelection(targetNodeId || null);
		const targetNode = findGraphNodeByPeerId(deferredGraphDataRef.current.nodes, targetNodeId);
		if (targetNode) {
			focusNode(targetNode);
		}
	});

	const onBackgroundClickFg = React.useEffectEvent(() => {
		handleSelection(null);
		resetView();
	});

	const bootstrapGraphEngine = React.useEffectEvent(() => {
		const fg = graphRef.current;
		if (!fg || engineBootstrappedRef.current) {
			return;
		}

		engineBootstrappedRef.current = true;

		const linkForce = fg.d3Force('link') as { strength?: (value: number) => void } | undefined;
		linkForce?.strength?.(0.9);

		const controls = fg.controls() as OrbitControlsLike | undefined;
		if (controls) {
			controls.enableDamping = true;
			controls.dampingFactor = 0.08;
			controls.autoRotate = true;
			controls.autoRotateSpeed = 0.55;
			controls.rotateSpeed = 0.85;
			controls.zoomSpeed = 0.9;
			controls.panSpeed = 0.75;
		}

		setGraphReady(true);
	});

	const bootstrapEngineDispatchRef = React.useRef(bootstrapGraphEngine);

	React.useEffect(() => {
		bootstrapEngineDispatchRef.current = bootstrapGraphEngine;
	});

	const handleEngineStop = React.useCallback(() => {
		bootstrapEngineDispatchRef.current();
	}, []);

	React.useEffect(() => {
		setHasMounted(true);

		return () => {
			if (initialFitFrameRef.current !== null) {
				window.cancelAnimationFrame(initialFitFrameRef.current);
			}
		};
	}, []);

	React.useEffect(() => {
		if (!canAttachGraphHost) {
			return;
		}

		const container = containerRef.current;
		if (!container) {
			return;
		}

		const measure = () => {
			const rect = container.getBoundingClientRect();
			setCanvasSize({
				width: Math.round(rect.width),
				height: Math.round(rect.height)
			});
		};

		const observer = new ResizeObserver(entries => {
			const nextEntry = entries[0];
			if (!nextEntry) {
				return;
			}

			setCanvasSize({
				width: Math.round(nextEntry.contentRect.width),
				height: Math.round(nextEntry.contentRect.height)
			});
		});

		measure();
		observer.observe(container);
		return () => observer.disconnect();
	}, [canAttachGraphHost]);

	React.useEffect(() => {
		const syncTheme = () => setThemePalette(readThemePalette());
		syncTheme();

		const observer = new MutationObserver(() => syncTheme());
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style', 'data-theme']
		});

		return () => observer.disconnect();
	}, []);

	React.useEffect(() => {
		if (!canAttachGraphHost) {
			engineBootstrappedRef.current = false;
			setGraphReady(false);
			hasInitialFitRef.current = false;
			return;
		}

		const container = containerRef.current;
		if (!container) {
			return;
		}

		const pauseRotationListener = () => pauseAutoRotate();
		container.addEventListener('pointerdown', pauseRotationListener);
		container.addEventListener('wheel', pauseRotationListener, { passive: true });

		return () => {
			if (autoRotateTimerRef.current !== null) {
				window.clearTimeout(autoRotateTimerRef.current);
				autoRotateTimerRef.current = null;
			}

			container.removeEventListener('pointerdown', pauseRotationListener);
			container.removeEventListener('wheel', pauseRotationListener);
			if (initialFitFrameRef.current !== null) {
				window.cancelAnimationFrame(initialFitFrameRef.current);
				initialFitFrameRef.current = null;
			}

			engineBootstrappedRef.current = false;
			setGraphReady(false);
			hasInitialFitRef.current = false;
		};
	}, [canAttachGraphHost]);

	React.useEffect(() => {
		if (!graphReady || !hasCanvasDimensions) {
			return;
		}

		syncGraphLayoutToViewport();
	}, [
		canvasSize.height,
		canvasSize.width,
		deferredGraphData.links.length,
		deferredGraphData.nodes.length,
		graphReady,
		hasCanvasDimensions
	]);

	React.useEffect(() => {
		const graph = graphRef.current;
		if (!graph || !graphReady) {
			return;
		}

		if (!hasInitialFitRef.current && hasCanvasDimensions && deferredGraphData.nodes.length > 0) {
			hasInitialFitRef.current = true;
			queueInitialFit(0);
		}
	}, [deferredGraphData, graphReady, hasCanvasDimensions]);

	React.useEffect(() => {
		const graph = graphRef.current;
		if (!graph || !graphReady || !hasCanvasDimensions) {
			return;
		}

		if (!hasInitialFitRef.current && deferredGraphData.nodes.length > 0) {
			hasInitialFitRef.current = true;
			queueInitialFit(0);
		}
	}, [canvasSize.height, canvasSize.width, deferredGraphData.nodes.length, graphReady, hasCanvasDimensions]);

	React.useEffect(() => {
		const graph = graphRef.current;
		if (!graph || !graphReady) {
			return;
		}

		const mutableNode = findGraphNodeByPeerId(deferredGraphDataRef.current.nodes, selectedNodeId);
		if (mutableNode) {
			pauseAutoRotate();
			focusNode(mutableNode, 850);
			return;
		}

		resetView(700);
	}, [graphReady, selectedNodeId]);

	React.useEffect(() => {
		return () => {
			if (autoRotateTimerRef.current !== null) {
				window.clearTimeout(autoRotateTimerRef.current);
			}
		};
	}, []);

	if (isLoading || !hasMounted) {
		return (
			<Card className='@container/card'>
				<CardHeader>
					<Skeleton className='h-6 w-52' />
					<Skeleton className='h-4 w-72' />
					<CardAction>
						<Skeleton className='h-8 w-24 rounded-full' />
					</CardAction>
				</CardHeader>
				<CardContent className='space-y-4'>
					<Skeleton className={`rounded-3xl ${CANVAS_HEIGHT_CLASS}`} />
					<div className='flex flex-wrap gap-2'>
						{Array.from({ length: 4 }, (_, index) => (
							<Skeleton
								key={index}
								className='h-7 w-28 rounded-full'
							/>
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!network || network.totalPeers === 0) {
		return (
			<Card className='@container/card'>
				<CardHeader>
					<CardTitle>Peer discovery map</CardTitle>
					<CardDescription>Waiting for peers to advertise services into the coordinator.</CardDescription>
				</CardHeader>
				<CardContent>
					<Empty className='border border-dashed'>
						<EmptyHeader>
							<EmptyMedia variant='icon'>
								<GitBranchIcon />
							</EmptyMedia>
							<EmptyTitle>No peers to visualize yet</EmptyTitle>
							<EmptyDescription>
								Once the coordinator sees live service advertisements, the 3D graph will populate
								automatically.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className='@container/card overflow-hidden'>
			<CardHeader>
				<div className='space-y-1'>
					<CardTitle>Peer discovery map</CardTitle>
					<CardDescription>
						Each sphere is a live peer from the registry snapshot. Orange links show coordinator
						reachability; purple links infer peer-to-peer coupling from shared service capabilities.
					</CardDescription>
				</div>
				<CardAction className='flex items-center gap-2'>
					{selectedNode ? <Badge variant='secondary'>Focused on {selectedNode.shortLabel}</Badge> : null}
					<Button
						variant='outline'
						size='sm'
						onClick={() => resetView()}
					>
						<RefreshCcwIcon />
						Reset view
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className='space-y-4'>
				<div
					className='relative overflow-hidden rounded-[1.75rem] border border-border/60'
					style={canvasSurfaceStyle}
				>
					<div
						ref={containerRef}
						className={CANVAS_HEIGHT_CLASS}
					>
						{canAttachGraphHost && hasCanvasDimensions ? (
							<ForceGraph3D
								ref={graphRef}
								width={canvasSize.width}
								height={canvasSize.height}
								graphData={deferredGraphData}
								controlType='orbit'
								backgroundColor='rgba(0,0,0,0)'
								showNavInfo={false}
								nodeRelSize={graphNodeRel}
								nodeAutoColorBy='user'
								nodeOpacity={1}
								linkOpacity={1}
								linkDirectionalArrowRelPos={1}
								linkHoverPrecision={10}
								enableNodeDrag
								enableNavigationControls
								showPointerCursor
								linkDirectionalParticles={0}
								warmupTicks={40}
								cooldownTime={18_000}
								d3VelocityDecay={0.18}
								onEngineStop={handleEngineStop}
								nodeVal={nodeVal}
								nodeColor={nodeColor}
								nodeLabel={nodeLabel}
								linkLabel={linkLabel}
								linkColor={linkColor}
								linkWidth={linkWidth}
								linkDirectionalParticleSpeed={linkDirectionalParticleSpeed}
								linkDirectionalParticleWidth={linkDirectionalParticleWidth}
								linkDirectionalParticleColor={linkDirectionalParticleColor}
								linkDirectionalArrowLength={linkDirectionalArrowLength}
								linkDirectionalArrowColor={linkDirectionalArrowColor}
								onNodeClick={node => onNodeClickFg(node as GraphNode)}
								onNodeHover={node => {
									setHoveredLinkId(null);
									setHoveredNodeId(node ? String(node.id ?? '') : null);
								}}
								onLinkClick={link => onLinkClickFg(link as GraphLink)}
								onLinkHover={link => {
									setHoveredNodeId(null);
									setHoveredLinkId(link ? (link as GraphLink).id : null);
								}}
								onBackgroundClick={() => onBackgroundClickFg()}
								onNodeDrag={() => pauseAutoRotate()}
								onNodeDragEnd={() => pauseAutoRotate()}
							/>
						) : null}
					</div>
					<div className='pointer-events-none absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-2 text-xs'>
						<Badge
							variant='outline'
							className='bg-background/78 text-foreground shadow-sm backdrop-blur-sm'
						>
							<RefreshCcwIcon />
							{isInteracting ? 'Auto-rotate paused' : 'Auto-rotate active'}
						</Badge>
						<Badge
							variant='outline'
							className='bg-background/78 text-foreground shadow-sm backdrop-blur-sm'
						>
							Click a peer to focus
						</Badge>
						<Badge
							variant='outline'
							className='bg-background/78 text-foreground shadow-sm backdrop-blur-sm'
						>
							Drag to rebalance
						</Badge>
					</div>
				</div>

				<div className='flex flex-wrap gap-2 text-xs'>
					<Badge
						variant='outline'
						className='gap-2'
					>
						<span
							className='size-2 rounded-full'
							style={{ backgroundColor: graphPalette.coordinator }}
						/>
						Coordinator
					</Badge>
					<Badge
						variant='outline'
						className='gap-2'
					>
						<span
							className='size-2 rounded-full'
							style={{ backgroundColor: graphPalette.healthy }}
						/>
						Healthy peers
					</Badge>
					<Badge
						variant='outline'
						className='gap-2'
					>
						<span
							className='size-2 rounded-full'
							style={{ backgroundColor: graphPalette.degraded }}
						/>
						Partial capacity
					</Badge>
					<Badge
						variant='outline'
						className='gap-2'
					>
						<span
							className='size-2 rounded-full'
							style={{ backgroundColor: graphPalette.offline }}
						/>
						Unavailable
					</Badge>
				</div>
			</CardContent>
		</Card>
	);
}
