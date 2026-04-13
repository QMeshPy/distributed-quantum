'use client';

import '@xyflow/react/dist/style.css';

import { memo, useEffect, useMemo } from 'react';
import {
	Background,
	Controls,
	Handle,
	MiniMap,
	Position,
	ReactFlow,
	useNodesState,
	useReactFlow,
	type Edge,
	type Node,
	type NodeProps
} from '@xyflow/react';

import type { FragmentDagModel } from '@/lib/fragment-dag-model';
import {
	formatFragmentPercent,
	formatFragmentServiceLabel,
	FRAGMENT_SERVICE_STYLES,
	shortFragmentId
} from '@/lib/fragment-flow-format';
import { cn } from '@/lib/utils';

const DAG_FIT_VIEW_OPTIONS = {
	padding: 0.24,
	minZoom: 0.04,
	maxZoom: 1.4,
	duration: 240
};

type DagFragmentNodeData = {
	fragmentId: string;
	label: string;
	serviceType: string;
	qubits: number[];
	primaryNodeId: string | null;
	fallbackCount: number;
	status: string | null;
	observedFidelity: number | null;
	dependencyCount: number;
	isFocused: boolean;
};

type DagFragmentFlowNode = Node<DagFragmentNodeData, 'fragment'>;

const DagFragmentNodeComponent = memo(function DagFragmentNodeComponent({
	data,
	selected
}: NodeProps<DagFragmentFlowNode>) {
	const style = FRAGMENT_SERVICE_STYLES[data.serviceType] ?? FRAGMENT_SERVICE_STYLES.bell_pair;
	const isActive = selected || data.isFocused;
	const statusLabel =
		data.status === 'SUCCESS'
			? 'Completed'
			: data.status === 'FAILED'
				? 'Failed'
				: (data.status ?? 'Pending');
	const statusClass =
		data.status === 'SUCCESS'
			? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200'
			: data.status === 'FAILED'
				? 'border-rose-300/60 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:bg-rose-400/10 dark:text-rose-200'
				: 'border-slate-300/60 bg-slate-500/10 text-slate-700 dark:border-slate-500/30 dark:bg-slate-400/10 dark:text-slate-200';

	return (
		<div
			className={cn(
				'w-[17.75rem] rounded-[1.85rem] border p-4 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.36)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1',
				isActive
					? 'border-primary/40 bg-card/95 dark:border-primary/30'
					: 'border-border/80 bg-card/90'
			)}
			style={{
				boxShadow: isActive ? `0 30px 72px -42px ${style.glow}` : undefined
			}}
		>
			<Handle
				type='target'
				position={Position.Left}
				className='!h-2.5 !w-2.5 !border-0 !bg-transparent'
			/>
			<Handle
				type='source'
				position={Position.Right}
				className='!h-2.5 !w-2.5 !border-0 !bg-transparent'
			/>
			<div className='flex items-start justify-between gap-3'>
				<div className='min-w-0 flex-1'>
					<div className='text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground'>
						{data.fragmentId}
					</div>
					<div className='mt-1 text-base font-semibold tracking-tight'>{data.label}</div>
				</div>
				<span className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium', statusClass)}>
					{statusLabel}
				</span>
			</div>

			<div className='mt-4 flex flex-wrap items-center gap-2'>
				<span
					className='rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em]'
					style={{
						color: style.text,
						borderColor: style.stroke,
						backgroundColor: style.fill
					}}
				>
					{formatFragmentServiceLabel(data.serviceType)}
				</span>
				<span className='rounded-full border border-border/60 px-2.5 py-1 text-[10px] font-medium text-muted-foreground'>
					q{data.qubits.join(', ')}
				</span>
			</div>

			<div className='mt-4 grid grid-cols-2 gap-2'>
				<div className='rounded-2xl border border-border/60 bg-muted/30 px-3 py-2 text-xs'>
					<div className='uppercase tracking-[0.2em] text-muted-foreground'>Route</div>
					<div className='mt-1 font-semibold'>
						{data.primaryNodeId ? shortFragmentId(data.primaryNodeId, 8, 4) : '--'}
					</div>
				</div>
				<div className='rounded-2xl border border-border/60 bg-muted/30 px-3 py-2 text-xs'>
					<div className='uppercase tracking-[0.2em] text-muted-foreground'>Observed</div>
					<div className='mt-1 font-semibold'>{formatFragmentPercent(data.observedFidelity)}</div>
				</div>
			</div>

			<div className='mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>
				<span>{data.dependencyCount} incoming edges</span>
				<span>{data.fallbackCount} fallbacks</span>
			</div>
		</div>
	);
});

const dagNodeTypes = {
	fragment: DagFragmentNodeComponent
};

function FlowViewportSync({
	viewportKey,
	fitViewOptions
}: {
	viewportKey: string;
	fitViewOptions: typeof DAG_FIT_VIEW_OPTIONS;
}) {
	const { fitView } = useReactFlow();

	useEffect(() => {
		const frame = window.requestAnimationFrame(() => {
			void fitView(fitViewOptions);
		});
		return () => window.cancelAnimationFrame(frame);
	}, [fitView, fitViewOptions, viewportKey]);

	return null;
}

function buildDagFlowNodes({
	dagModel,
	selectedFragmentId
}: {
	dagModel: FragmentDagModel;
	selectedFragmentId: string | null;
}) {
	return dagModel.nodes.map<DagFragmentFlowNode>(node => ({
		id: node.fragmentId,
		type: 'fragment',
		position: { x: node.x, y: node.y },
		draggable: true,
		data: {
			fragmentId: node.fragmentId,
			label: node.label,
			serviceType: node.serviceType,
			qubits: node.qubits,
			primaryNodeId: node.primaryNodeId,
			fallbackCount: node.fallbackNodeIds.length,
			status: node.status,
			observedFidelity: node.observedFidelity,
			dependencyCount: node.dependencies.length,
			isFocused: selectedFragmentId === node.fragmentId
		}
	}));
}

