'use client';

import '@xyflow/react/dist/style.css';

import { memo, useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
	Background,
	Controls,
	Handle,
	MarkerType,
	Position,
	ReactFlow,
	useNodesState,
	useReactFlow,
	type Edge,
	type Node,
	type NodeProps
} from '@xyflow/react';
import { CircleHelpIcon, GitBranchIcon } from 'lucide-react';

import { Badge, badgeVariants } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious
} from '@/components/ui/pagination';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
	buildPeerExecutionFlowModel,
	type PeerExecutionFlowModel
} from '@/lib/peer-flow-model';
import { shortFragmentId } from '@/lib/fragment-flow-format';
import { cn } from '@/lib/utils';
import type { RunFragmentResultSummary, RunPlanSummary } from '@/types/runs';

const PEER_FLOW_FIT_VIEW_OPTIONS = {
	padding: 0.2,
	minZoom: 0.18,
	maxZoom: 1.35,
	duration: 220
};

const ROUTES_PAGE_SIZE = 4;
const HANDOFFS_PAGE_SIZE = 4;

type PeerExecutionFlowSectionProps = {
	plan: RunPlanSummary | null;
	fragmentResults: RunFragmentResultSummary[];
};

type PeerFlowNodeData = {
	peerId: string;
	shortPeerId: string;
	fragmentCount: number;
	observedFragmentCount: number;
	plannedFragmentCount: number;
	incomingHandoffCount: number;
	outgoingHandoffCount: number;
	localHandoffCount: number;
	serviceTypeCount: number;
};

type PeerFlowNode = Node<PeerFlowNodeData, 'peer'>;

function buildPaginationPageItems(
	current: number,
	total: number
): Array<number | 'ellipsis'> {
	if (total <= 1) {
		return [1];
	}

	const pages = new Set<number>();
	pages.add(1);
	pages.add(total);

	for (let page = current - 1; page <= current + 1; page++) {
		if (page >= 1 && page <= total) {
			pages.add(page);
		}
	}

	const sortedPages = [...pages].sort((left, right) => left - right);
	const output: Array<number | 'ellipsis'> = [];

	for (let index = 0; index < sortedPages.length; index++) {
		const page = sortedPages[index];
		const previous = sortedPages[index - 1];

		if (index > 0 && previous !== undefined && page - previous > 1) {
			output.push('ellipsis');
		}

		output.push(page);
	}

	return output;
}

function InfoTooltip({
	content
}: {
	content: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type='button'
					aria-label='What does this mean?'
					className='text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-full transition-colors'
				>
					<CircleHelpIcon className='size-3.5' />
				</button>
			</TooltipTrigger>
			<TooltipContent
				side='top'
				sideOffset={8}
				className='max-w-sm text-xs leading-relaxed'
			>
				{content}
			</TooltipContent>
		</Tooltip>
	);
}

