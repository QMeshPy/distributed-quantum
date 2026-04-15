import { shortFragmentId } from '@/lib/fragment-flow-format';
import type { RunFragmentResultSummary, RunPlanSummary } from '@/types/runs';

const MAX_ENUMERATED_FRAGMENT_PATHS = 48;
const MAX_DISTINCT_PEER_ROUTES = 12;
const MAX_EDGE_FRAGMENT_PAIRS = 6;

type ResolvedFragmentPeer = {
	fragmentId: string;
	peerId: string;
	serviceType: string;
	dependencies: string[];
	depth: number;
	order: number;
	isObserved: boolean;
};

type PeerNodeAccumulator = {
	peerId: string;
	shortPeerId: string;
	fragmentIds: string[];
	serviceTypes: Set<string>;
	minDepth: number;
	maxDepth: number;
	firstSeenOrder: number;
	observedFragmentCount: number;
	plannedFragmentCount: number;
	localHandoffCount: number;
	incomingHandoffCount: number;
	outgoingHandoffCount: number;
};

type PeerEdgeAccumulator = {
	id: string;
	sourcePeerId: string;
	targetPeerId: string;
	handoffCount: number;
	fragmentPairs: Array<{ fromFragmentId: string; toFragmentId: string }>;
	usesPlannedRouting: boolean;
};

type PeerRouteAccumulator = {
	id: string;
	peerIds: string[];
	fragmentIds: string[];
	sourcePathCount: number;
	usesPlannedRouting: boolean;
};

export type PeerExecutionFlowNode = {
	peerId: string;
	shortPeerId: string;
	fragmentIds: string[];
	serviceTypes: string[];
	minDepth: number;
	maxDepth: number;
	x: number;
	y: number;
	width: number;
	height: number;
	observedFragmentCount: number;
	plannedFragmentCount: number;
	localHandoffCount: number;
	incomingHandoffCount: number;
	outgoingHandoffCount: number;
};

export type PeerExecutionFlowEdge = {
	id: string;
	sourcePeerId: string;
	targetPeerId: string;
	handoffCount: number;
	fragmentPairs: Array<{ fromFragmentId: string; toFragmentId: string }>;
	usesPlannedRouting: boolean;
};

export type PeerExecutionRoute = {
	id: string;
	peerIds: string[];
	fragmentIds: string[];
	sourcePathCount: number;
	usesPlannedRouting: boolean;
};

export type PeerExecutionFlowModel = {
	width: number;
	height: number;
	nodes: PeerExecutionFlowNode[];
	edges: PeerExecutionFlowEdge[];
	routes: PeerExecutionRoute[];
	totalFragments: number;
	resolvedFragments: number;
	observedFragments: number;
	plannedOnlyFragments: number;
	unresolvedFragments: number;
	crossPeerHandoffs: number;
	localHandoffs: number;
	routeEnumerationTruncated: boolean;
};

function buildDepthResolver(plan: RunPlanSummary) {
	const depthCache = new Map<string, number>();
	const fragmentById = new Map(plan.fragments.map(fragment => [fragment.fragmentId, fragment]));

	const getDepth = (fragmentId: string): number => {
		const cachedDepth = depthCache.get(fragmentId);
		if (cachedDepth !== undefined) {
			return cachedDepth;
		}

		const fragment = fragmentById.get(fragmentId);
		if (!fragment || fragment.dependencies.length === 0) {
			depthCache.set(fragmentId, 0);
			return 0;
		}

		const depth = Math.max(...fragment.dependencies.map(dependencyId => getDepth(dependencyId))) + 1;
		depthCache.set(fragmentId, depth);
		return depth;
	};

	return getDepth;
}