function buildDagFlowEdges({
	dagModel,
	selectedFragmentId
}: {
	dagModel: FragmentDagModel;
	selectedFragmentId: string | null;
}) {
	const nodeById = new Map(dagModel.nodes.map(n => [n.fragmentId, n]));

	return dagModel.edges.map<Edge>(edge => {
		const sourceNode = nodeById.get(edge.from);
		const sourceStyle =
			FRAGMENT_SERVICE_STYLES[sourceNode?.serviceType ?? 'bell_pair'] ??
			FRAGMENT_SERVICE_STYLES.bell_pair;
		const isFocused =
			selectedFragmentId !== null &&
			(selectedFragmentId === edge.from || selectedFragmentId === edge.to);

		return {
			id: `dag-edge-${edge.from}-${edge.to}`,
			source: edge.from,
			target: edge.to,
			type: 'simplebezier',
			animated: isFocused,
			style: {
				stroke: isFocused ? sourceStyle.stroke : 'rgba(71, 85, 105, 0.32)',
				strokeWidth: isFocused ? 2.8 : 1.8,
				strokeDasharray: isFocused ? undefined : '10 8'
			}
		};
	});
}

export type FragmentFlowCanvasProps = {
	dagModel: FragmentDagModel | null;
	selectedFragmentId: string | null;
	onSelectFragment: (fragmentId: string) => void;
	/** Compact canvas for embedding on run detail. */
	variant?: 'default' | 'embed';
	className?: string;
};

export const FragmentFlowCanvas = memo(function FragmentFlowCanvas({
	dagModel,
	selectedFragmentId,
	onSelectFragment,
	variant = 'default',
	className
}: FragmentFlowCanvasProps) {
	const isEmbed = variant === 'embed';
	const baseFlowNodes = useMemo(
		() => (dagModel ? buildDagFlowNodes({ dagModel, selectedFragmentId }) : []),
		[dagModel, selectedFragmentId]
	);
	const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<DagFragmentFlowNode>(baseFlowNodes);

	useEffect(() => {
		setFlowNodes(currentNodes => {
			const currentById = new Map(currentNodes.map(node => [node.id, node]));

			return baseFlowNodes.map(node => {
				const currentNode = currentById.get(node.id);
				if (!currentNode) {
					return node;
				}

				return {
					...node,
					position: currentNode.position
				};
			});
		});
	}, [baseFlowNodes, setFlowNodes]);

	const flowEdges = useMemo(
		() => (dagModel ? buildDagFlowEdges({ dagModel, selectedFragmentId }) : []),
		[dagModel, selectedFragmentId]
	);

	if (!dagModel) {
		return null;
	}

	return (
		<div
			className={cn(
				'relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-muted/20',
				/* Embed sits in CardContent (not a flex parent): React Flow needs a definite height — flex-1 collapses to 0. */
				isEmbed ? 'w-full' : 'min-h-[min(560px,calc(100dvh-14rem))] flex-1',
				className
			)}
		>
			<div
				className={cn(
					'flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/40 px-4',
					isEmbed ? 'py-2' : 'py-3'
				)}
			>
				<div>
					<div className='text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground'>
						Generated fragment DAG
					</div>
					<p
						className={cn(
							'text-muted-foreground',
							isEmbed ? 'mt-0.5 text-xs' : 'mt-1 text-sm'
						)}
					>
						{isEmbed
							? 'Pan, zoom, and click fragments to highlight them. Use Open fragment flow for full analytics.'
							: 'Drag nodes and pan the canvas. Click a fragment for details.'}
					</p>
				</div>
				<div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
					<span className='rounded-full border border-border/70 px-3 py-1'>{dagModel.nodes.length} fragments</span>
					<span className='rounded-full border border-border/70 px-3 py-1'>{dagModel.edges.length} edges</span>
				</div>
			</div>
			<div
				className={cn(
					'relative w-full',
					isEmbed ? 'h-[min(360px,max(280px,32vh))] shrink-0' : 'min-h-[480px] flex-1'
				)}
			>
				<ReactFlow
					nodes={flowNodes}
					edges={flowEdges}
					nodeTypes={dagNodeTypes}
					onNodesChange={onNodesChange}
					nodesDraggable
					panOnDrag
					nodesConnectable={false}
					selectionOnDrag={false}
					fitView
					fitViewOptions={DAG_FIT_VIEW_OPTIONS}
					minZoom={0.04}
					maxZoom={1.4}
					proOptions={{ hideAttribution: true }}
					onNodeClick={(_, node) => {
						if (node.type === 'fragment') {
							onSelectFragment(node.id);
						}
					}}
					className='h-full w-full bg-transparent'
				>
					<FlowViewportSync
						viewportKey={`${dagModel.width}:${dagModel.height}:${dagModel.nodes.length}:${dagModel.edges.length}:${variant}`}
						fitViewOptions={DAG_FIT_VIEW_OPTIONS}
					/>
					<Background
						gap={isEmbed ? 22 : 26}
						size={1}
						color='rgba(148,163,184,0.16)'
					/>
					<Controls
						showInteractive={false}
						position='top-right'
					/>
					{isEmbed ? null : (
						<MiniMap
							position='bottom-left'
							pannable
							zoomable
							nodeColor={n => {
								const svc = (n.data as DagFragmentNodeData | undefined)?.serviceType;
								return (
									FRAGMENT_SERVICE_STYLES[svc ?? 'bell_pair']?.stroke ?? 'var(--primary)'
								);
							}}
						/>
					)}
				</ReactFlow>
			</div>
		</div>
	);
});
