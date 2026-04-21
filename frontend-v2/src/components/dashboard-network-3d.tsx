'use client';

import * as React from 'react';
import { forceCollide } from 'd3-force-3d';
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

type GraphNode = Omit<DashboardNetworkGraphNode, 'color'> &
	NodeObject & {
		autoColorGroup: string;
		color?: string;
	};

type GraphLink = Omit<DashboardNetworkGraphLink, 'source' | 'target' | 'color'> &
	LinkObject<GraphNode> & {
		source: string | GraphNode;
		target: string | GraphNode;
		autoColorGroup: string;
		color?: string;
	};

type GraphData = {
	nodes: GraphNode[];
	links: GraphLink[];
};

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

type ThemePalette = {
	primary: string;
	chart2: string;
	mutedForeground: string;
	card: string;
	background: string;
	foreground: string;
	border: string;
};

const ForceGraph3D = dynamic(() => import('react-force-graph-3d').then(mod => mod.default), {
	ssr: false
}) as typeof ForceGraph3DComponent;

const CANVAS_HEIGHT_CLASS = 'h-[420px] w-full sm:h-[480px] xl:h-[540px]';
const DEFAULT_THEME_PALETTE: ThemePalette = {
	primary: '#7c3aed',
	chart2: '#f59e0b',
	mutedForeground: '#71717a',
	card: '#ffffff',
	background: '#f8fafc',
	foreground: '#18181b',
	border: '#e4e4e7'
};

