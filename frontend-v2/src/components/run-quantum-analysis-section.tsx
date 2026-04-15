'use client';

import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	XAxis,
	YAxis
} from 'recharts';
import {
	BinaryIcon,
	CpuIcon,
	GaugeIcon,
	OrbitIcon,
	RefreshCcwIcon,
	SparklesIcon
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle
} from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRunQuantumFullDetail } from '@/hooks/use-run-quantum-full-detail';
import type { FinancialAnalysisResult } from '@/types/financial';
import type { RunDetail, RunMeasurementBucket, RunQuantumSummary } from '@/types/runs';

const LazyBlochSphere = lazy(() =>
	import('@/components/bloch-sphere').then(m => ({ default: m.BlochSphere }))
);

const ANALYSIS_CHART_PAGE_SIZE = 24;
const BLOCH_PAGE_SIZE = 4;
const ENTROPY_PAGE_SIZE = 8;
const STATEVECTOR_PAGE_SIZE = 24;
const DENSITY_MATRIX_PAGE_SIZE = 4;

const measurementChartConfig = {
	value: { label: 'Value', color: 'var(--chart-1)' }
} satisfies ChartConfig;

const observableChartConfig = {
	value: { label: 'Expectation', color: 'var(--chart-2)' }
} satisfies ChartConfig;

function getPageCount(total: number, pageSize: number) {
	return Math.max(1, Math.ceil(Math.max(total, 1) / pageSize));
}

function getPageSlice<T>(items: T[], page: number, pageSize: number) {
	const start = (page - 1) * pageSize;
	return items.slice(start, start + pageSize);
}

