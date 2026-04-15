'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
	ActivityIcon,
	AlertTriangleIcon,
	BarChart2Icon,
	BrainIcon,
	CheckCircle2Icon,
	ChevronRightIcon,
	CircleDotIcon,
	CpuIcon,
	DatabaseIcon,
	FileTextIcon,
	FlameIcon,
	GitBranchIcon,
	Loader2Icon,
	NetworkIcon,
	ServerIcon,
	SparklesIcon,
	TrendingDownIcon,
	TrendingUpIcon,
	UploadCloudIcon,
	XCircleIcon,
	ZapIcon
} from 'lucide-react';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	RadarChart,
	PolarGrid,
	PolarAngleAxis,
	Radar,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Tooltip,
	XAxis,
	YAxis
} from 'recharts';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHash } from '@/hooks/use-hash';
import { cn } from '@/lib/utils';
import type {
	AnomalyPoint,
	ColumnProfile,
	CorrelationPair,
	DCFOutput,
	FinancialAnalysisResult,
	FinancialJobResponse,
	FinancialJobStatus,
	NodeExecutionSegment,
	TimeSeriesInsight
} from '@/types/financial';

const POLL_INTERVAL_MS = 1500;

const STATUS_STEPS: FinancialJobStatus[] = ['QUEUED', 'INGESTING', 'ANALYSING', 'COMPLETED'];

function fmt(n: number | undefined, decimals = 2): string {
	if (n === undefined || n === null) return '—';
	if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
	if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toFixed(decimals);
}

function pct(n: number | undefined): string {
	if (n === undefined || n === null) return '—';
	return `${(n * 100).toFixed(1)}%`;
}

const CHART_COLORS = [
	'hsl(var(--chart-1))',
	'hsl(var(--chart-2))',
	'hsl(var(--chart-3))',
	'hsl(var(--chart-4))',
	'hsl(var(--chart-5))'
];

