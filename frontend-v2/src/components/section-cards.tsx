'use client';

import type { DashboardSummaryCard } from '@/types/dashboard';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type SectionCardsProps = {
	cards: DashboardSummaryCard[];
	isLoading?: boolean;
};

export function SectionCards({ cards, isLoading = false }: SectionCardsProps) {
	if (isLoading) {
		return (
			<div className='grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4'>
				{Array.from({ length: 4 }, (_, index) => (
					<Card
						key={index}
						className='@container/card'
					>
						<CardHeader>
							<Skeleton className='h-4 w-28' />
							<Skeleton className='h-9 w-24' />
							<CardAction>
								<Skeleton className='h-5 w-20 rounded-full' />
							</CardAction>
						</CardHeader>
						<CardFooter className='flex-col items-start gap-2'>
							<Skeleton className='h-4 w-full max-w-48' />
							<Skeleton className='h-4 w-full max-w-36' />
						</CardFooter>
					</Card>
				))}
			</div>
		);
	}

	return (
		<div className='grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card'>
			{cards.map(card => (
				<Card
					key={card.id}
					className='@container/card'
				>
					<CardHeader>
						<CardDescription>{card.title}</CardDescription>
						<CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
							{card.value}
						</CardTitle>
						{card.badge ? (
							<CardAction>
								<Badge variant={card.badge.variant}>{card.badge.label}</Badge>
							</CardAction>
						) : null}
					</CardHeader>
					<CardFooter className='flex-col items-start gap-1.5 text-sm'>
						<div className='line-clamp-2 font-medium'>{card.description}</div>
						<div className='text-muted-foreground'>{card.footnote}</div>
					</CardFooter>
				</Card>
			))}
		</div>
	);
}
