import { formatFragmentServiceLabel } from '@/lib/fragment-flow-format';
import type { RunFragmentResultSummary, RunPlanSummary } from '@/types/runs';

export type FragmentDagNode = {
	fragmentId: string;
	serviceType: string;
	label: string;
	qubits: number[];
	dependencies: string[];
	depth: number;
	x: number;
	y: number;
	width: number;
	height: number;
	primaryNodeId: string | null;
	fallbackNodeIds: string[];
	status: string | null;
	observedFidelity: number | null;
};

export type FragmentDagEdge = {
	from: string;
	to: string;
	path: string;
};

export type FragmentDagModel = {
	width: number;
	height: number;
	nodes: FragmentDagNode[];
	edges: FragmentDagEdge[];
};

/**
 * Topological depth layout + dependency edges, matching the legacy Vite dashboard DAG.
 */
export function buildFragmentDagModel(
	plan: RunPlanSummary | null,
	fragmentResults: RunFragmentResultSummary[]
): FragmentDagModel | null {
	if (!plan) {
		return null;
	}

	const resultByFragment = new Map(fragmentResults.map(result => [result.fragmentId, result]));
	const depthCache = new Map<string, number>();

	const fragmentsById = new Map(plan.fragments.map(f => [f.fragmentId, f]));

	const getDepth = (fragmentId: string): number => {
		const cachedDepth = depthCache.get(fragmentId);
		if (cachedDepth !== undefined) {
			return cachedDepth;
		}

		const fragment = fragmentsById.get(fragmentId);
		if (!fragment || fragment.dependencies.length === 0) {
			depthCache.set(fragmentId, 0);
			return 0;
		}

		const depth =
			Math.max(...fragment.dependencies.map(dependency => getDepth(dependency))) + 1;
		depthCache.set(fragmentId, depth);
		return depth;
	};

	const fragmentsByDepth = new Map<number, string[]>();
	for (const fragmentId of plan.fragmentOrder) {
		const depth = getDepth(fragmentId);
		fragmentsByDepth.set(depth, [...(fragmentsByDepth.get(depth) ?? []), fragmentId]);
	}

	const depths = [...fragmentsByDepth.keys()].sort((left, right) => left - right);
	const maxRows = Math.max(...depths.map(depth => fragmentsByDepth.get(depth)?.length ?? 0));

	const nodeWidth = 284;
	const nodeHeight = 132;
	const columnGap = 104;
	const rowGap = 44;
	const padding = 48;
	const drawableHeight = maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap;

	const nodes: FragmentDagNode[] = [];
	for (const depth of depths) {
		const fragmentIds = fragmentsByDepth.get(depth) ?? [];
		const columnHeight =
			fragmentIds.length * nodeHeight + Math.max(0, fragmentIds.length - 1) * rowGap;
		const startY = padding + (drawableHeight - columnHeight) / 2;

		fragmentIds.forEach((fragmentId, index) => {
			const fragment = fragmentsById.get(fragmentId);
			if (!fragment) {
				return;
			}

			const runtimeResult = resultByFragment.get(fragmentId);

			nodes.push({
				fragmentId,
				serviceType: fragment.serviceType,
				label: formatFragmentServiceLabel(fragment.serviceType),
				qubits: [...fragment.qubits],
				dependencies: [...fragment.dependencies],
				depth,
				x: padding + depth * (nodeWidth + columnGap),
				y: startY + index * (nodeHeight + rowGap),
				width: nodeWidth,
				height: nodeHeight,
				primaryNodeId: fragment.primaryNodeId,
				fallbackNodeIds: [...fragment.fallbackNodeIds],
				status: runtimeResult?.status ?? null,
				observedFidelity: runtimeResult?.observedFidelityRatio ?? null
			});
		});
	}

	const nodesById = Object.fromEntries(nodes.map(node => [node.fragmentId, node]));
	const edges: FragmentDagEdge[] = [];
	for (const node of nodes) {
		for (const dependencyId of node.dependencies) {
			const dependency = nodesById[dependencyId];
			if (!dependency) {
				continue;
			}

			const fromX = dependency.x + dependency.width;
			const fromY = dependency.y + dependency.height / 2;
			const toX = node.x;
			const toY = node.y + node.height / 2;
			const bend = Math.max(48, (toX - fromX) / 2);

			edges.push({
				from: dependencyId,
				to: node.fragmentId,
				path: `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`
			});
		}
	}

	return {
		width: padding * 2 + depths.length * nodeWidth + Math.max(0, depths.length - 1) * columnGap,
		height: padding * 2 + drawableHeight,
		nodes,
		edges
	};
}