function graphZoomPaddingPx(width: number, height: number) {
	const m = Math.min(width, height);
	return Math.max(32, Math.round(m * 0.08));
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function graphLinkDistance(width: number, height: number) {
	const m = Math.min(width, height);
	return Math.round(clamp(m * 0.52, 160, 340));
}

function graphChargeStrength(width: number, height: number) {
	const m = Math.min(width, height);
	return -Math.round(clamp(m * 1.08, 460, 1120));
}

function graphCameraScale(width: number, height: number) {
	const m = Math.min(width, height);
	return clamp(m / 420, 0.84, 1.6);
}

function graphNodeRelSize(width: number, height: number) {
	const m = Math.min(width, height);
	return clamp(m / 110, 3.9, 6.6);
}

function graphBaseNodeValue(node: GraphNode) {
	const scaled = node.val * (node.kind === 'coordinator' ? 0.76 : 0.5);
	return clamp(scaled, node.kind === 'coordinator' ? 6.2 : 3.8, node.kind === 'coordinator' ? 11.2 : 8.4);
}

function graphCollisionRadius(nodeValue: number, nodeRel: number) {
	return Math.cbrt(Math.max(nodeValue, 1)) * nodeRel * 1.42 + 12;
}

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

function resolveGraphPaintColor(value: string | undefined, fallback: string) {
	if (!value) {
		return fallback;
	}

	return resolveCssColor(value, fallback);
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
	const title = escapeHtml(node.kind === 'coordinator' ? 'Coordinator' : node.shortLabel);
	const subtitle = escapeHtml(node.kind === 'coordinator' ? node.label : node.nodeId ?? node.label);
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
			<div style="margin-top:3px;font-size:11px;opacity:0.72;">${subtitle}</div>
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
	const linkTitle = link.kind === 'peer' ? 'Peer capability overlap' : 'Coordinator reachability';
	const endpointLabel =
		link.kind === 'peer' ? `${sourceNodeId} <-> ${targetNodeId}` : `${sourceNodeId} -> ${targetNodeId}`;
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
			nodes:
				network?.nodes.map(({ color: _color, ...node }) => ({
					...node,
					autoColorGroup: node.kind === 'coordinator' ? 'coordinator' : node.nodeId ?? node.id
				})) ?? [],
			links:
				network?.links.map(({ color: _color, ...link }) => ({
					...link,
					autoColorGroup:
						link.kind === 'coordinator'
							? 'coordinator'
							: resolveGraphNodeId(link.source) || `peer-link:${link.id}`
				})) ?? []
		}),
		[network]
	);

	const deferredGraphData = React.useDeferredValue(graphData);
	const hoveredLink = React.useMemo(
		() => deferredGraphData.links.find(link => link.id === hoveredLinkId) ?? null,
		[deferredGraphData.links, hoveredLinkId]
	);
	const hasCanvasDimensions = canvasSize.width > 0 && canvasSize.height > 0;
	const graphNodeRel = hasCanvasDimensions ? graphNodeRelSize(canvasSize.width, canvasSize.height) : 8;
	const totalPeerOverlapLinks = React.useMemo(
		() => deferredGraphData.links.filter(link => link.kind === 'peer').length,
		[deferredGraphData.links]
	);
	const isAnyFocusActive = Boolean(selectedNodeId || hoveredNodeId || hoveredLinkId);
	const graphCanvasBase = React.useMemo(
		() => mixHex(themePalette.background, themePalette.card, 0.46),
		[themePalette.background, themePalette.card]
	);
	const canvasSurfaceStyle = React.useMemo<React.CSSProperties>(
		() => ({
			backgroundColor: themePalette.card,
			backgroundImage: `radial-gradient(circle at 18% 16%, ${hexToRgba(themePalette.primary, 0.08)}, transparent 24%), radial-gradient(circle at 82% 14%, ${hexToRgba(themePalette.chart2, 0.07)}, transparent 22%), linear-gradient(180deg, ${hexToRgba(mixHex(themePalette.card, '#ffffff', 0.14), 0.98)} 0%, ${hexToRgba(graphCanvasBase, 0.98)} 100%)`
		}),
		[graphCanvasBase, themePalette]
	);
	const viewLineScale = React.useMemo(() => {
		if (!hasCanvasDimensions) {
			return 1;
		}

		return clamp(Math.min(canvasSize.width, canvasSize.height) / 560, 0.92, 1.4);
	}, [canvasSize.height, canvasSize.width, hasCanvasDimensions]);
	const canAttachGraphHost = hasMounted && !isLoading && (network?.totalPeers ?? 0) > 0;

	React.useEffect(() => {
		deferredGraphDataRef.current = deferredGraphData;
	}, [deferredGraphData]);

	React.useEffect(() => {
		canvasMetricsRef.current = { width: canvasSize.width, height: canvasSize.height };
	}, [canvasSize.width, canvasSize.height]);

	const getRenderedNodeValue = React.useCallback(
		(node: GraphNode) => {
			let value = graphBaseNodeValue(node);
			if (node.nodeId === selectedNodeId) {
				value *= 1.14;
			}
			if (hoveredNodeId && node.id === hoveredNodeId) {
				value *= 1.08;
			}
			if (hoveredLink && isNodeActive(node, selectedNodeId, hoveredNodeId, hoveredLink)) {
				value *= 1.05;
			}
			if (selectedNodeId && node.kind === 'peer' && node.nodeId !== selectedNodeId) {
				value *= 0.94;
			}

			return clamp(value, node.kind === 'coordinator' ? 6.2 : 3.8, node.kind === 'coordinator' ? 12.2 : 9.4);
		},
		[hoveredLink, hoveredNodeId, selectedNodeId]
	);

	const syncGraphLayoutToViewport = React.useEffectEvent(() => {
		const fg = graphRef.current;
		if (!fg) {
			return;
		}

		const { width, height } = canvasMetricsRef.current;
		if (width <= 0 || height <= 0) {
			return;
		}

		const linkForce = fg.d3Force('link') as
			| {
					distance?: (value: ((link: GraphLink) => number) | number) => void;
					strength?: (value: ((link: GraphLink) => number) | number) => void;
			  }
			| undefined;

		linkForce?.distance?.((link: GraphLink) => {
			const baseDistance = graphLinkDistance(width, height);
			if (link.kind === 'coordinator') {
				return baseDistance * 0.92 + Math.min(link.availableServices, 6) * 6;
			}

			return baseDistance * 1.18 + Math.min(link.serviceTypes.length, 6) * 12;
		});
		linkForce?.strength?.((link: GraphLink) => (link.kind === 'coordinator' ? 0.24 : 0.11));

		const chargeForce = fg.d3Force('charge') as { strength?: (value: number) => void } | undefined;
		chargeForce?.strength?.(graphChargeStrength(width, height));

		const nodeRel = graphNodeRelSize(width, height);
		const collisionForce = forceCollide<GraphNode>(node =>
			graphCollisionRadius(getRenderedNodeValue(node), nodeRel)
		);
		collisionForce.strength(1);
		collisionForce.iterations(2);
		fg.d3Force('collide', collisionForce);

		fg.d3ReheatSimulation();

		const controls = fg.controls() as OrbitControlsLike | undefined;
		if (controls) {
			const m = Math.min(width, height);
			controls.minDistance = Math.max(88, m * 0.14);
			controls.maxDistance = Math.max(1200, m * 3.4);
		}

		const pad = graphZoomPaddingPx(width, height);
		requestAnimationFrame(() => {
			graphRef.current?.zoomToFit(0, pad);
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

	const resetView = React.useEffectEvent((transitionMs = 700) => {
		const graph = graphRef.current;
		if (!graph) {
			return;
		}

		const { width, height } = canvasMetricsRef.current;
		const fitWidth = width > 0 ? width : 480;
		const fitHeight = height > 0 ? height : 420;
		graph.zoomToFit(transitionMs, graphZoomPaddingPx(fitWidth, fitHeight));
	});

	const focusNode = React.useEffectEvent((node: GraphNode | null, transitionMs = 900) => {
		const graph = graphRef.current;
		if (!graph) {
			return;
		}

		const { width: cw, height: ch } = canvasMetricsRef.current;
		const width = cw > 0 ? cw : 480;
		const height = ch > 0 ? ch : 420;
		const camScale = graphCameraScale(width, height);

		if (!node) {
			graph.zoomToFit(transitionMs, graphZoomPaddingPx(width, height));
			return;
		}

		const nodeRadius = graphCollisionRadius(getRenderedNodeValue(node), graphNodeRelSize(width, height));

		const x = node.x ?? 0;
		const y = node.y ?? 0;
		const z = node.z ?? 0;
		const distance = (136 + nodeRadius * 8.6) * camScale;
		const magnitude = Math.hypot(x, y, z);

		if (magnitude < 1) {
			graph.cameraPosition({ x: distance * 0.82, y: distance * 0.34, z: distance }, { x, y, z }, transitionMs);
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

	const nodeColor = React.useCallback(
		(node: GraphNode) => {
			const fallback =
				node.kind === 'coordinator'
					? mixHex(themePalette.chart2, '#ffffff', 0.08)
					: mixHex(themePalette.primary, '#ffffff', 0.06);
			const baseColor = resolveGraphPaintColor(node.color, fallback);

			if (!isAnyFocusActive) {
				return baseColor;
			}

			return isNodeActive(node, selectedNodeId, hoveredNodeId, hoveredLink)
				? baseColor
				: hexToRgba(baseColor, 0.28);
		},
		[hoveredLink, hoveredNodeId, isAnyFocusActive, selectedNodeId, themePalette.chart2, themePalette.primary]
	);

	const linkColor = React.useCallback(
		(link: GraphLink) => {
			const fallback =
				link.kind === 'coordinator'
					? mixHex(themePalette.chart2, '#ffffff', 0.12)
					: mixHex(themePalette.primary, '#ffffff', 0.12);
			const baseColor = resolveGraphPaintColor(link.color, fallback);

			if (!isAnyFocusActive) {
				return hexToRgba(baseColor, link.kind === 'peer' ? 0.28 : 0.5);
			}

			return isLinkActive(link, selectedNodeId, hoveredLinkId) ? hexToRgba(baseColor, 0.92) : hexToRgba(baseColor, 0.1);
		},
		[hoveredLinkId, isAnyFocusActive, selectedNodeId, themePalette.chart2, themePalette.primary]
	);

	const nodeLabel = React.useCallback((node: GraphNode) => buildNodeTooltip(node, themePalette), [themePalette]);
	const linkLabel = React.useCallback((link: GraphLink) => buildLinkTooltip(link, themePalette), [themePalette]);

	const linkWidth = React.useCallback(
		(link: GraphLink) =>
			Math.max(
				1,
				link.width * viewLineScale + (isLinkActive(link, selectedNodeId, hoveredLinkId) ? 1.65 * viewLineScale : 0)
			),
		[hoveredLinkId, selectedNodeId, viewLineScale]
	);

	const linkDirectionalParticles = React.useCallback(
		(link: GraphLink) => {
			if (link.kind !== 'coordinator') {
				return 0;
			}

			return isLinkActive(link, selectedNodeId, hoveredLinkId) ? 4 : 2;
		},
		[hoveredLinkId, selectedNodeId]
	);

	const linkDirectionalParticleSpeed = React.useCallback(
		(link: GraphLink) =>
			isLinkActive(link, selectedNodeId, hoveredLinkId) ? link.particleSpeed * 1.6 : link.particleSpeed,
		[hoveredLinkId, selectedNodeId]
	);

	const linkDirectionalParticleWidth = React.useCallback(
		(link: GraphLink) => (isLinkActive(link, selectedNodeId, hoveredLinkId) ? 5.5 : 3.2) * viewLineScale,
		[hoveredLinkId, selectedNodeId, viewLineScale]
	);

	const linkDirectionalParticleColor = React.useCallback(
		(link: GraphLink) => {
			const fallback =
				link.kind === 'coordinator'
					? mixHex(themePalette.chart2, '#ffffff', 0.08)
					: mixHex(themePalette.primary, '#ffffff', 0.08);
			const baseColor = resolveGraphPaintColor(link.color, fallback);
			return isLinkActive(link, selectedNodeId, hoveredLinkId) ? '#ffffff' : baseColor;
		},
		[hoveredLinkId, selectedNodeId, themePalette.chart2, themePalette.primary]
	);

	const linkDirectionalArrowLength = React.useCallback(
		(link: GraphLink) => (isLinkActive(link, selectedNodeId, hoveredLinkId) ? 7 : 4.5) * viewLineScale,
		[hoveredLinkId, selectedNodeId, viewLineScale]
	);

	const linkDirectionalArrowColor = React.useCallback(
		(link: GraphLink) => {
			const fallback =
				link.kind === 'coordinator'
					? mixHex(themePalette.chart2, '#ffffff', 0.08)
					: mixHex(themePalette.primary, '#ffffff', 0.08);
			const baseColor = resolveGraphPaintColor(link.color, fallback);
			return isLinkActive(link, selectedNodeId, hoveredLinkId) ? '#ffffff' : baseColor;
		},
		[hoveredLinkId, selectedNodeId, themePalette.chart2, themePalette.primary]
	);

	const queueInitialFit = React.useEffectEvent((transitionMs = 420) => {
		if (initialFitFrameRef.current !== null) {
			window.cancelAnimationFrame(initialFitFrameRef.current);
		}

		initialFitFrameRef.current = window.requestAnimationFrame(() => {
			initialFitFrameRef.current = null;
			resetView(transitionMs);
		});
	});

	const handleSelection = React.useEffectEvent((nodeId: string | null) => {
		onSelectNode(nodeId);
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
			return;
		}

		resetView();
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

		const { width: cw, height: ch } = canvasMetricsRef.current;
		const width = cw > 0 ? cw : 480;
		const height = ch > 0 ? ch : 420;
		const nodeRel = graphNodeRelSize(width, height);

		const linkForce = fg.d3Force('link') as { strength?: (value: number) => void } | undefined;
		linkForce?.strength?.(0.18);

		const chargeForce = fg.d3Force('charge') as { strength?: (value: number) => void } | undefined;
		chargeForce?.strength?.(graphChargeStrength(width, height));

		const collisionForce = forceCollide<GraphNode>(node =>
			graphCollisionRadius(getRenderedNodeValue(node), nodeRel)
		);
		collisionForce.strength(1);
		collisionForce.iterations(2);
		fg.d3Force('collide', collisionForce);

		const controls = fg.controls() as OrbitControlsLike | undefined;
		if (controls) {
			controls.enableDamping = true;
			controls.dampingFactor = 0.08;
			controls.autoRotate = true;
			controls.autoRotateSpeed = 0.45;
			controls.rotateSpeed = 0.72;
			controls.zoomSpeed = 0.9;
			controls.panSpeed = 0.68;
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
	}, [focusNode, graphReady, pauseAutoRotate, resetView, selectedNodeId]);

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
						{Array.from({ length: 5 }, (_, index) => (
							<Skeleton
								key={index}
								className='h-7 w-32 rounded-full'
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
					<CardTitle>Peer discovery graph</CardTitle>
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
					<CardTitle>Peer discovery graph</CardTitle>
					<CardDescription>
						True 3D peer topology with orbit controls, fit-to-frame reset, and auto-colored node identities.
						Solid links show coordinator reachability; peer links show inferred capability overlap.
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
					className='relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-card/90'
					style={canvasSurfaceStyle}
				>
					<div className='pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap gap-2 text-xs'>
						<Badge className='border-border/70 bg-background/88 text-foreground shadow-sm backdrop-blur-sm hover:bg-background/88'>
							{network.totalPeers} live peers
						</Badge>
						<Badge className='border-border/70 bg-background/88 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background/88'>
							{network.totalServices} services
						</Badge>
						<Badge className='border-border/70 bg-background/88 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background/88'>
							{network.serviceTypes.length} gate families
						</Badge>
						<Badge className='border-border/70 bg-background/88 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background/88'>
							{totalPeerOverlapLinks} peer overlap links
						</Badge>
					</div>
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
								nodeAutoColorBy='autoColorGroup'
								linkAutoColorBy='autoColorGroup'
								nodeOpacity={1}
								linkOpacity={1}
								linkDirectionalArrowRelPos={1}
								linkHoverPrecision={10}
								enableNodeDrag
								enableNavigationControls
								showPointerCursor
								warmupTicks={50}
								cooldownTime={20_000}
								d3VelocityDecay={0.18}
								onEngineStop={handleEngineStop}
								nodeVal={getRenderedNodeValue}
								nodeColor={nodeColor}
								nodeLabel={nodeLabel}
								linkLabel={linkLabel}
								linkColor={linkColor}
								linkWidth={linkWidth}
								linkDirectionalParticles={link => linkDirectionalParticles(link as GraphLink)}
								linkDirectionalParticleSpeed={link => linkDirectionalParticleSpeed(link as GraphLink)}
								linkDirectionalParticleWidth={link => linkDirectionalParticleWidth(link as GraphLink)}
								linkDirectionalParticleColor={link => linkDirectionalParticleColor(link as GraphLink)}
								linkDirectionalArrowLength={link => linkDirectionalArrowLength(link as GraphLink)}
								linkDirectionalArrowColor={link => linkDirectionalArrowColor(link as GraphLink)}
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
					<div className='pointer-events-none absolute inset-x-4 bottom-4 z-10 flex flex-wrap items-center gap-2 text-xs'>
						<Badge className='border-border/70 bg-background/88 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background/88'>
							{isInteracting ? 'Auto-rotate paused' : 'Auto-rotate active'}
						</Badge>
						<Badge className='border-border/70 bg-background/88 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background/88'>
							Drag nodes to rebalance depth
						</Badge>
						<Badge className='border-border/70 bg-background/88 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-background/88'>
							Wheel to zoom, drag canvas to orbit
						</Badge>
					</div>
				</div>

				<div className='flex flex-wrap gap-2 text-xs'>
					<Badge
						variant='outline'
						className='gap-2'
					>
						<span className='size-2 rounded-full bg-[linear-gradient(90deg,#60a5fa,#f472b6)]' />
						Auto-colored peers
					</Badge>
					<Badge
						variant='outline'
						className='gap-2'
					>
						<span className='size-2 rounded-full bg-white' />
						White arrows = coordinator flow
					</Badge>
					<Badge
						variant='outline'
						className='gap-2'
					>
						Focused nodes brighten; others recede
					</Badge>
					<Badge
						variant='outline'
						className='gap-2'
					>
						Larger spheres = more service and fidelity weight
					</Badge>
				</div>
			</CardContent>
		</Card>
	);
}