function formatPercent(value: number | null | undefined) {
	if (value == null || Number.isNaN(value)) {
		return '—';
	}
	return `${(value * 100).toFixed(2)}%`;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | null {
	if (!record) {
		return null;
	}
	const v = record[key];
	return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
	if (!record) {
		return null;
	}
	const v = record[key];
	return typeof v === 'string' ? v : null;
}

function mapTopBasis(states: Array<Record<string, unknown>>) {
	return states.map(state => {
		const basis =
			typeof state.basis_state === 'string'
				? state.basis_state
				: typeof state.basisState === 'string'
					? state.basisState
					: String(state.basis_state ?? state.basisState ?? '?');
		const raw = state.probability ?? state.value;
		const value =
			typeof raw === 'number' && !Number.isNaN(raw) ? raw : Number(raw) || 0;
		return { state: basis, value };
	});
}

function bucketsToChartRows(buckets: RunMeasurementBucket[], labelKey: 'state' | 'observable') {
	return buckets.map(b => (labelKey === 'state' ? { state: b.key, value: b.value } : { observable: b.key, value: b.value }));
}

function SectionPagination({
	page,
	pageCount,
	totalItems,
	itemLabel,
	onPageChange
}: {
	page: number;
	pageCount: number;
	totalItems: number;
	itemLabel: string;
	onPageChange: (page: number) => void;
}) {
	if (pageCount <= 1) {
		return null;
	}

	return (
		<div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
			<span className='tabular-nums'>
				Page {page} of {pageCount} · {totalItems} {itemLabel}
			</span>
			<div className='flex gap-2'>
				<Button
					type='button'
					size='sm'
					variant='outline'
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
				>
					Previous
				</Button>
				<Button
					type='button'
					size='sm'
					variant='outline'
					disabled={page >= pageCount}
					onClick={() => onPageChange(page + 1)}
				>
					Next
				</Button>
			</div>
		</div>
	);
}

function AnalysisChartCard({
	title,
	subtitle,
	data,
	emptyMessage,
	config,
	dataKey,
	labelKey,
	fill,
	valueFormatter
}: {
	title: string;
	subtitle: string;
	data: Array<Record<string, number | string>>;
	emptyMessage: string;
	config: ChartConfig;
	dataKey: string;
	labelKey: string;
	fill: string;
	valueFormatter: (value: number) => string;
}) {
	return (
		<div className='rounded-3xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
			<div className='mb-4'>
				<p className='text-sm font-medium'>{title}</p>
				<p className='text-sm text-muted-foreground'>{subtitle}</p>
			</div>
			{data.length > 0 ? (
				<ChartContainer
					className='h-[16rem] w-full'
					config={config}
				>
					<BarChart
						data={data}
						margin={{ left: 8, right: 12, top: 8 }}
					>
						<CartesianGrid
							vertical={false}
							strokeDasharray='3 6'
						/>
						<XAxis dataKey={labelKey} />
						<YAxis />
						<ChartTooltip
							cursor={false}
							content={<ChartTooltipContent indicator='line' />}
							formatter={value => valueFormatter(Number(value))}
						/>
						<Bar
							dataKey={dataKey}
							fill={fill}
							radius={[10, 10, 2, 2]}
						/>
					</BarChart>
				</ChartContainer>
			) : (
				<Empty className='min-h-[12rem] border border-dashed border-border/80'>
					<EmptyHeader>
						<EmptyMedia variant='icon'>
							<GaugeIcon />
						</EmptyMedia>
						<EmptyTitle>{title}</EmptyTitle>
						<EmptyDescription>{emptyMessage}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

function ProgressStat({ label, value }: { label: string; value: number | null }) {
	return (
		<div className='space-y-2'>
			<div className='flex items-center justify-between gap-3 text-sm'>
				<span className='font-medium'>{label}</span>
				<span className='font-mono'>{formatPercent(value)}</span>
			</div>
			<Progress
				value={Math.max(0, Math.min(100, (value ?? 0) * 100))}
				className='h-2'
			/>
		</div>
	);
}

function AxisMeter({ label, value, color }: { label: string; value: number; color: string }) {
	return (
		<div className='space-y-2'>
			<div className='flex items-center justify-between gap-3 text-xs tracking-wide text-muted-foreground uppercase'>
				<span>{label}</span>
				<span className='font-mono text-foreground/80'>{value.toFixed(3)}</span>
			</div>
			<div className='h-2 rounded-full bg-muted/80 dark:bg-muted/50'>
				<div
					className='h-full rounded-full transition-[width]'
					style={{
						width: `${Math.max(0, Math.min(100, ((value + 1) / 2) * 100))}%`,
						backgroundColor: color
					}}
				/>
			</div>
		</div>
	);
}

function MiniDataCard({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
	return (
		<div className='rounded-2xl border border-border/80 bg-card/80 p-4 shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10'>
			<p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>{label}</p>
			<p className='mt-2 text-sm font-semibold'>{value}</p>
			<p className='text-muted-foreground mt-1 text-xs leading-relaxed'>{detail}</p>
		</div>
	);
}

export type RunQuantumAnalysisSectionProps = {
	runId: string;
	run: RunDetail;
	quantum: RunQuantumSummary | null;
	planQualitySnapshotId: string | null;
	/** When `financial`, charts map financial metrics and deep tabs skip quantum statevector fetch. */
	variant?: 'quantum' | 'financial';
	financialResult?: FinancialAnalysisResult | null;
};

export function RunQuantumAnalysisSection({
	runId,
	run,
	quantum,
	planQualitySnapshotId,
	variant = 'quantum',
	financialResult = null
}: RunQuantumAnalysisSectionProps) {
	const isFinancial = variant === 'financial';
	const [analysisSurface, setAnalysisSurface] = useState<'measurements' | 'geometry' | 'deep'>('measurements');
	const [deepDataView, setDeepDataView] = useState<'metadata' | 'statevector' | 'density'>('metadata');
	const [countsPage, setCountsPage] = useState(1);
	const [measuredProbabilityPage, setMeasuredProbabilityPage] = useState(1);
	const [blochPage, setBlochPage] = useState(1);
	const [entropyPage, setEntropyPage] = useState(1);
	const [statevectorPage, setStatevectorPage] = useState(1);
	const [densityMatrixPage, setDensityMatrixPage] = useState(1);

	const isCompleted = run.backendStatus === 'COMPLETED';
	const needDeepPayload =
		!isFinancial && analysisSurface === 'deep' && deepDataView !== 'metadata' && isCompleted;
	const { data: deepData, loading: isDeepLoading, error: deepError } = useRunQuantumFullDetail(
		runId,
		needDeepPayload
	);

	const countsData = useMemo(
		() => bucketsToChartRows(quantum?.countBuckets ?? [], 'state'),
		[quantum?.countBuckets]
	);
	const measuredProbabilityData = useMemo(
		() =>
			(quantum?.measuredProbabilities ?? []).map(b => ({
				state: b.key,
				value: b.value
			})),
		[quantum?.measuredProbabilities]
	);
	const observableData = useMemo(
		() => bucketsToChartRows(quantum?.observableExpectations ?? [], 'observable'),
		[quantum?.observableExpectations]
	);
	const topBasisData = useMemo(() => mapTopBasis(quantum?.topBasisStates ?? []), [quantum?.topBasisStates]);

	const blochData = useMemo(() => {
		const raw = quantum?.blochVectors;
		if (!raw) {
			return [];
		}
		const num = (v: unknown) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
		return Object.entries(raw)
			.map(([qubit, vector]) => {
				const rec = vector as Record<string, unknown>;
				return {
					qubit,
					x: num(rec.x ?? rec.X ?? 0),
					y: num(rec.y ?? rec.Y ?? 0),
					z: num(rec.z ?? rec.Z ?? 0)
				};
			})
			.sort((a, b) => {
				const idxA = Number.parseInt(a.qubit.replace(/^q/, ''), 10);
				const idxB = Number.parseInt(b.qubit.replace(/^q/, ''), 10);
				if (!Number.isNaN(idxA) && !Number.isNaN(idxB)) {
					return idxA - idxB;
				}
				return String(a.qubit).localeCompare(String(b.qubit));
			});
	}, [quantum?.blochVectors]);

	const entropyData = useMemo(
		() =>
			(quantum?.entanglementEntropy ?? []).map(b => ({
				label: b.key,
				value: typeof b.value === 'number' && !Number.isNaN(b.value) ? b.value : 0
			})),
		[quantum?.entanglementEntropy]
	);

	const allEntropyZero =
		entropyData.length > 0 && entropyData.every(entry => entry.value === 0);

	const countsPageCount = getPageCount(countsData.length, ANALYSIS_CHART_PAGE_SIZE);
	const measuredProbabilityPageCount = getPageCount(
		measuredProbabilityData.length,
		ANALYSIS_CHART_PAGE_SIZE
	);
	const blochPageCount = getPageCount(blochData.length, BLOCH_PAGE_SIZE);
	const entropyPageCount = getPageCount(entropyData.length, ENTROPY_PAGE_SIZE);

	const visibleCountsData = getPageSlice(countsData, countsPage, ANALYSIS_CHART_PAGE_SIZE);
	const visibleMeasuredProbabilityData = getPageSlice(
		measuredProbabilityData,
		measuredProbabilityPage,
		ANALYSIS_CHART_PAGE_SIZE
	);
	const visibleBlochData = getPageSlice(blochData, blochPage, BLOCH_PAGE_SIZE);
	const visibleEntropyData = getPageSlice(entropyData, entropyPage, ENTROPY_PAGE_SIZE);

	const statevectorValues = deepData?.statevector ?? [];
	const statevectorPageCount = getPageCount(statevectorValues.length, STATEVECTOR_PAGE_SIZE);
	const statevectorStartIndex = (statevectorPage - 1) * STATEVECTOR_PAGE_SIZE;
	const statevectorRows = useMemo(() => {
		if (!statevectorValues.length) {
			return [];
		}
		const qubitWidth = Math.max(1, Math.round(Math.log2(statevectorValues.length)));
		return statevectorValues
			.slice(statevectorStartIndex, statevectorStartIndex + STATEVECTOR_PAGE_SIZE)
			.map((amplitude, index) => ({
				basisState: (statevectorStartIndex + index).toString(2).padStart(qubitWidth, '0'),
				amplitude
			}));
	}, [statevectorStartIndex, statevectorValues]);

	const densityMatrixEntries = useMemo(
		() => Object.entries(deepData?.reducedDensityMatrices ?? {}),
		[deepData?.reducedDensityMatrices]
	);
	const densityMatrixPageCount = getPageCount(densityMatrixEntries.length, DENSITY_MATRIX_PAGE_SIZE);
	const visibleDensityMatrixEntries = getPageSlice(
		densityMatrixEntries,
		densityMatrixPage,
		DENSITY_MATRIX_PAGE_SIZE
	);

	useEffect(() => {
		setCountsPage(p => Math.min(p, countsPageCount));
	}, [countsPageCount]);
	useEffect(() => {
		setMeasuredProbabilityPage(p => Math.min(p, measuredProbabilityPageCount));
	}, [measuredProbabilityPageCount]);
	useEffect(() => {
		setBlochPage(p => Math.min(p, blochPageCount));
	}, [blochPageCount]);
	useEffect(() => {
		setEntropyPage(p => Math.min(p, entropyPageCount));
	}, [entropyPageCount]);
	useEffect(() => {
		setStatevectorPage(p => Math.min(p, statevectorPageCount));
	}, [statevectorPageCount]);
	useEffect(() => {
		setDensityMatrixPage(p => Math.min(p, densityMatrixPageCount));
	}, [densityMatrixPageCount]);

	const fidelityRecord = quantum?.fidelity ?? null;

	if (!quantum) {
		return (
			<Card className='shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'>
				<CardHeader className='border-b border-border/80'>
					<div className='flex items-start gap-3'>
						<div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
							<SparklesIcon className='size-5' />
						</div>
						<div className='min-w-0 space-y-1'>
							<CardTitle>{isFinancial ? 'Analysis result surfaces' : 'Quantum result surfaces'}</CardTitle>
							<CardDescription>
								{isFinancial
									? 'Financial metrics map into the same panels as circuit jobs once the coordinator finishes the CSV pipeline.'
									: 'Heavy result views stay split into focused panels so the page stays responsive.'}
							</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6'>
					<p className='text-muted-foreground text-sm'>
						{isFinancial ? 'No financial analysis payload yet.' : 'No quantum result published yet.'}
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<section
			id='analysis'
			className='scroll-mt-4'
		>
			<Card className='shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10'>
				<Tabs
					value={analysisSurface}
					onValueChange={v => setAnalysisSurface(v as typeof analysisSurface)}
					className='gap-0'
				>
					<CardHeader className='border-b border-border/80'>
						<div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
							<div className='flex min-w-0 flex-1 items-start gap-3'>
								<div className='flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
									<SparklesIcon className='size-5' />
								</div>
								<div className='min-w-0 space-y-1'>
									<CardTitle>{isFinancial ? 'Financial analysis surfaces' : 'Quantum result surfaces'}</CardTitle>
									<CardDescription>
										{isFinancial
											? 'Column mix, correlations, trends, and fragment routing — mirrored into the same layout as quantum circuit runs.'
											: 'Heavy result views are split into focused panels so the interface stays responsive even for large circuits.'}
									</CardDescription>
								</div>
							</div>
							<TabsList
								variant='line'
								className='h-auto w-full flex-wrap justify-start gap-1 rounded-2xl p-1 lg:w-auto'
							>
								<TabsTrigger value='measurements'>
									{isFinancial ? 'Distributions' : 'Measurements'}
								</TabsTrigger>
								<TabsTrigger value='geometry'>{isFinancial ? 'Signals' : 'Geometry'}</TabsTrigger>
								<TabsTrigger value='deep'>{isFinancial ? 'Deep data' : 'Deep view'}</TabsTrigger>
							</TabsList>
						</div>
					</CardHeader>
					<CardContent className='pt-6'>
						<TabsContent
							value='measurements'
							className='mt-0 space-y-6'
						>
							<div className='grid gap-6 lg:grid-cols-2'>
								<div className='space-y-3'>
									<AnalysisChartCard
										title={isFinancial ? 'Column mix' : 'Counts'}
										subtitle={isFinancial ? 'Inferred dtypes from column profiles' : 'Shot distribution'}
										data={visibleCountsData as unknown as Array<Record<string, string | number>>}
										emptyMessage={
											isFinancial
												? 'Column profiles populate after ingestion completes.'
												: 'Counts appear when the circuit includes a measurement.'
										}
										config={measurementChartConfig}
										dataKey='value'
										labelKey='state'
										fill='var(--chart-4)'
										valueFormatter={value => `${value}`}
									/>
									<SectionPagination
										page={countsPage}
										pageCount={countsPageCount}
										totalItems={countsData.length}
										itemLabel='count rows'
										onPageChange={setCountsPage}
									/>
								</div>
								<div className='space-y-3'>
									<AnalysisChartCard
										title={isFinancial ? 'Correlation strength' : 'Measured probabilities'}
										subtitle={
											isFinancial ? '|r| for the strongest pairs (shown as %)' : 'Normalized outcome weights'
										}
										data={visibleMeasuredProbabilityData.map(entry => ({
											...entry,
											value: Number((entry.value * 100).toFixed(2))
										}))}
										emptyMessage={
											isFinancial
												? 'Correlations appear after the matrix fragment finishes.'
												: 'Measured probabilities will appear after execution.'
										}
										config={measurementChartConfig}
										dataKey='value'
										labelKey='state'
										fill='var(--chart-2)'
										valueFormatter={value => `${value}%`}
									/>
									<SectionPagination
										page={measuredProbabilityPage}
										pageCount={measuredProbabilityPageCount}
										totalItems={measuredProbabilityData.length}
										itemLabel='probability rows'
										onPageChange={setMeasuredProbabilityPage}
									/>
								</div>
							</div>

							<div className='grid gap-6 lg:grid-cols-2'>
								<AnalysisChartCard
									title={isFinancial ? 'Dominant pairs' : 'Top basis states'}
									subtitle={isFinancial ? 'Strongest |Pearson r| pairs' : 'Dominant amplitudes'}
									data={topBasisData.map(entry => ({
										...entry,
										value: Number((entry.value * 100).toFixed(2))
									}))}
									emptyMessage={
										isFinancial
											? 'Correlation pairs populate when analysis completes.'
											: 'Top basis states appear when the quantum result is available.'
									}
									config={measurementChartConfig}
									dataKey='value'
									labelKey='state'
									fill='var(--chart-1)'
									valueFormatter={value => `${value}%`}
								/>
								<div className='rounded-3xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
									<div className='mb-4'>
										<p className='text-sm font-medium'>
											{isFinancial ? 'Fragment fidelity envelope' : 'Fidelity envelope'}
										</p>
										<p className='text-sm text-muted-foreground'>
											{isFinancial
												? 'Mean vs minimum fidelity across distributed CSV fragments.'
												: 'Target vs estimated execution quality.'}
										</p>
									</div>
									<div className='space-y-5'>
										<ProgressStat
											label={isFinancial ? 'Mean fragment fidelity' : 'Target fidelity'}
											value={readNumber(fidelityRecord, 'fidelity_to_target_state')}
										/>
										<ProgressStat
											label={isFinancial ? 'Minimum fragment fidelity' : 'Estimated execution fidelity'}
											value={readNumber(fidelityRecord, 'estimated_execution_fidelity')}
										/>
										<div className='rounded-2xl border border-border/80 bg-card/80 p-4 text-sm ring-1 ring-foreground/5 dark:ring-foreground/10'>
											<div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
												{isFinancial ? 'Dataset' : 'Target state'}
											</div>
											<div className='mt-2 font-medium'>
												{readString(fidelityRecord, 'target_state') ?? '—'}
											</div>
										</div>
									</div>
								</div>
							</div>
						</TabsContent>

						<TabsContent
							value='geometry'
							className='mt-0 space-y-6'
						>
							<div className='rounded-3xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
								<div className='mb-4'>
									<p className='text-sm font-medium'>
										{isFinancial ? 'Trend momentum (%)' : 'Observable expectations'}
									</p>
									<p className='text-sm text-muted-foreground'>
										{isFinancial
											? 'Per-column momentum from time-series modelling, scaled to [-1, 1] for this chart.'
											: 'Signed values after the distributed circuit is reconstructed.'}
									</p>
								</div>
								{observableData.length > 0 ? (
									<ChartContainer
										className='h-[17rem] w-full'
										config={observableChartConfig}
									>
										<BarChart
											data={observableData}
											margin={{ left: 8, right: 12, top: 8 }}
											layout='vertical'
										>
											<CartesianGrid
												horizontal={false}
												strokeDasharray='3 6'
											/>
											<XAxis
												type='number'
												domain={[-1, 1]}
											/>
											<YAxis
												type='category'
												dataKey='observable'
												width={84}
												tickLine={false}
											/>
											<ChartTooltip
												cursor={false}
												content={<ChartTooltipContent indicator='line' />}
											/>
											<Bar
												dataKey='value'
												radius={[10, 10, 10, 10]}
											>
												{observableData.map(entry => (
													<Cell
														key={entry.observable}
														fill={entry.value >= 0 ? 'var(--chart-2)' : 'var(--destructive)'}
													/>
												))}
											</Bar>
										</BarChart>
									</ChartContainer>
								) : (
									<Empty className='min-h-[10rem] border border-dashed border-border/80'>
										<EmptyHeader>
											<EmptyMedia variant='icon'>
												<GaugeIcon />
											</EmptyMedia>
											<EmptyTitle>Waiting for observable data</EmptyTitle>
											<EmptyDescription>
												{isFinancial
													? 'Time-series columns will populate momentum bars after the trend fragment runs.'
													: 'Observable expectations will show up after the quantum result lands.'}
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								)}
							</div>

							<div className='grid gap-4 lg:grid-cols-2'>
								<div className='rounded-3xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
									<div className='mb-4'>
										<p className='text-sm font-medium'>
											{isFinancial ? 'Fragment load vectors' : 'Bloch vectors'}
										</p>
										<p className='text-sm text-muted-foreground'>
											{isFinancial
												? 'Synthetic 3-vector per pipeline fragment: duration, fidelity, and rows processed (normalized).'
												: 'Each qubit axis component rendered independently, with the 3D sphere loaded only when this panel is active.'}
										</p>
									</div>
									<div className='flex flex-wrap items-start gap-6'>
										{visibleBlochData.map(qubit => (
											<div
												key={qubit.qubit}
												className='flex flex-col items-center gap-3'
											>
												<Suspense
													fallback={
														<div
															className='flex items-center justify-center rounded-2xl border border-border/80 bg-muted/40 text-sm text-muted-foreground dark:bg-muted/25'
															style={{
																width: 200,
																height: 200,
																minWidth: 200,
																minHeight: 200
															}}
														>
															Loading Bloch sphere…
														</div>
													}
												>
													<LazyBlochSphere
														vector={[qubit.x, qubit.y, qubit.z]}
														label={qubit.qubit}
														size={200}
													/>
												</Suspense>
												<div className='w-full space-y-2 rounded-2xl border border-border/80 bg-card/80 p-3 ring-1 ring-foreground/5 dark:ring-foreground/10'>
													<AxisMeter
														label='X'
														value={qubit.x}
														color='var(--chart-1)'
													/>
													<AxisMeter
														label='Y'
														value={qubit.y}
														color='var(--chart-4)'
													/>
													<AxisMeter
														label='Z'
														value={qubit.z}
														color='var(--chart-2)'
													/>
												</div>
											</div>
										))}
										{blochData.length === 0 ? (
											<div className='w-full'>
												<Empty className='border border-dashed border-border/80'>
													<EmptyHeader>
														<EmptyMedia variant='icon'>
															<OrbitIcon />
														</EmptyMedia>
														<EmptyTitle>
															{isFinancial ? 'Fragment vectors will appear here' : 'Bloch vectors will appear here'}
														</EmptyTitle>
														<EmptyDescription>
															{isFinancial
																? 'Complete the CSV analysis to visualize per-fragment load on the synthetic axes.'
																: 'Run a circuit to render x, y, and z components for each measured qubit.'}
														</EmptyDescription>
													</EmptyHeader>
												</Empty>
											</div>
										) : null}
									</div>
									<SectionPagination
										page={blochPage}
										pageCount={blochPageCount}
										totalItems={blochData.length}
										itemLabel={isFinancial ? 'fragments' : 'qubits'}
										onPageChange={setBlochPage}
									/>
								</div>

								<div className='rounded-3xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
									<div className='mb-4'>
										<p className='text-sm font-medium'>
											{isFinancial ? 'Volatility index' : 'Entanglement entropy'}
										</p>
										<p className='text-sm text-muted-foreground'>
											{isFinancial
												? 'log-scaled volatility from time-series modelling per numeric column.'
												: 'Bipartition summary for each qubit against the rest of the system.'}
										</p>
									</div>
									<div className='space-y-4'>
										{visibleEntropyData.map(({ label, value }) => (
											<div
												key={label}
												className='space-y-2'
											>
												<div className='flex items-center justify-between gap-3 text-sm'>
													<span className='font-medium'>{label}</span>
													<span className='font-mono'>{value.toFixed(4)}</span>
												</div>
												<Progress
													value={Math.max(0, Math.min(100, value * 100))}
													className='h-2'
												/>
											</div>
										))}
										{allEntropyZero && !isFinancial ? (
											<p className='text-xs text-muted-foreground'>
												State is separable (no entanglement). Run a circuit with only a Bell-pair step
												to see entropy 1.
											</p>
										) : null}
										{entropyData.length === 0 ? (
											<Empty className='border border-dashed border-border/80'>
												<EmptyHeader>
													<EmptyMedia variant='icon'>
														<SparklesIcon />
													</EmptyMedia>
													<EmptyTitle>
														{isFinancial ? 'No volatility metrics yet' : 'No entanglement metrics yet'}
													</EmptyTitle>
													<EmptyDescription>
														{isFinancial
															? 'Volatility bars appear when time-series modelling returns column insights.'
															: 'Entropy metrics populate after the backend reconstructs the result state.'}
													</EmptyDescription>
												</EmptyHeader>
											</Empty>
										) : null}
									</div>
									<SectionPagination
										page={entropyPage}
										pageCount={entropyPageCount}
										totalItems={entropyData.length}
										itemLabel='entropy rows'
										onPageChange={setEntropyPage}
									/>
								</div>
							</div>
						</TabsContent>

						<TabsContent
							value='deep'
							className='mt-0 space-y-4'
						>
							<Tabs
								value={deepDataView}
								onValueChange={v => setDeepDataView(v as typeof deepDataView)}
								className='gap-4'
							>
								<TabsList
									variant='line'
									className='h-auto w-full flex-wrap justify-start gap-1 rounded-2xl p-1'
								>
									<TabsTrigger value='metadata'>Job metadata</TabsTrigger>
									<TabsTrigger value='statevector'>
										{isFinancial ? 'Numeric columns' : 'Statevector'}
									</TabsTrigger>
									<TabsTrigger value='density'>
										{isFinancial ? 'Correlation matrix' : 'Density matrices'}
									</TabsTrigger>
								</TabsList>

								{deepError ? (
									<Alert>
										<BinaryIcon />
										<AlertTitle>Deep state load</AlertTitle>
										<AlertDescription>{deepError}</AlertDescription>
									</Alert>
								) : null}

								<TabsContent
									value='metadata'
									className='mt-0 space-y-4'
								>
									<div className='rounded-2xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
										<p className='text-sm font-medium'>Job metadata</p>
										<p className='mt-1 text-sm text-muted-foreground'>
											{isFinancial
												? 'Timestamps, pipeline shape, and the same plan id as the financial job (`fin-…`).'
												: 'Timestamps, measured qubit indices, and plan quality snapshot for the current run.'}
										</p>
									</div>
									<div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
										<MiniDataCard
											label='Created'
											value={run.createdAtLabel}
											detail={run.createdAt}
										/>
										<MiniDataCard
											label='Updated'
											value={run.updatedAtLabel}
											detail={run.updatedAt}
										/>
										<MiniDataCard
											label={isFinancial ? 'Pipeline fragments' : 'Measured qubits'}
											value={
												isFinancial && financialResult
													? String(financialResult.fragments_executed)
													: quantum.measuredQubits.length
														? quantum.measuredQubits.join(', ')
														: '—'
											}
											detail={
												isFinancial ? 'Distributed CSV analysis stages' : 'Measured qubit indices'
											}
										/>
										<MiniDataCard
											label={isFinancial ? 'Analysis duration' : 'Plan quality snapshot'}
											value={
												isFinancial
													? financialResult
														? `${(financialResult.analysis_duration_ms / 1000).toFixed(2)}s`
														: '—'
													: planQualitySnapshotId
														? 'Recorded'
														: '—'
											}
											detail={
												isFinancial
													? financialResult
														? `${financialResult.row_count.toLocaleString()} rows · ${financialResult.col_count} cols`
														: '—'
													: (planQualitySnapshotId ?? 'No plan yet')
											}
										/>
									</div>
								</TabsContent>

								<TabsContent
									value='statevector'
									className='mt-0 space-y-4'
								>
									{isFinancial && financialResult ? (
										<>
											<div className='rounded-2xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
												<p className='text-sm font-medium'>Numeric column snapshot</p>
												<p className='mt-1 text-sm text-muted-foreground'>
													First numeric fields from column profiling — same deep tab slot as the
													quantum statevector, mapped to financial data.
												</p>
											</div>
											<div className='max-h-[min(28rem,70vh)] overflow-auto rounded-2xl border border-border/80'>
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>Column</TableHead>
															<TableHead className='text-right'>Mean</TableHead>
															<TableHead className='text-right'>Std</TableHead>
															<TableHead className='text-right'>Outliers %</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{financialResult.column_profiles
															.filter(p => p.dtype === 'numeric')
															.slice(0, 48)
															.map(p => (
																<TableRow key={p.name}>
																	<TableCell className='font-medium'>{p.name}</TableCell>
																	<TableCell className='text-right font-mono text-xs'>
																		{p.mean?.toFixed(4) ?? '—'}
																	</TableCell>
																	<TableCell className='text-right font-mono text-xs'>
																		{p.std?.toFixed(4) ?? '—'}
																	</TableCell>
																	<TableCell className='text-right font-mono text-xs'>
																		{p.outlier_pct ?? '—'}
																	</TableCell>
																</TableRow>
															))}
													</TableBody>
												</Table>
											</div>
										</>
									) : (
										<>
											<div className='rounded-2xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
												<p className='text-sm font-medium'>What is the statevector?</p>
												<p className='mt-1 text-sm text-muted-foreground'>
													The statevector describes the quantum state after your circuit runs. Each row
													shows a basis state and its amplitude, so you can inspect the reconstructed
													wavefunction without loading the full payload until you need it.
												</p>
											</div>
											{isDeepLoading && statevectorRows.length === 0 ? (
												<Empty className='border border-dashed border-border/80'>
													<EmptyHeader>
														<EmptyMedia variant='icon'>
															<RefreshCcwIcon className='animate-spin' />
														</EmptyMedia>
														<EmptyTitle>Loading statevector</EmptyTitle>
														<EmptyDescription>
															Fetching the full quantum-state payload now.
														</EmptyDescription>
													</EmptyHeader>
												</Empty>
											) : (
												<>
													<div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
														{statevectorRows.map(row => (
															<div
																key={row.basisState}
																className='rounded-3xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'
															>
																<div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
																	|{row.basisState}⟩
																</div>
																<div className='mt-3 font-mono text-sm break-all'>{row.amplitude}</div>
															</div>
														))}
														{statevectorRows.length === 0 ? (
															<Empty className='border border-dashed border-border/80 md:col-span-2 xl:col-span-4'>
																<EmptyHeader>
																	<EmptyMedia variant='icon'>
																		<BinaryIcon />
																	</EmptyMedia>
																	<EmptyTitle>No statevector yet</EmptyTitle>
																	<EmptyDescription>
																		Open a completed job to inspect the reconstructed amplitudes here.
																	</EmptyDescription>
																</EmptyHeader>
															</Empty>
														) : null}
													</div>
													<SectionPagination
														page={statevectorPage}
														pageCount={statevectorPageCount}
														totalItems={statevectorValues.length}
														itemLabel='statevector amplitudes'
														onPageChange={setStatevectorPage}
													/>
												</>
											)}
										</>
									)}
								</TabsContent>

								<TabsContent
									value='density'
									className='mt-0 space-y-4'
								>
									{isFinancial && financialResult ? (
										<>
											<div className='rounded-2xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
												<p className='text-sm font-medium'>Pearson correlation matrix (top pairs)</p>
												<p className='mt-1 text-sm text-muted-foreground'>
													Uses the same deep tab as density matrices, mapped to the strongest
													correlations from the distributed matrix fragment.
												</p>
											</div>
											<div className='max-h-[min(28rem,70vh)] overflow-auto rounded-2xl border border-border/80'>
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead>Column A</TableHead>
															<TableHead>Column B</TableHead>
															<TableHead className='text-right'>r</TableHead>
															<TableHead className='text-right'>Strength</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{financialResult.top_correlations.slice(0, 40).map((pair, idx) => (
															<TableRow key={`${pair.col_a}-${pair.col_b}-${idx}`}>
																<TableCell className='max-w-[10rem] truncate font-medium'>
																	{pair.col_a}
																</TableCell>
																<TableCell className='max-w-[10rem] truncate font-medium'>
																	{pair.col_b}
																</TableCell>
																<TableCell className='text-right font-mono text-xs'>
																	{pair.pearson.toFixed(4)}
																</TableCell>
																<TableCell className='text-right text-xs capitalize'>
																	{pair.strength}
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											</div>
										</>
									) : (
										<>
											<div className='rounded-2xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'>
												<p className='text-sm font-medium'>What are density matrices?</p>
												<p className='mt-1 text-sm text-muted-foreground'>
													Density matrices represent mixed or reduced quantum states. This panel stays
													lazy until requested so large jobs do not block the rest of the UI.
												</p>
											</div>
											{isDeepLoading && densityMatrixEntries.length === 0 ? (
												<Empty className='border border-dashed border-border/80'>
													<EmptyHeader>
														<EmptyMedia variant='icon'>
															<RefreshCcwIcon className='animate-spin' />
														</EmptyMedia>
														<EmptyTitle>Loading density matrices</EmptyTitle>
														<EmptyDescription>
															Fetching the full quantum-state payload now.
														</EmptyDescription>
													</EmptyHeader>
												</Empty>
											) : (
												<>
													<div className='grid gap-4 lg:grid-cols-2'>
														{visibleDensityMatrixEntries.map(([label, matrix]) => (
															<div
																key={label}
																className='rounded-3xl border border-border/80 bg-muted/25 p-4 dark:bg-muted/15'
															>
																<div className='mb-4'>
																	<p className='text-sm font-medium'>{label}</p>
																	<p className='text-sm text-muted-foreground'>
																		Reduced density matrix
																	</p>
																</div>
																<div className='grid gap-2'>
																	{matrix.map((row, rowIndex) => (
																		<div
																			key={`${label}-${rowIndex}`}
																			className='grid grid-cols-2 gap-2'
																		>
																			{row.map((value, columnIndex) => (
																				<div
																					key={`${label}-${rowIndex}-${columnIndex}`}
																					className='rounded-2xl border border-border/80 bg-card/80 px-3 py-2 font-mono text-xs break-all ring-1 ring-foreground/5 dark:ring-foreground/10'
																				>
																					{value}
																				</div>
																			))}
																		</div>
																	))}
																</div>
															</div>
														))}
														{densityMatrixEntries.length === 0 ? (
															<Empty className='border border-dashed border-border/80 lg:col-span-2'>
																<EmptyHeader>
																	<EmptyMedia variant='icon'>
																		<CpuIcon />
																	</EmptyMedia>
																	<EmptyTitle>Density matrices unavailable</EmptyTitle>
																	<EmptyDescription>
																		Open a completed job to inspect the reduced subsystem matrices here.
																	</EmptyDescription>
																</EmptyHeader>
															</Empty>
														) : null}
													</div>
													<SectionPagination
														page={densityMatrixPage}
														pageCount={densityMatrixPageCount}
														totalItems={densityMatrixEntries.length}
														itemLabel='density matrices'
														onPageChange={setDensityMatrixPage}
													/>
												</>
											)}
										</>
									)}
								</TabsContent>
							</Tabs>
						</TabsContent>
					</CardContent>
				</Tabs>
			</Card>
		</section>
	);
}
