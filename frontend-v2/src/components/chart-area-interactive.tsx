'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { DashboardChartMetricKey, DashboardChartPoint } from '@/types/dashboard';
import { BarChart3Icon } from 'lucide-react';

export const description = 'An interactive area chart';

type ChartAreaInteractiveProps = {
	nodes: DashboardChartPoint[];
	isLoading?: boolean;
	selectedNodeId: string | null;
	onSelectNode: (nodeId: string | null) => void;
};

const metricOptions: Record<
	DashboardChartMetricKey,
	{
		label: string;
		description: string;
		formatValue: (value: number) => string;
	}
> = {
	averageFidelity: {
		label: 'Average fidelity',
		description: 'How strong each node looks across its current fidelity samples.',
		formatValue: value => `${value.toFixed(2)}%`
	},
	availableServices: {
		label: 'Available services',
		description: 'Schedulable service advertisements per node.',
		formatValue: value => value.toLocaleString('en-US')
	},
	maxQubits: {
		label: 'Max qubits',
		description: 'Highest qubit ceiling currently advertised by the node.',
		formatValue: value => `${value.toLocaleString('en-US')}q`
	}
};

const chartConfig = {
	averageFidelity: {
		label: metricOptions.averageFidelity.label,
		color: 'var(--primary)'
	},
	availableServices: {
		label: metricOptions.availableServices.label,
		color: 'hsl(var(--chart-2, 215 90% 52%))'
	},
	maxQubits: {
		label: metricOptions.maxQubits.label,
		color: 'var(--primary)'
	}
} satisfies ChartConfig;

export function ChartAreaInteractive({
	nodes,
	isLoading = false,
	selectedNodeId,
	onSelectNode
}: ChartAreaInteractiveProps) {
	const [metric, setMetric] = React.useState<DashboardChartMetricKey>('averageFidelity');

	if (isLoading) {
		return (
			<Card className='@container/card'>
				<CardHeader>
					<Skeleton className='h-6 w-52' />
					<Skeleton className='h-4 w-72' />
					<CardAction>
						<Skeleton className='h-8 w-40 rounded-full' />
					</CardAction>
				</CardHeader>
				<CardContent className='space-y-4 px-2 pt-4 sm:px-6 sm:pt-6'>
					<Skeleton className='h-[250px] w-full rounded-3xl' />
					<div className='flex flex-wrap gap-2'>
						{Array.from({ length: 4 }, (_, index) => (
							<Skeleton
								key={index}
								className='h-8 w-24 rounded-full'
							/>
						))}
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!nodes.length) {
		return (
			<Card className='@container/card'>
				<CardHeader>
					<CardTitle>Node capacity snapshot</CardTitle>
					<CardDescription>Waiting for node advertisements from the backend.</CardDescription>
				</CardHeader>
				<CardContent>
					<Empty className='border border-dashed'>
						<EmptyHeader>
							<EmptyMedia variant='icon'>
								<BarChart3Icon />
							</EmptyMedia>
							<EmptyTitle>No chart data yet</EmptyTitle>
							<EmptyDescription>
								Once the coordinator exposes services and fidelity samples, this chart will populate
								automatically.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				</CardContent>
			</Card>
		);
	}

	const filteredNodes = selectedNodeId ? nodes.filter(node => node.nodeId === selectedNodeId) : nodes;
	const activeMetric = metricOptions[metric];

	return (
		<Card className='@container/card'>
			<CardHeader>
				<CardTitle>Node capacity snapshot</CardTitle>
				<CardDescription>{activeMetric.description}</CardDescription>
				<CardAction>
					<ToggleGroup
						type='single'
						value={metric}
						onValueChange={value => {
							if (value) {
								setMetric(value as DashboardChartMetricKey);
							}
						}}
						variant='outline'
						className='hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex'
					>
						<ToggleGroupItem value='averageFidelity'>Average fidelity</ToggleGroupItem>
						<ToggleGroupItem value='availableServices'>Available services</ToggleGroupItem>
						<ToggleGroupItem value='maxQubits'>Max qubits</ToggleGroupItem>
					</ToggleGroup>
					<Select
						value={metric}
						onValueChange={value => setMetric(value as DashboardChartMetricKey)}
					>
						<SelectTrigger
							className='flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden'
							size='sm'
							aria-label='Select a value'
						>
							<SelectValue placeholder='Average fidelity' />
						</SelectTrigger>
						<SelectContent className='rounded-xl'>
							<SelectItem
								value='averageFidelity'
								className='rounded-lg'
							>
								Average fidelity
							</SelectItem>
							<SelectItem
								value='availableServices'
								className='rounded-lg'
							>
								Available services
							</SelectItem>
							<SelectItem
								value='maxQubits'
								className='rounded-lg'
							>
								Max qubits
							</SelectItem>
						</SelectContent>
					</Select>
				</CardAction>
			</CardHeader>
			<CardContent className='space-y-4 px-2 pt-4 sm:px-6 sm:pt-6'>
				<ChartContainer
					config={chartConfig}
					className='aspect-auto h-[250px] w-full'
				>
					<BarChart data={filteredNodes}>
						<CartesianGrid vertical={false} />
						<YAxis
							tickLine={false}
							axisLine={false}
							width={44}
							tickFormatter={value => activeMetric.formatValue(Number(value))}
						/>
						<XAxis
							dataKey='nodeLabel'
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							minTickGap={16}
						/>
						<ChartTooltip
							cursor={false}
							content={
								<ChartTooltipContent
									labelFormatter={(_, payload) => {
										return typeof payload?.[0]?.payload?.nodeId === 'string'
											? payload[0].payload.nodeId
											: 'Node';
									}}
									formatter={value => {
										return (
											<div className='flex flex-1 items-center justify-between gap-2'>
												<span className='text-muted-foreground'>{activeMetric.label}</span>
												<span className='font-mono font-medium tabular-nums text-foreground'>
													{activeMetric.formatValue(Number(value))}
												</span>
											</div>
										);
									}}
									indicator='dot'
								/>
							}
						/>
						<Bar
							dataKey={metric}
							fill={`var(--color-${metric})`}
							radius={[12, 12, 0, 0]}
						/>
					</BarChart>
				</ChartContainer>
				<div className='flex flex-wrap gap-2'>
					<Button
						variant={selectedNodeId === null ? 'default' : 'outline'}
						size='xs'
						onClick={() => onSelectNode(null)}
					>
						All nodes
					</Button>
					{nodes.map(node => (
						<Button
							key={node.nodeId}
							variant={selectedNodeId === node.nodeId ? 'default' : 'outline'}
							size='xs'
							onClick={() => onSelectNode(node.nodeId)}
						>
							{node.nodeLabel}
						</Button>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