// ------------------------------------------------------------------
// Upload zone
// ------------------------------------------------------------------
function UploadZone({ onFile }: { onFile: (f: File) => void }) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragging(false);
		const f = e.dataTransfer.files[0];
		if (f?.name.endsWith('.csv')) onFile(f);
	};

	return (
		<div
			onDragOver={e => {
				e.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={handleDrop}
			onClick={() => inputRef.current?.click()}
			className={cn(
				'group relative flex cursor-pointer flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-16 text-center transition-all duration-200',
				dragging
					? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
					: 'border-border bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
			)}
		>
			<input
				ref={inputRef}
				type='file'
				accept='.csv'
				className='hidden'
				onChange={e => {
					const f = e.target.files?.[0];
					if (f) onFile(f);
				}}
			/>
			<div className='flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner ring-1 ring-primary/20 transition-transform group-hover:scale-105'>
				<UploadCloudIcon className='size-10 text-primary' />
			</div>
			<div className='space-y-2'>
				<p className='text-xl font-semibold'>Drop your financial CSV here</p>
				<p className='max-w-sm text-sm text-muted-foreground'>
					Upload any financial dataset — balance sheets, P&L, cash flows, market data, KPIs — and our
					distributed quantum network will run deep analytics across it.
				</p>
			</div>
			<div className='flex flex-wrap justify-center gap-2'>
				{['Revenue', 'EBITDA', 'Cash Flow', 'Stock Prices', 'KPIs', 'Balance Sheet'].map(tag => (
					<Badge
						key={tag}
						variant='secondary'
						className='text-xs'
					>
						{tag}
					</Badge>
				))}
			</div>
			<Button
				variant='default'
				size='sm'
				type='button'
			>
				Browse files
			</Button>
		</div>
	);
}

// ------------------------------------------------------------------
// Job progress tracker
// ------------------------------------------------------------------
function JobProgressBar({ status }: { status: FinancialJobStatus }) {
	const stepIndex = STATUS_STEPS.indexOf(status);
	const isFailed = status === 'FAILED';
	const progress = isFailed ? 100 : Math.round(((stepIndex + 1) / STATUS_STEPS.length) * 100);

	const stepLabels: Record<string, string> = {
		QUEUED: 'Queued',
		INGESTING: 'Ingesting CSV',
		ANALYSING: 'Distributed Analysis',
		COMPLETED: 'Complete'
	};

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between text-sm'>
				<span className='font-medium'>{isFailed ? 'Analysis failed' : (stepLabels[status] ?? status)}</span>
				<span className='text-muted-foreground'>{isFailed ? '—' : `${progress}%`}</span>
			</div>
			<Progress
				value={progress}
				className={cn('h-2', isFailed && '[&>div]:bg-destructive')}
			/>
			<div className='flex justify-between'>
				{STATUS_STEPS.map((step, i) => (
					<div
						key={step}
						className={cn(
							'flex flex-col items-center gap-1 text-xs transition-colors',
							i <= stepIndex ? 'text-primary' : 'text-muted-foreground'
						)}
					>
						<div
							className={cn(
								'flex size-6 items-center justify-center rounded-full border-2 transition-colors',
								i < stepIndex
									? 'border-primary bg-primary text-primary-foreground'
									: i === stepIndex
										? 'border-primary text-primary'
										: 'border-muted-foreground/30'
							)}
						>
							{i < stepIndex ? <CheckCircle2Icon className='size-3.5' /> : <span>{i + 1}</span>}
						</div>
						<span className='hidden sm:block'>{stepLabels[step]}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ------------------------------------------------------------------
// Summary KPI cards
// ------------------------------------------------------------------
function SummaryKpis({ result }: { result: FinancialAnalysisResult }) {
	const cards = [
		{
			label: 'Total Rows',
			value: result.row_count.toLocaleString(),
			sub: `${result.col_count} columns`,
			icon: <DatabaseIcon className='size-5' />,
			color: 'text-chart-1'
		},
		{
			label: 'Numeric Columns',
			value: result.numeric_columns.length,
			sub: 'Quantitative fields',
			icon: <BarChart2Icon className='size-5' />,
			color: 'text-chart-2'
		},
		{
			label: 'Anomalies Detected',
			value: result.anomalies.length,
			sub: 'Across all columns',
			icon: <AlertTriangleIcon className='size-5' />,
			color: 'text-destructive'
		},
		{
			label: 'Nodes Used',
			value: result.distributed_nodes_used,
			sub: `${result.fragments_executed} fragments`,
			icon: <NetworkIcon className='size-5' />,
			color: 'text-chart-3'
		},
		{
			label: 'Strong Correlations',
			value: result.correlations.filter(c => c.strength === 'strong').length,
			sub: `of ${result.correlations.length} pairs`,
			icon: <ZapIcon className='size-5' />,
			color: 'text-chart-4'
		},
		{
			label: 'Analysis Time',
			value: `${(result.analysis_duration_ms / 1000).toFixed(2)}s`,
			sub: 'Distributed execution',
			icon: <CpuIcon className='size-5' />,
			color: 'text-chart-5'
		}
	];

	return (
		<div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
			{cards.map(card => (
				<Card
					key={card.label}
					className='bg-gradient-to-br from-card to-muted/20'
				>
					<CardContent className='p-4'>
						<div className={cn('mb-2', card.color)}>{card.icon}</div>
						<p className='text-2xl font-bold tabular-nums'>{card.value}</p>
						<p className='text-xs font-medium text-foreground'>{card.label}</p>
						<p className='mt-0.5 text-[11px] text-muted-foreground'>{card.sub}</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}

// ------------------------------------------------------------------
// Column profiles
// ------------------------------------------------------------------
function ColumnProfiles({ profiles }: { profiles: ColumnProfile[] }) {
	const numericProfiles = profiles.filter(p => p.dtype === 'numeric');
	const barData = numericProfiles.slice(0, 15).map(p => ({
		name: p.name.length > 14 ? p.name.slice(0, 12) + '…' : p.name,
		Mean: p.mean ?? 0,
		Std: p.std ?? 0,
		Outliers: p.outlier_pct ?? 0
	}));

	return (
		<div className='space-y-6'>
			<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
				{numericProfiles.map(p => (
					<Card
						key={p.name}
						className='text-sm'
					>
						<CardHeader className='pb-2'>
							<CardTitle className='truncate text-sm font-semibold'>{p.name}</CardTitle>
							<CardDescription className='flex gap-2'>
								<Badge
									variant='outline'
									className='text-[10px]'
								>
									{p.dtype}
								</Badge>
								{(p.null_pct ?? 0) > 5 && (
									<Badge
										variant='destructive'
										className='text-[10px]'
									>
										{p.null_pct}% null
									</Badge>
								)}
							</CardDescription>
						</CardHeader>
						<CardContent className='space-y-1.5 pb-3 text-xs'>
							<div className='grid grid-cols-2 gap-x-4 gap-y-1'>
								<span className='text-muted-foreground'>Mean</span>
								<span className='text-right font-mono font-medium'>{fmt(p.mean)}</span>
								<span className='text-muted-foreground'>Median</span>
								<span className='text-right font-mono font-medium'>{fmt(p.median)}</span>
								<span className='text-muted-foreground'>Std Dev</span>
								<span className='text-right font-mono font-medium'>{fmt(p.std)}</span>
								<span className='text-muted-foreground'>Min / Max</span>
								<span className='text-right font-mono font-medium'>
									{fmt(p.min)} / {fmt(p.max)}
								</span>
								<span className='text-muted-foreground'>Skewness</span>
								<span
									className={cn(
										'text-right font-mono font-medium',
										Math.abs(p.skewness ?? 0) > 1 && 'text-amber-500'
									)}
								>
									{fmt(p.skewness)}
								</span>
								<span className='text-muted-foreground'>Outliers</span>
								<span
									className={cn(
										'text-right font-mono font-medium',
										(p.outlier_pct ?? 0) > 5 && 'text-destructive'
									)}
								>
									{p.outlier_count} ({p.outlier_pct}%)
								</span>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
			{barData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Mean vs Std Deviation — All Numeric Columns</CardTitle>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={220}
						>
							<BarChart
								data={barData}
								margin={{ left: 0, right: 8 }}
							>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='hsl(var(--border))'
								/>
								<XAxis
									dataKey='name'
									tick={{ fontSize: 10 }}
								/>
								<YAxis tick={{ fontSize: 10 }} />
								<Tooltip
									contentStyle={{
										background: 'hsl(var(--card))',
										border: '1px solid hsl(var(--border))',
										borderRadius: 8,
										fontSize: 11
									}}
								/>
								<Legend wrapperStyle={{ fontSize: 11 }} />
								<Bar
									dataKey='Mean'
									fill={CHART_COLORS[0]}
									radius={[3, 3, 0, 0]}
								/>
								<Bar
									dataKey='Std'
									fill={CHART_COLORS[1]}
									radius={[3, 3, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ------------------------------------------------------------------
// Correlation matrix
// ------------------------------------------------------------------
function CorrelationPanel({ correlations, top }: { correlations: CorrelationPair[]; top: CorrelationPair[] }) {
	const scatterData = correlations.map(c => ({
		x: c.col_a,
		y: c.col_b,
		r: Math.abs(c.pearson),
		pearson: c.pearson,
		strength: c.strength
	}));

	const barData = top.slice(0, 10).map(c => ({
		pair: `${c.col_a.slice(0, 8)}↔${c.col_b.slice(0, 8)}`,
		Pearson: c.pearson,
		fill: c.pearson >= 0 ? CHART_COLORS[0] : CHART_COLORS[4]
	}));

	return (
		<div className='space-y-6'>
			<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
				{['strong', 'moderate', 'weak'].map(strength => {
					const pairs = correlations.filter(c => c.strength === strength);
					const color =
						strength === 'strong'
							? 'text-chart-1'
							: strength === 'moderate'
								? 'text-chart-3'
								: 'text-muted-foreground';
					return (
						<Card key={strength}>
							<CardHeader className='pb-2'>
								<CardTitle className={cn('text-sm capitalize', color)}>
									{strength} correlations
								</CardTitle>
								<CardDescription>{pairs.length} pairs</CardDescription>
							</CardHeader>
							<CardContent className='space-y-1.5'>
								{pairs.slice(0, 5).map(c => (
									<div
										key={`${c.col_a}-${c.col_b}`}
										className='flex items-center justify-between text-xs'
									>
										<span className='truncate text-muted-foreground'>
											{c.col_a} ↔ {c.col_b}
										</span>
										<span
											className={cn(
												'ml-2 shrink-0 font-mono font-semibold',
												c.pearson > 0 ? 'text-chart-1' : 'text-destructive'
											)}
										>
											{c.pearson > 0 ? '+' : ''}
											{c.pearson.toFixed(3)}
										</span>
									</div>
								))}
								{pairs.length === 0 && <p className='text-xs text-muted-foreground'>None found</p>}
							</CardContent>
						</Card>
					);
				})}
			</div>

			{barData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Top Correlation Pairs by Pearson Coefficient</CardTitle>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={220}
						>
							<BarChart
								data={barData}
								layout='vertical'
								margin={{ left: 8, right: 24 }}
							>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='hsl(var(--border))'
									horizontal={false}
								/>
								<XAxis
									type='number'
									domain={[-1, 1]}
									tick={{ fontSize: 10 }}
								/>
								<YAxis
									dataKey='pair'
									type='category'
									tick={{ fontSize: 9 }}
									width={120}
								/>
								<Tooltip
									contentStyle={{
										background: 'hsl(var(--card))',
										border: '1px solid hsl(var(--border))',
										borderRadius: 8,
										fontSize: 11
									}}
								/>
								<Bar
									dataKey='Pearson'
									radius={[0, 3, 3, 0]}
								>
									{barData.map((entry, i) => (
										<Cell
											key={i}
											fill={entry.Pearson >= 0 ? CHART_COLORS[0] : CHART_COLORS[4]}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ------------------------------------------------------------------
// Time-series trends
// ------------------------------------------------------------------
function TrendPanel({ insights }: { insights: TimeSeriesInsight[] }) {
	const trendIcon = (trend: string) => {
		if (trend === 'upward') return <TrendingUpIcon className='size-4 text-chart-1' />;
		if (trend === 'downward') return <TrendingDownIcon className='size-4 text-destructive' />;
		if (trend === 'volatile') return <ActivityIcon className='size-4 text-amber-500' />;
		return <CircleDotIcon className='size-4 text-muted-foreground' />;
	};

	const radarData = insights.slice(0, 8).map(i => ({
		column: i.column.length > 10 ? i.column.slice(0, 8) + '…' : i.column,
		Momentum: Math.abs(i.momentum),
		Volatility: i.volatility > 0 ? Math.log1p(i.volatility) * 10 : 0
	}));

	const barData = insights.map(i => ({
		name: i.column.length > 12 ? i.column.slice(0, 10) + '…' : i.column,
		Momentum: parseFloat(i.momentum.toFixed(2)),
		High: parseFloat(i.period_high.toFixed(2)),
		Low: parseFloat(i.period_low.toFixed(2))
	}));

	return (
		<div className='space-y-6'>
			<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
				{insights.map(i => (
					<Card key={i.column}>
						<CardHeader className='pb-2'>
							<div className='flex items-center gap-2'>
								{trendIcon(i.trend)}
								<CardTitle className='truncate text-sm'>{i.column}</CardTitle>
							</div>
							<Badge
								variant='outline'
								className='w-fit text-[10px] capitalize'
							>
								{i.trend}
							</Badge>
						</CardHeader>
						<CardContent className='grid grid-cols-2 gap-x-4 gap-y-1 pb-3 text-xs'>
							<span className='text-muted-foreground'>Momentum</span>
							<span
								className={cn(
									'text-right font-mono font-semibold',
									i.momentum > 0 ? 'text-chart-1' : 'text-destructive'
								)}
							>
								{i.momentum > 0 ? '+' : ''}
								{i.momentum.toFixed(1)}%
							</span>
							<span className='text-muted-foreground'>Avg</span>
							<span className='text-right font-mono'>{fmt(i.period_avg)}</span>
							<span className='text-muted-foreground'>High / Low</span>
							<span className='text-right font-mono'>
								{fmt(i.period_high)} / {fmt(i.period_low)}
							</span>
							{i.cagr !== undefined && (
								<>
									<span className='text-muted-foreground'>CAGR</span>
									<span className='text-right font-mono'>{pct(i.cagr)}</span>
								</>
							)}
						</CardContent>
					</Card>
				))}
			</div>

			{barData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Momentum by Column (%)</CardTitle>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={200}
						>
							<BarChart data={barData}>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='hsl(var(--border))'
								/>
								<XAxis
									dataKey='name'
									tick={{ fontSize: 10 }}
								/>
								<YAxis tick={{ fontSize: 10 }} />
								<Tooltip
									contentStyle={{
										background: 'hsl(var(--card))',
										border: '1px solid hsl(var(--border))',
										borderRadius: 8,
										fontSize: 11
									}}
								/>
								<Bar
									dataKey='Momentum'
									radius={[3, 3, 0, 0]}
								>
									{barData.map((entry, i) => (
										<Cell
											key={i}
											fill={entry.Momentum >= 0 ? CHART_COLORS[0] : CHART_COLORS[4]}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}

			{radarData.length >= 3 && (
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Momentum vs Volatility Radar</CardTitle>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={280}
						>
							<RadarChart data={radarData}>
								<PolarGrid stroke='hsl(var(--border))' />
								<PolarAngleAxis
									dataKey='column'
									tick={{ fontSize: 10 }}
								/>
								<Radar
									name='Momentum'
									dataKey='Momentum'
									stroke={CHART_COLORS[0]}
									fill={CHART_COLORS[0]}
									fillOpacity={0.25}
								/>
								<Radar
									name='Volatility'
									dataKey='Volatility'
									stroke={CHART_COLORS[2]}
									fill={CHART_COLORS[2]}
									fillOpacity={0.2}
								/>
								<Legend wrapperStyle={{ fontSize: 11 }} />
							</RadarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ------------------------------------------------------------------
// DCF Valuation
// ------------------------------------------------------------------
function DCFPanel({ dcf }: { dcf: DCFOutput }) {
	const scenarioData = [
		{
			name: 'Bear',
			Valuation: dcf.bear.valuation_estimate,
			Revenue: dcf.bear.revenue_projection,
			fill: CHART_COLORS[4]
		},
		{
			name: 'Base',
			Valuation: dcf.base.valuation_estimate,
			Revenue: dcf.base.revenue_projection,
			fill: CHART_COLORS[2]
		},
		{
			name: 'Bull',
			Valuation: dcf.bull.valuation_estimate,
			Revenue: dcf.bull.revenue_projection,
			fill: CHART_COLORS[0]
		}
	];

	const cashflowData = dcf.yearly_cashflows.map((cf, i) => ({
		year: `Y${i + 1}`,
		Cashflow: cf
	}));

	return (
		<div className='space-y-6'>
			<div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Model Parameters</CardTitle>
					</CardHeader>
					<CardContent className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm'>
						<span className='text-muted-foreground'>WACC</span>
						<span className='font-mono font-semibold'>{pct(dcf.wacc)}</span>
						<span className='text-muted-foreground'>Terminal Growth</span>
						<span className='font-mono font-semibold'>{pct(dcf.terminal_growth)}</span>
						<span className='text-muted-foreground'>Projection Years</span>
						<span className='font-mono font-semibold'>{dcf.projection_years}</span>
						<span className='text-muted-foreground'>Terminal Value</span>
						<span className='font-mono font-semibold'>{fmt(dcf.terminal_value)}</span>
						<span className='text-muted-foreground'>Enterprise Value</span>
						<span className='font-mono font-semibold text-primary'>{fmt(dcf.enterprise_value)}</span>
						<span className='text-muted-foreground'>Equity Value</span>
						<span className='font-mono font-semibold'>{fmt(dcf.equity_value)}</span>
						{dcf.per_share_value !== undefined && (
							<>
								<span className='text-muted-foreground'>Per Share</span>
								<span className='font-mono font-semibold'>{fmt(dcf.per_share_value, 2)}</span>
							</>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Bull / Base / Bear Scenarios</CardTitle>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={180}
						>
							<BarChart data={scenarioData}>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='hsl(var(--border))'
								/>
								<XAxis
									dataKey='name'
									tick={{ fontSize: 11 }}
								/>
								<YAxis tick={{ fontSize: 10 }} />
								<Tooltip
									contentStyle={{
										background: 'hsl(var(--card))',
										border: '1px solid hsl(var(--border))',
										borderRadius: 8,
										fontSize: 11
									}}
									formatter={val => {
										const n = typeof val === 'number' ? val : Number(val ?? 0);
										return fmt(Number.isFinite(n) ? n : 0);
									}}
								/>
								<Legend wrapperStyle={{ fontSize: 11 }} />
								<Bar
									dataKey='Valuation'
									radius={[4, 4, 0, 0]}
								>
									{scenarioData.map((e, i) => (
										<Cell
											key={i}
											fill={e.fill}
										/>
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			</div>

			{cashflowData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Projected Cashflows</CardTitle>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={180}
						>
							<AreaChart data={cashflowData}>
								<defs>
									<linearGradient
										id='cf-grad'
										x1='0'
										y1='0'
										x2='0'
										y2='1'
									>
										<stop
											offset='0%'
											stopColor={CHART_COLORS[0]}
											stopOpacity={0.35}
										/>
										<stop
											offset='100%'
											stopColor={CHART_COLORS[0]}
											stopOpacity={0}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='hsl(var(--border))'
								/>
								<XAxis
									dataKey='year'
									tick={{ fontSize: 11 }}
								/>
								<YAxis tick={{ fontSize: 10 }} />
								<Tooltip
									contentStyle={{
										background: 'hsl(var(--card))',
										border: '1px solid hsl(var(--border))',
										borderRadius: 8,
										fontSize: 11
									}}
								/>
								<Area
									type='monotone'
									dataKey='Cashflow'
									stroke={CHART_COLORS[0]}
									fill='url(#cf-grad)'
									strokeWidth={2}
								/>
							</AreaChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}

			<div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
				{[dcf.bull, dcf.base, dcf.bear].map(scenario => (
					<Card
						key={scenario.label}
						className={cn(
							'border',
							scenario.label === 'Bull'
								? 'border-chart-1/40 bg-chart-1/5'
								: scenario.label === 'Bear'
									? 'border-destructive/40 bg-destructive/5'
									: ''
						)}
					>
						<CardHeader className='pb-2'>
							<CardTitle className='text-sm'>{scenario.label} Case</CardTitle>
						</CardHeader>
						<CardContent className='grid grid-cols-2 gap-x-4 gap-y-1 text-xs'>
							<span className='text-muted-foreground'>Growth Rate</span>
							<span className='text-right font-mono font-semibold'>{pct(scenario.growth_rate)}</span>
							<span className='text-muted-foreground'>Revenue Proj.</span>
							<span className='text-right font-mono'>{fmt(scenario.revenue_projection)}</span>
							<span className='text-muted-foreground'>Valuation</span>
							<span className='text-right font-mono font-semibold'>
								{fmt(scenario.valuation_estimate)}
							</span>
							<span className='text-muted-foreground'>Discount Rate</span>
							<span className='text-right font-mono'>{pct(scenario.discount_rate)}</span>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

// ------------------------------------------------------------------
// Anomaly detection
// ------------------------------------------------------------------
function AnomalyPanel({ anomalies }: { anomalies: AnomalyPoint[] }) {
	const scatterData = anomalies.map(a => ({
		x: a.row_index,
		y: a.z_score,
		column: a.column,
		value: a.value,
		label: a.label
	}));

	return (
		<div className='space-y-6'>
			<div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Anomaly Scatter (Row Index vs Z-Score)</CardTitle>
						<CardDescription>Points beyond ±2.5σ flagged as anomalies</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={220}
						>
							<ScatterChart margin={{ left: 0, right: 16 }}>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='hsl(var(--border))'
								/>
								<XAxis
									dataKey='x'
									name='Row'
									tick={{ fontSize: 10 }}
								/>
								<YAxis
									dataKey='y'
									name='Z-Score'
									tick={{ fontSize: 10 }}
								/>
								<Tooltip
									contentStyle={{
										background: 'hsl(var(--card))',
										border: '1px solid hsl(var(--border))',
										borderRadius: 8,
										fontSize: 11
									}}
									formatter={(val, name) => {
										const n = typeof val === 'number' ? val : Number(val ?? 0);
										const safe = Number.isFinite(n) ? n : 0;
										return [
											name === 'y' ? safe.toFixed(3) : safe,
											name === 'y' ? 'Z-Score' : 'Row'
										];
									}}
								/>
								<Scatter
									data={scatterData}
									name='Anomalies'
								>
									{scatterData.map((entry, i) => (
										<Cell
											key={i}
											fill={entry.y > 0 ? CHART_COLORS[0] : CHART_COLORS[4]}
											fillOpacity={0.7}
										/>
									))}
								</Scatter>
							</ScatterChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Top Anomalies</CardTitle>
						<CardDescription>Highest absolute z-score outliers</CardDescription>
					</CardHeader>
					<CardContent>
						<div className='max-h-56 space-y-1.5 overflow-y-auto'>
							{anomalies.slice(0, 20).map((a, i) => (
								<div
									key={i}
									className='flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs odd:bg-muted/30'
								>
									<span
										className={cn(
											'shrink-0 font-semibold',
											a.label === 'extreme_high' ? 'text-chart-1' : 'text-destructive'
										)}
									>
										{a.label === 'extreme_high' ? '▲' : '▼'}
									</span>
									<span className='min-w-0 flex-1 truncate text-muted-foreground'>{a.column}</span>
									<span className='font-mono font-semibold'>{fmt(a.value)}</span>
									<span className='shrink-0 text-muted-foreground'>z={a.z_score.toFixed(2)}</span>
									<span className='shrink-0 text-muted-foreground'>row {a.row_index}</span>
								</div>
							))}
							{anomalies.length === 0 && (
								<p className='py-8 text-center text-sm text-muted-foreground'>No anomalies detected</p>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

// ------------------------------------------------------------------
// Distributed execution panel
// ------------------------------------------------------------------
function ExecutionPanel({ segments, result }: { segments: NodeExecutionSegment[]; result: FinancialAnalysisResult }) {
	const barData = segments.map(s => ({
		task: s.task.replace(/_/g, ' '),
		'Duration (ms)': s.duration_ms,
		Fidelity: s.fidelity_score * 100
	}));

	return (
		<div className='space-y-6'>
			<div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
				<Card className='bg-gradient-to-br from-primary/10 to-card'>
					<CardContent className='pt-5'>
						<NetworkIcon className='mb-2 size-6 text-primary' />
						<p className='text-3xl font-bold'>{result.distributed_nodes_used}</p>
						<p className='text-sm text-muted-foreground'>Network nodes used</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-5'>
						<CpuIcon className='mb-2 size-6 text-chart-2' />
						<p className='text-3xl font-bold'>{result.fragments_executed}</p>
						<p className='text-sm text-muted-foreground'>Distributed fragments</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className='pt-5'>
						<ZapIcon className='mb-2 size-6 text-chart-3' />
						<p className='text-3xl font-bold'>{(result.analysis_duration_ms / 1000).toFixed(2)}s</p>
						<p className='text-sm text-muted-foreground'>Total execution time</p>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className='text-sm'>Fragment Execution Timeline</CardTitle>
					<CardDescription>Each task routed to its optimal network node</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='space-y-2'>
						{segments.map((s, i) => (
							<div
								key={i}
								className='flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-3'
							>
								<div className='flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary'>
									F{i}
								</div>
								<div className='min-w-0 flex-1'>
									<p className='text-sm font-medium capitalize'>{s.task.replace(/_/g, ' ')}</p>
									<p className='truncate text-xs text-muted-foreground'>
										{s.node_id} · {s.rows_processed.toLocaleString()} units
									</p>
								</div>
								<div className='text-right'>
									<p className='text-sm font-semibold tabular-nums'>{s.duration_ms.toFixed(0)}ms</p>
									<p className='text-xs text-muted-foreground'>
										fidelity {(s.fidelity_score * 100).toFixed(1)}%
									</p>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{barData.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className='text-sm'>Duration per Fragment (ms)</CardTitle>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer
							width='100%'
							height={200}
						>
							<BarChart data={barData}>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='hsl(var(--border))'
								/>
								<XAxis
									dataKey='task'
									tick={{ fontSize: 9 }}
								/>
								<YAxis tick={{ fontSize: 10 }} />
								<Tooltip
									contentStyle={{
										background: 'hsl(var(--card))',
										border: '1px solid hsl(var(--border))',
										borderRadius: 8,
										fontSize: 11
									}}
								/>
								<Bar
									dataKey='Duration (ms)'
									fill={CHART_COLORS[0]}
									radius={[3, 3, 0, 0]}
								/>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ------------------------------------------------------------------
// Main page client
// ------------------------------------------------------------------
export function FinancialAnalyticsClient() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [jobId, setJobId] = useState<string | null>(() => searchParams.get('jobId'));
	const [job, setJob] = useState<FinancialJobResponse | null>(null);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		setJobId(searchParams.get('jobId'));
	}, [searchParams]);

	const stopPolling = useCallback(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
	}, []);

	const pollJob = useCallback(
		async (id: string) => {
			try {
				const res = await fetch(`/api/finance/${encodeURIComponent(id)}`);
				if (!res.ok) return;
				const data = (await res.json()) as FinancialJobResponse;
				setJob(data);
				if (data.status === 'COMPLETED' || data.status === 'FAILED') {
					stopPolling();
				}
			} catch {
				// ignore transient fetch errors during polling
			}
		},
		[stopPolling]
	);

	useEffect(() => {
		if (!jobId) return;
		void pollJob(jobId);
		pollRef.current = setInterval(() => void pollJob(jobId), POLL_INTERVAL_MS);
		return stopPolling;
	}, [jobId, pollJob, stopPolling]);

	const handleFile = async (file: File) => {
		setUploading(true);
		setUploadError(null);
		setJob(null);
		setJobId(null);
		stopPolling();
		router.replace('/finance', { scroll: false });

		try {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch('/api/finance', { method: 'POST', body: form });
			const data = (await res.json()) as { job_id?: string; error?: string };
			if (!res.ok || !data.job_id) {
				setUploadError(data.error ?? 'Upload failed.');
				return;
			}
			setJobId(data.job_id);
			router.replace(`/finance?jobId=${encodeURIComponent(data.job_id)}`, { scroll: false });
		} catch (err) {
			setUploadError(err instanceof Error ? err.message : 'Upload failed.');
		} finally {
			setUploading(false);
		}
	};

	const result = job?.result;
	const hash = useHash();
	const [tab, setTab] = useState('profiles');

	useEffect(() => {
		if (!result) return;
		const h = hash || 'profiles';
		const allowed = new Set<string>(['profiles', 'correlations', 'trends', 'anomalies', 'execution']);
		if (result.dcf) allowed.add('dcf');
		if (allowed.has(h)) setTab(h);
		else setTab('profiles');
	}, [result, hash]);

	const handleFinanceTabChange = (v: string) => {
		setTab(v);
		if (typeof window !== 'undefined') {
			window.history.replaceState(null, '', `#${v}`);
		}
	};

	const financeTabValue = tab === 'dcf' && !result?.dcf ? 'profiles' : tab;

	return (
		<div className='flex flex-col gap-6 px-4 py-6 lg:px-6'>
			{/* Header */}
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div className='space-y-1'>
					<div className='flex items-center gap-2'>
						<FlameIcon className='size-5 text-primary' />
						<h1 className='text-xl font-bold tracking-tight'>Financial Analytics</h1>
						<Badge variant='secondary'>
							<SparklesIcon className='mr-1 size-3' />
							Distributed
						</Badge>
					</div>
					<p className='max-w-2xl text-sm text-muted-foreground'>
						Upload a financial CSV and our distributed quantum network will run deep analytics — column
						profiling, correlation matrices, trend modelling, DCF valuation, and anomaly detection — across
						your data in seconds.
					</p>
				</div>
				<div className='flex flex-wrap items-center gap-2'>
					{jobId ? (
						<Button
							variant='secondary'
							size='sm'
							asChild
						>
							<Link href={`/runs/${encodeURIComponent(jobId)}`}>
								<GitBranchIcon className='mr-1.5 size-3.5' />
								Run detail — plan, peers, fragments
							</Link>
						</Button>
					) : null}
					{result && (
						<Button
							variant='outline'
							size='sm'
							onClick={() => {
								setJob(null);
								setJobId(null);
								stopPolling();
								router.replace('/finance', { scroll: false });
							}}
						>
							New Analysis
						</Button>
					)}
				</div>
			</div>

			<Separator />

			{/* Upload + error */}
			{!jobId && !uploading && <UploadZone onFile={file => void handleFile(file)} />}

			{uploading && (
				<div className='flex flex-col items-center gap-3 py-16 text-muted-foreground'>
					<Loader2Icon className='size-8 animate-spin text-primary' />
					<p className='text-sm font-medium'>Uploading to coordinator…</p>
				</div>
			)}

			{uploadError && (
				<Alert variant='destructive'>
					<XCircleIcon />
					<AlertTitle>Upload failed</AlertTitle>
					<AlertDescription>{uploadError}</AlertDescription>
				</Alert>
			)}

			{/* Job progress */}
			{job && !result && (
				<Card>
					<CardHeader>
						<div className='flex items-center gap-2'>
							{job.status === 'FAILED' ? (
								<XCircleIcon className='size-5 text-destructive' />
							) : (
								<Loader2Icon className='size-5 animate-spin text-primary' />
							)}
							<CardTitle className='text-base'>
								{job.status === 'FAILED' ? 'Analysis failed' : 'Distributing across network…'}
							</CardTitle>
						</div>
						<CardDescription>{job.filename}</CardDescription>
					</CardHeader>
					<CardContent className='space-y-4'>
						<JobProgressBar status={job.status} />
						{jobId ? (
							<Button
								variant='outline'
								size='sm'
								asChild
							>
								<Link href={`/runs/${encodeURIComponent(jobId)}`}>
									<GitBranchIcon className='mr-1.5 size-3.5' />
									Open run detail (live status)
								</Link>
							</Button>
						) : null}
						{job.error && (
							<Alert variant='destructive'>
								<AlertTitle>Error</AlertTitle>
								<AlertDescription className='font-mono text-xs'>{job.error}</AlertDescription>
							</Alert>
						)}
					</CardContent>
				</Card>
			)}

			{/* Full analytics dashboard */}
			{result && (
				<>
					<div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
						<CheckCircle2Icon className='size-4 text-chart-1' />
						<span className='font-medium text-foreground'>{result.filename}</span>
						<ChevronRightIcon className='size-3.5' />
						<span>
							{result.row_count.toLocaleString()} rows × {result.col_count} columns
						</span>
						<ChevronRightIcon className='size-3.5' />
						<span>{result.distributed_nodes_used} nodes</span>
						<ChevronRightIcon className='size-3.5' />
						<span>{(result.analysis_duration_ms / 1000).toFixed(2)}s</span>
					</div>

					<SummaryKpis result={result} />

					<Tabs
						value={financeTabValue}
						onValueChange={handleFinanceTabChange}
					>
						<TabsList className='flex-wrap'>
							<TabsTrigger value='profiles'>
								<DatabaseIcon className='mr-1.5 size-3.5' />
								Column Profiles
							</TabsTrigger>
							<TabsTrigger value='correlations'>
								<ZapIcon className='mr-1.5 size-3.5' />
								Correlations
							</TabsTrigger>
							<TabsTrigger value='trends'>
								<ActivityIcon className='mr-1.5 size-3.5' />
								Trends
							</TabsTrigger>
							{result.dcf && (
								<TabsTrigger value='dcf'>
									<BarChart2Icon className='mr-1.5 size-3.5' />
									DCF Valuation
								</TabsTrigger>
							)}
							<TabsTrigger value='anomalies'>
								<AlertTriangleIcon className='mr-1.5 size-3.5' />
								Anomalies
								{result.anomalies.length > 0 && (
									<Badge
										variant='destructive'
										className='ml-1.5 text-[10px]'
									>
										{result.anomalies.length}
									</Badge>
								)}
							</TabsTrigger>
							<TabsTrigger value='execution'>
								<NetworkIcon className='mr-1.5 size-3.5' />
								Execution
							</TabsTrigger>
						</TabsList>

						<TabsContent
							value='profiles'
							id='finance-tab-profiles'
							className='mt-4 scroll-mt-4'
						>
							<ColumnProfiles profiles={result.column_profiles} />
						</TabsContent>

						<TabsContent
							value='correlations'
							id='finance-tab-correlations'
							className='mt-4 scroll-mt-4'
						>
							<CorrelationPanel
								correlations={result.correlations}
								top={result.top_correlations}
							/>
						</TabsContent>

						<TabsContent
							value='trends'
							id='finance-tab-trends'
							className='mt-4 scroll-mt-4'
						>
							{result.time_series_insights.length > 0 ? (
								<TrendPanel insights={result.time_series_insights} />
							) : (
								<div className='py-16 text-center text-sm text-muted-foreground'>
									No time-series columns detected
								</div>
							)}
						</TabsContent>

						{result.dcf && (
							<TabsContent
								value='dcf'
								id='finance-tab-dcf'
								className='mt-4 scroll-mt-4'
							>
								<DCFPanel dcf={result.dcf} />
							</TabsContent>
						)}

						<TabsContent
							value='anomalies'
							id='finance-tab-anomalies'
							className='mt-4 scroll-mt-4'
						>
							<AnomalyPanel anomalies={result.anomalies} />
						</TabsContent>

						<TabsContent
							value='execution'
							id='finance-tab-execution'
							className='mt-4 scroll-mt-4'
						>
							<ExecutionPanel
								segments={result.node_execution}
								result={result}
							/>
						</TabsContent>
					</Tabs>
				</>
			)}
		</div>
	);
}