export function buildPeerExecutionFlowModel(
	plan: RunPlanSummary | null,
	fragmentResults: RunFragmentResultSummary[]
): PeerExecutionFlowModel | null {
	if (!plan) {
		return null;
	}

	const resultByFragmentId = new Map(fragmentResults.map(fragment => [fragment.fragmentId, fragment]));
	const fragmentById = new Map(plan.fragments.map(fragment => [fragment.fragmentId, fragment]));
	const childrenByFragmentId = new Map<string, string[]>(plan.fragments.map(fragment => [fragment.fragmentId, []]));
	const getDepth = buildDepthResolver(plan);

	for (const fragment of plan.fragments) {
		for (const dependencyId of fragment.dependencies) {
			const currentChildren = childrenByFragmentId.get(dependencyId) ?? [];
			currentChildren.push(fragment.fragmentId);
			childrenByFragmentId.set(dependencyId, currentChildren);
		}
	}

	const resolvedFragmentPeers = new Map<string, ResolvedFragmentPeer>();
	let observedFragments = 0;
	let plannedOnlyFragments = 0;

	plan.fragmentOrder.forEach((fragmentId, order) => {
		const fragment = fragmentById.get(fragmentId);
		if (!fragment) {
			return;
		}

		const runtimePeerId = resultByFragmentId.get(fragmentId)?.nodeId ?? null;
		const peerId = runtimePeerId ?? fragment.primaryNodeId;
		if (!peerId) {
			return;
		}

		const isObserved = runtimePeerId !== null;
		if (isObserved) {
			observedFragments += 1;
		} else {
			plannedOnlyFragments += 1;
		}

		resolvedFragmentPeers.set(fragmentId, {
			fragmentId,
			peerId,
			serviceType: fragment.serviceType,
			dependencies: fragment.dependencies,
			depth: getDepth(fragmentId),
			order,
			isObserved
		});
	});

	const nodeAccumulators = new Map<string, PeerNodeAccumulator>();
	for (const fragmentId of plan.fragmentOrder) {
		const resolvedFragment = resolvedFragmentPeers.get(fragmentId);
		if (!resolvedFragment) {
			continue;
		}

		const existing = nodeAccumulators.get(resolvedFragment.peerId);
		if (existing) {
			existing.fragmentIds.push(fragmentId);
			existing.serviceTypes.add(resolvedFragment.serviceType);
			existing.minDepth = Math.min(existing.minDepth, resolvedFragment.depth);
			existing.maxDepth = Math.max(existing.maxDepth, resolvedFragment.depth);
			existing.firstSeenOrder = Math.min(existing.firstSeenOrder, resolvedFragment.order);
			if (resolvedFragment.isObserved) {
				existing.observedFragmentCount += 1;
			} else {
				existing.plannedFragmentCount += 1;
			}
			continue;
		}

		nodeAccumulators.set(resolvedFragment.peerId, {
			peerId: resolvedFragment.peerId,
			shortPeerId: shortFragmentId(resolvedFragment.peerId, 10, 5),
			fragmentIds: [fragmentId],
			serviceTypes: new Set([resolvedFragment.serviceType]),
			minDepth: resolvedFragment.depth,
			maxDepth: resolvedFragment.depth,
			firstSeenOrder: resolvedFragment.order,
			observedFragmentCount: resolvedFragment.isObserved ? 1 : 0,
			plannedFragmentCount: resolvedFragment.isObserved ? 0 : 1,
			localHandoffCount: 0,
			incomingHandoffCount: 0,
			outgoingHandoffCount: 0
		});
	}

	const edgeAccumulators = new Map<string, PeerEdgeAccumulator>();
	let crossPeerHandoffs = 0;
	let localHandoffs = 0;

	for (const fragmentId of plan.fragmentOrder) {
		const targetFragment = resolvedFragmentPeers.get(fragmentId);
		if (!targetFragment) {
			continue;
		}

		for (const dependencyId of targetFragment.dependencies) {
			const sourceFragment = resolvedFragmentPeers.get(dependencyId);
			if (!sourceFragment) {
				continue;
			}

			if (sourceFragment.peerId === targetFragment.peerId) {
				localHandoffs += 1;
				const localNode = nodeAccumulators.get(targetFragment.peerId);
				if (localNode) {
					localNode.localHandoffCount += 1;
				}
				continue;
			}

			crossPeerHandoffs += 1;
			const edgeId = `${sourceFragment.peerId}->${targetFragment.peerId}`;
			const existing = edgeAccumulators.get(edgeId);
			if (existing) {
				existing.handoffCount += 1;
				existing.usesPlannedRouting ||= !sourceFragment.isObserved || !targetFragment.isObserved;
				if (existing.fragmentPairs.length < MAX_EDGE_FRAGMENT_PAIRS) {
					existing.fragmentPairs.push({
						fromFragmentId: dependencyId,
						toFragmentId: fragmentId
					});
				}
				continue;
			}

			edgeAccumulators.set(edgeId, {
				id: edgeId,
				sourcePeerId: sourceFragment.peerId,
				targetPeerId: targetFragment.peerId,
				handoffCount: 1,
				fragmentPairs: [
					{
						fromFragmentId: dependencyId,
						toFragmentId: fragmentId
					}
				],
				usesPlannedRouting: !sourceFragment.isObserved || !targetFragment.isObserved
			});
		}
	}

	for (const edge of edgeAccumulators.values()) {
		const sourceNode = nodeAccumulators.get(edge.sourcePeerId);
		if (sourceNode) {
			sourceNode.outgoingHandoffCount += edge.handoffCount;
		}

		const targetNode = nodeAccumulators.get(edge.targetPeerId);
		if (targetNode) {
			targetNode.incomingHandoffCount += edge.handoffCount;
		}
	}

	const orderedNodeAccumulators = [...nodeAccumulators.values()].sort((left, right) => {
		if (left.minDepth !== right.minDepth) {
			return left.minDepth - right.minDepth;
		}
		if (left.firstSeenOrder !== right.firstSeenOrder) {
			return left.firstSeenOrder - right.firstSeenOrder;
		}
		return left.peerId.localeCompare(right.peerId);
	});

	const rowsByDepth = new Map<number, PeerNodeAccumulator[]>();
	for (const node of orderedNodeAccumulators) {
		rowsByDepth.set(node.minDepth, [...(rowsByDepth.get(node.minDepth) ?? []), node]);
	}

	const orderedDepths = [...rowsByDepth.keys()].sort((left, right) => left - right);
	const maxRows = Math.max(1, ...orderedDepths.map(depth => rowsByDepth.get(depth)?.length ?? 0));

	const nodeWidth = 248;
	const nodeHeight = 144;
	const columnGap = 112;
	const rowGap = 52;
	const padding = 48;
	const drawableHeight = maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap;

	const nodes: PeerExecutionFlowNode[] = [];
	for (const depth of orderedDepths) {
		const depthNodes = rowsByDepth.get(depth) ?? [];
		const columnHeight = depthNodes.length * nodeHeight + Math.max(0, depthNodes.length - 1) * rowGap;
		const startY = padding + (drawableHeight - columnHeight) / 2;

		depthNodes.forEach((node, rowIndex) => {
			nodes.push({
				peerId: node.peerId,
				shortPeerId: node.shortPeerId,
				fragmentIds: [...node.fragmentIds],
				serviceTypes: [...node.serviceTypes].sort((left, right) => left.localeCompare(right)),
				minDepth: node.minDepth,
				maxDepth: node.maxDepth,
				x: padding + depth * (nodeWidth + columnGap),
				y: startY + rowIndex * (nodeHeight + rowGap),
				width: nodeWidth,
				height: nodeHeight,
				observedFragmentCount: node.observedFragmentCount,
				plannedFragmentCount: node.plannedFragmentCount,
				localHandoffCount: node.localHandoffCount,
				incomingHandoffCount: node.incomingHandoffCount,
				outgoingHandoffCount: node.outgoingHandoffCount
			});
		});
	}

	const edges = [...edgeAccumulators.values()].sort((left, right) => {
		if (left.handoffCount !== right.handoffCount) {
			return right.handoffCount - left.handoffCount;
		}
		return left.id.localeCompare(right.id);
	});

	const rootFragmentIds = plan.fragmentOrder.filter(fragmentId => {
		const fragment = fragmentById.get(fragmentId);
		return Boolean(fragment && fragment.dependencies.length === 0);
	});

	let enumeratedPathCount = 0;
	let routeEnumerationTruncated = false;
	const routeAccumulators = new Map<string, PeerRouteAccumulator>();

	const collectRoute = (fragmentPath: string[]) => {
		if (fragmentPath.length === 0) {
			return;
		}

		const peerIds: string[] = [];
		let usesPlannedRouting = false;

		for (const fragmentId of fragmentPath) {
			const resolvedFragment = resolvedFragmentPeers.get(fragmentId);
			if (!resolvedFragment) {
				return;
			}

			usesPlannedRouting ||= !resolvedFragment.isObserved;
			if (peerIds.at(-1) !== resolvedFragment.peerId) {
				peerIds.push(resolvedFragment.peerId);
			}
		}

		if (peerIds.length === 0) {
			return;
		}

		const routeId = peerIds.join('>');
		const existing = routeAccumulators.get(routeId);
		if (existing) {
			existing.sourcePathCount += 1;
			existing.usesPlannedRouting ||= usesPlannedRouting;
			return;
		}

		if (routeAccumulators.size >= MAX_DISTINCT_PEER_ROUTES) {
			routeEnumerationTruncated = true;
			return;
		}

		routeAccumulators.set(routeId, {
			id: routeId,
			peerIds,
			fragmentIds: [...fragmentPath],
			sourcePathCount: 1,
			usesPlannedRouting
		});
	};

	const visitFragmentPath = (fragmentId: string, currentPath: string[]) => {
		if (enumeratedPathCount >= MAX_ENUMERATED_FRAGMENT_PATHS) {
			routeEnumerationTruncated = true;
			return;
		}

		const nextPath = [...currentPath, fragmentId];
		const childFragmentIds = childrenByFragmentId.get(fragmentId) ?? [];
		if (childFragmentIds.length === 0) {
			enumeratedPathCount += 1;
			collectRoute(nextPath);
			return;
		}

		for (const childFragmentId of childFragmentIds) {
			visitFragmentPath(childFragmentId, nextPath);
			if (routeEnumerationTruncated && enumeratedPathCount >= MAX_ENUMERATED_FRAGMENT_PATHS) {
				return;
			}
		}
	};

	for (const rootFragmentId of rootFragmentIds) {
		visitFragmentPath(rootFragmentId, []);
		if (routeEnumerationTruncated && enumeratedPathCount >= MAX_ENUMERATED_FRAGMENT_PATHS) {
			break;
		}
	}

	const routes = [...routeAccumulators.values()].sort((left, right) => {
		if (left.peerIds.length !== right.peerIds.length) {
			return right.peerIds.length - left.peerIds.length;
		}
		if (left.sourcePathCount !== right.sourcePathCount) {
			return right.sourcePathCount - left.sourcePathCount;
		}
		return left.id.localeCompare(right.id);
	});

	return {
		width:
			nodes.length > 0
				? padding * 2 + orderedDepths.length * nodeWidth + Math.max(0, orderedDepths.length - 1) * columnGap
				: nodeWidth + padding * 2,
		height: padding * 2 + drawableHeight,
		nodes,
		edges,
		routes,
		totalFragments: plan.fragments.length,
		resolvedFragments: resolvedFragmentPeers.size,
		observedFragments,
		plannedOnlyFragments,
		unresolvedFragments: Math.max(0, plan.fragments.length - resolvedFragmentPeers.size),
		crossPeerHandoffs,
		localHandoffs,
		routeEnumerationTruncated
	};
}
