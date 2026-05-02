'use client';

import type { OptionsJobStatus } from '@/types/options';

const STEPS: { key: OptionsJobStatus | 'encoding' | 'estimating'; label: string }[] = [
	{ key: 'queued', label: 'Queued' },
	{ key: 'encoding', label: 'Encoding Circuit' },
	{ key: 'estimating', label: 'IQAE Running' },
	{ key: 'completed', label: 'Completed' }
];

function stepIndex(status: OptionsJobStatus): number {
	if (status === 'queued') return 0;
	if (status === 'running') return 2;
	if (status === 'completed') return 3;
	return 0;
}

export function OptionsJobProgress({ status }: { status: OptionsJobStatus }) {
	const current = stepIndex(status);
	return (
		<div className='flex items-center gap-1 flex-wrap'>
			{STEPS.map((step, i) => {
				const done = i < current;
				const active = i === current;
				return (
					<span
						key={step.key}
						className={[
							'rounded px-2 py-0.5 text-[0.7rem] font-medium',
							done
								? 'bg-green-100 text-green-700'
								: active
									? 'bg-blue-100 text-blue-700 animate-pulse'
									: 'bg-muted text-muted-foreground'
						].join(' ')}
					>
						{step.label}
					</span>
				);
			})}
		</div>
	);
}