function MetricTooltipBadge({
	label,
	tooltip,
	variant = 'outline'
}: {
	label: string;
	tooltip: string;
	variant?: 'outline' | 'secondary';
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type='button'
					className={cn(badgeVariants({ variant }), 'cursor-help')}
				>
					{label}
				</button>
			</TooltipTrigger>
			<TooltipContent
				side='top'
				sideOffset={8}
				className='max-w-sm text-xs leading-relaxed'
			>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}

function ListPagination({
	page,
	pageCount,
	totalItems,
	itemLabel,
	ariaLabel,
	onPageChange
}: {
	page: number;
	pageCount: number;
	totalItems: number;
	itemLabel: string;
	ariaLabel: string;
	onPageChange: (next: number) => void;
}) {
	if (pageCount <= 1) {
		return null;
	}

	const pageItems = buildPaginationPageItems(page, pageCount);
	const stop = (event: MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault();
	};

	return (
		<div className='flex flex-col gap-3 border-t border-border/60 pt-3'>
			<p className='text-xs text-muted-foreground'>
				Page {page} of {pageCount} · {totalItems} {itemLabel}
			</p>
			<Pagination
				aria-label={ariaLabel}
				className='justify-start'
			>
				<PaginationContent className='flex-wrap gap-2'>
					<PaginationItem>
						<PaginationPrevious
							aria-disabled={page <= 1}
							className={cn(page <= 1 && 'pointer-events-none opacity-50')}
							href='#'
							onClick={event => {
								stop(event);
								if (page > 1) {
									onPageChange(page - 1);
								}
							}}
							text='Prev'
						/>
					</PaginationItem>
					{pageItems.map((item, index) =>
						item === 'ellipsis' ? (
							<PaginationItem key={`ellipsis-${index}`}>
								<PaginationEllipsis />
							</PaginationItem>
						) : (
							<PaginationItem key={item}>
								<PaginationLink
									href='#'
									isActive={item === page}
									size='icon'
									onClick={event => {
										stop(event);
										onPageChange(item);
									}}
								>
									{item}
								</PaginationLink>
							</PaginationItem>
						)
					)}
					<PaginationItem>
						<PaginationNext
							aria-disabled={page >= pageCount}
							className={cn(page >= pageCount && 'pointer-events-none opacity-50')}
							href='#'
							onClick={event => {
								stop(event);
								if (page < pageCount) {
									onPageChange(page + 1);
								}
							}}
							text='Next'
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}

function buildPeerFlowCoverageLabel(model: PeerExecutionFlowModel) {
	if (model.resolvedFragments === 0) {
		return 'No peer assignments yet';
	}

	if (model.plannedOnlyFragments === 0 && model.unresolvedFragments === 0) {
		return `Observed routing for ${model.observedFragments}/${model.totalFragments} fragments`;
	}

	if (model.observedFragments === 0) {
		return `Planned routing for ${model.plannedOnlyFragments}/${model.totalFragments} fragments`;
	}

	if (model.unresolvedFragments === 0) {
		return `Observed ${model.observedFragments}/${model.totalFragments}; planned fallback for ${model.plannedOnlyFragments}`;
	}

	return `Observed ${model.observedFragments}/${model.totalFragments}; ${model.unresolvedFragments} fragments still unassigned`;
}

const PeerFlowNodeComponent = memo(function PeerFlowNodeComponent({
	data
}: NodeProps<PeerFlowNode>) {
	const routeStateLabel =
		data.plannedFragmentCount === 0
			? 'Observed'
			: data.observedFragmentCount === 0
				? 'Planned'
				: 'Mixed';
	const routeStateClass =
		data.plannedFragmentCount === 0
			? 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-400/10 dark:text-emerald-200'
			: data.observedFragmentCount === 0
				? 'border-amber-300/60 bg-amber-500/10 text-amber-800 dark:border-amber-500/30 dark:bg-amber-400/10 dark:text-amber-100'
				: 'border-sky-300/60 bg-sky-500/10 text-sky-700 dark:border-sky-500/30 dark:bg-sky-400/10 dark:text-sky-100';

	return (
		<div className='w-[15.5rem] rounded-[1.85rem] border border-border/80 bg-card/95 p-4 shadow-[0_28px_70px_-42px_rgba(15,23,42,0.32)] backdrop-blur-xl'>
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
						Peer
					</div>
					<div className='mt-1 text-base font-semibold tracking-tight'>{data.shortPeerId}</div>
				</div>
				<span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium', routeStateClass)}>
					{routeStateLabel}
				</span>
			</div>

			<div className='mt-2 break-all font-mono text-[11px] leading-relaxed text-muted-foreground'>
				{data.peerId}
			</div>

			<div className='mt-4 grid grid-cols-2 gap-2'>
				<div className='rounded-2xl border border-border/60 bg-muted/30 px-3 py-2 text-xs'>
					<div className='uppercase tracking-[0.2em] text-muted-foreground'>Fragments</div>
					<div className='mt-1 font-semibold tabular-nums'>{data.fragmentCount}</div>
				</div>
				<div className='rounded-2xl border border-border/60 bg-muted/30 px-3 py-2 text-xs'>
					<div className='uppercase tracking-[0.2em] text-muted-foreground'>Services</div>
					<div className='mt-1 font-semibold tabular-nums'>{data.serviceTypeCount}</div>
				</div>
			</div>

			<div className='mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground'>
				<span>in {data.incomingHandoffCount}</span>
				<span>out {data.outgoingHandoffCount}</span>
				<span>local {data.localHandoffCount}</span>
			</div>
		</div>
	);
});

const peerFlowNodeTypes = {
	peer: PeerFlowNodeComponent
};

function FlowViewportSync({
	viewportKey,
	fitViewOptions
}: {
	viewportKey: string;
	fitViewOptions: typeof PEER_FLOW_FIT_VIEW_OPTIONS;
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

function buildPeerFlowNodes(model: PeerExecutionFlowModel) {
	return model.nodes.map<PeerFlowNode>(node => ({
		id: node.peerId,
		type: 'peer',
		position: { x: node.x, y: node.y },
		data: {
			peerId: node.peerId,
			shortPeerId: node.shortPeerId,
			fragmentCount: node.fragmentIds.length,
			observedFragmentCount: node.observedFragmentCount,
			plannedFragmentCount: node.plannedFragmentCount,
			incomingHandoffCount: node.incomingHandoffCount,
			outgoingHandoffCount: node.outgoingHandoffCount,
			localHandoffCount: node.localHandoffCount,
			serviceTypeCount: node.serviceTypes.length
		}
	}));
}

function buildPeerFlowEdges(model: PeerExecutionFlowModel) {
	return model.edges.map<Edge>(edge => ({
		id: edge.id,
		source: edge.sourcePeerId,
		target: edge.targetPeerId,
		type: 'simplebezier',
		label: edge.handoffCount === 1 ? '1 handoff' : `${edge.handoffCount} handoffs`,
		labelStyle: {
			fontSize: 11,
			fontWeight: 600,
			fill: 'var(--muted-foreground)'
		},
		labelBgPadding: [8, 5],
		labelBgBorderRadius: 999,
		labelBgStyle: {
			fill: 'rgba(248, 250, 252, 0.94)',
			stroke: 'rgba(148, 163, 184, 0.34)',
			strokeWidth: 1
		},
		animated: edge.handoffCount > 1,
		style: {
			stroke: edge.usesPlannedRouting ? 'rgba(217, 119, 6, 0.82)' : 'rgba(8, 145, 178, 0.82)',
			strokeWidth: 1.8 + Math.min(edge.handoffCount, 4) * 0.45,
			strokeDasharray: edge.usesPlannedRouting ? '9 6' : undefined
		},
		markerEnd: {
			type: MarkerType.ArrowClosed,
			width: 18,
			height: 18,
			color: edge.usesPlannedRouting ? 'rgba(217, 119, 6, 0.82)' : 'rgba(8, 145, 178, 0.82)'
		}
	}));
}

const PeerExecutionFlowCanvas = memo(function PeerExecutionFlowCanvas({
	model
}: {
	model: PeerExecutionFlowModel;
}) {
	const baseNodes = useMemo(() => buildPeerFlowNodes(model), [model]);
	const [nodes, setNodes, onNodesChange] = useNodesState<PeerFlowNode>(baseNodes);

	useEffect(() => {
		setNodes(currentNodes => {
			const currentById = new Map(currentNodes.map(node => [node.id, node]));
			return baseNodes.map(node => {
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
	}, [baseNodes, setNodes]);

	const edges = useMemo(() => buildPeerFlowEdges(model), [model]);

	return (
		<div className='relative overflow-hidden rounded-3xl border border-border/80 bg-muted/20'>
			<div className='flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/50 px-4 py-3'>
				<div>
					<div className='text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground'>
						Derived peer graph
					</div>
					<p className='mt-1 text-sm text-muted-foreground'>
						Each node is a peer. Each arrow represents a dependency handoff between peers.
					</p>
				</div>
				<div className='flex flex-wrap gap-2 text-xs text-muted-foreground'>
					<span className='rounded-full border border-border/70 px-3 py-1'>{model.nodes.length} peers</span>
					<span className='rounded-full border border-border/70 px-3 py-1'>{model.edges.length} routes between peers</span>
				</div>
			</div>
			<div className='relative h-[min(420px,max(320px,36vh))] w-full'>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={peerFlowNodeTypes}
					onNodesChange={onNodesChange}
					nodesDraggable
					panOnDrag
					nodesConnectable={false}
					selectionOnDrag={false}
					fitView
					fitViewOptions={PEER_FLOW_FIT_VIEW_OPTIONS}
					minZoom={0.18}
					maxZoom={1.35}
					proOptions={{ hideAttribution: true }}
					className='h-full w-full bg-transparent'
				>
					<FlowViewportSync
						viewportKey={`${model.width}:${model.height}:${model.nodes.length}:${model.edges.length}`}
						fitViewOptions={PEER_FLOW_FIT_VIEW_OPTIONS}
					/>
					<Background
						gap={24}
						size={1}
						color='rgba(148,163,184,0.16)'
					/>
					<Controls
						showInteractive={false}
						position='top-right'
					/>
				</ReactFlow>
			</div>
		</div>
	);
});

export function PeerExecutionFlowSection({
	plan,
	fragmentResults
}: PeerExecutionFlowSectionProps) {
	const model = useMemo(
		() => buildPeerExecutionFlowModel(plan, fragmentResults),
		[plan, fragmentResults]
	);
	const paginationScopeKey = `${plan?.planId ?? 'no-plan'}:${model?.routes.length ?? 0}:${model?.edges.length ?? 0}`;
	const [paginationState, setPaginationState] = useState(() => ({
		scopeKey: paginationScopeKey,
		routesPage: 1,
		handoffsPage: 1
	}));

	const routes = model?.routes ?? [];
	const handoffs = model?.edges ?? [];
	const routesPageCount = Math.max(1, Math.ceil(routes.length / ROUTES_PAGE_SIZE));
	const handoffsPageCount = Math.max(1, Math.ceil(handoffs.length / HANDOFFS_PAGE_SIZE));
	const rawRoutesPage = paginationState.scopeKey === paginationScopeKey ? paginationState.routesPage : 1;
	const rawHandoffsPage =
		paginationState.scopeKey === paginationScopeKey ? paginationState.handoffsPage : 1;
	const routesPage = Math.min(rawRoutesPage, routesPageCount);
	const handoffsPage = Math.min(rawHandoffsPage, handoffsPageCount);
	const visibleRoutes = routes.slice(
		(routesPage - 1) * ROUTES_PAGE_SIZE,
		routesPage * ROUTES_PAGE_SIZE
	);
	const visibleHandoffs = handoffs.slice(
		(handoffsPage - 1) * HANDOFFS_PAGE_SIZE,
		handoffsPage * HANDOFFS_PAGE_SIZE
	);

	const setRoutesPage = (nextPage: number) =>
		setPaginationState(current => ({
			scopeKey: paginationScopeKey,
			routesPage: Math.max(1, nextPage),
			handoffsPage: current.scopeKey === paginationScopeKey ? current.handoffsPage : 1
		}));

	const setHandoffsPage = (nextPage: number) =>
		setPaginationState(current => ({
			scopeKey: paginationScopeKey,
			routesPage: current.scopeKey === paginationScopeKey ? current.routesPage : 1,
			handoffsPage: Math.max(1, nextPage)
		}));

	return (
		<TooltipProvider delayDuration={120}>
			<Card className='shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'>
				<CardHeader className='border-b border-border/80'>
					<div className='flex items-start gap-3'>
						<div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'>
							<GitBranchIcon className='size-5' />
						</div>
						<div className='min-w-0 flex-1 space-y-1'>
							<div className='flex items-center gap-2'>
								<CardTitle>Peer execution flow</CardTitle>
								<InfoTooltip content='This is a peer-level view derived from the fragment DAG. We merge fragments by the peer that executed them, then draw arrows only where a dependency crosses from one peer to another.' />
							</div>
							<CardDescription>
								Collapses fragment execution into peer-to-peer routing so you can see how the circuit moved across the network.
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='space-y-6 pt-6'>
					{!plan ? (
						<p className='text-sm text-muted-foreground'>
							The execution plan is not available yet, so the peer graph cannot be derived.
						</p>
					) : !model || model.nodes.length === 0 ? (
						<p className='text-sm text-muted-foreground'>
							Peer assignments have not been published yet for this run.
						</p>
					) : (
						<>
							<div className='flex flex-wrap gap-2'>
								<MetricTooltipBadge
									label={`${model.nodes.length} peers`}
									tooltip='Unique peers that participated in the execution, based on observed runtime node IDs when available and planned primary peers otherwise.'
								/>
								<MetricTooltipBadge
									label={`${model.crossPeerHandoffs} cross-peer handoffs`}
									tooltip='Dependency links where one fragment ran on one peer and the dependent fragment ran on a different peer.'
								/>
								<MetricTooltipBadge
									label={`${model.localHandoffs} local handoffs`}
									tooltip='Dependency links that stayed on the same peer, so the next fragment did not need to move across the network.'
								/>
								<MetricTooltipBadge
									label={buildPeerFlowCoverageLabel(model)}
									tooltip='Observed routing means the graph is using actual runtime node IDs from fragment results. If a fragment has not executed yet, the view falls back to the planned primary peer.'
									variant='secondary'
								/>
							</div>

							<PeerExecutionFlowCanvas model={model} />

							<div className='grid gap-4 xl:grid-cols-2'>
								<div className='rounded-3xl border border-border/80 bg-muted/20 p-4'>
									<div className='mb-3'>
										<div className='flex items-center gap-2'>
											<h3 className='text-sm font-semibold tracking-tight'>Distinct peer routes</h3>
											<InfoTooltip content='A peer route is a root-to-leaf execution path with consecutive fragments on the same peer merged together. It answers “which peers did this branch of the circuit pass through?”' />
										</div>
										<p className='mt-1 text-xs text-muted-foreground'>
											Root-to-leaf fragment paths collapsed down to peers.
										</p>
									</div>
									<div className='space-y-3'>
										{routes.length ? (
											visibleRoutes.map(route => (
												<div
													key={route.id}
													className='rounded-3xl border border-border/80 bg-card px-4 py-3 shadow-sm'
												>
													<div className='flex flex-wrap items-center gap-2'>
														{route.peerIds.map((peerId, index) => (
															<div
																key={`${route.id}-${peerId}-${index}`}
																className='flex items-center gap-2'
															>
																<span
																	className='rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium'
																	title={peerId}
																>
																	{shortFragmentId(peerId, 9, 4)}
																</span>
																{index < route.peerIds.length - 1 ? (
																	<span className='text-muted-foreground text-xs'>→</span>
																) : null}
															</div>
														))}
														{route.usesPlannedRouting ? (
															<Badge variant='secondary'>mixed planned/observed</Badge>
														) : null}
													</div>
													<p className='mt-2 text-xs text-muted-foreground'>
														{route.sourcePathCount === 1
															? '1 fragment path maps to this peer route.'
															: `${route.sourcePathCount} fragment paths map to this peer route.`}
													</p>
													<p className='mt-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground'>
														Fragments:{' '}
														{route.fragmentIds
															.map(fragmentId => shortFragmentId(fragmentId, 10, 4))
															.join(' → ')}
													</p>
												</div>
											))
										) : (
											<p className='text-sm text-muted-foreground'>
												No root-to-leaf peer routes are available yet.
											</p>
										)}
									</div>
									<ListPagination
										page={routesPage}
										pageCount={routesPageCount}
										totalItems={routes.length}
										itemLabel='peer routes'
										ariaLabel='Distinct peer routes pagination'
										onPageChange={setRoutesPage}
									/>
								</div>

								<div className='rounded-3xl border border-border/80 bg-muted/20 p-4'>
									<div className='mb-3'>
										<div className='flex items-center gap-2'>
											<h3 className='text-sm font-semibold tracking-tight'>Cross-peer handoffs</h3>
											<InfoTooltip content='A cross-peer handoff happens when a fragment completes on one peer and a dependent fragment executes on another peer. This is the network movement between peers.' />
										</div>
										<p className='mt-1 text-xs text-muted-foreground'>
											Dependency edges where execution moved from one peer to another.
										</p>
									</div>
									<div className='space-y-3'>
										{handoffs.length ? (
											visibleHandoffs.map(edge => (
												<div
													key={edge.id}
													className='rounded-3xl border border-border/80 bg-card px-4 py-3 shadow-sm'
												>
													<div className='flex flex-wrap items-center gap-2'>
														<span
															className='rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium'
															title={edge.sourcePeerId}
														>
															{shortFragmentId(edge.sourcePeerId, 9, 4)}
														</span>
														<span className='text-muted-foreground text-xs'>→</span>
														<span
															className='rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium'
															title={edge.targetPeerId}
														>
															{shortFragmentId(edge.targetPeerId, 9, 4)}
														</span>
														<Badge variant='outline'>
															{edge.handoffCount === 1 ? '1 handoff' : `${edge.handoffCount} handoffs`}
														</Badge>
														{edge.usesPlannedRouting ? (
															<Badge variant='secondary'>mixed planned/observed</Badge>
														) : null}
													</div>
													<div className='mt-2 flex flex-wrap gap-2'>
														{edge.fragmentPairs.map(pair => (
															<span
																key={`${edge.id}-${pair.fromFragmentId}-${pair.toFragmentId}`}
																className='rounded-full border border-border/70 bg-muted/30 px-3 py-1 font-mono text-[11px] text-muted-foreground'
															>
																{shortFragmentId(pair.fromFragmentId, 10, 4)} →{' '}
																{shortFragmentId(pair.toFragmentId, 10, 4)}
															</span>
														))}
													</div>
												</div>
											))
										) : (
											<p className='text-sm text-muted-foreground'>
												All fragment dependencies stayed on the same peer.
											</p>
										)}
									</div>
									<ListPagination
										page={handoffsPage}
										pageCount={handoffsPageCount}
										totalItems={handoffs.length}
										itemLabel='cross-peer handoffs'
										ariaLabel='Cross-peer handoffs pagination'
										onPageChange={setHandoffsPage}
									/>
								</div>
							</div>

							{model.routeEnumerationTruncated ? (
								<p className='text-xs text-muted-foreground'>
									Showing the first derived routes for readability. Larger DAGs may collapse additional peer paths not listed here.
								</p>
							) : null}
						</>
					)}
				</CardContent>
			</Card>
		</TooltipProvider>
	);
}
