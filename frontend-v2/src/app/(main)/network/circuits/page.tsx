'use client';

import * as React from 'react';

import { VisualCircuitBuilder } from '@/components/visual-circuit-builder';
import type { VisualCircuitState } from '@/types/visual-circuit';

export default function CircuitPathsPage() {
	const [visual, setVisual] = React.useState<VisualCircuitState>({
		numQubits: 2,
		columns: [
			[{ kind: 'empty' }, { kind: 'empty' }],
			[{ kind: 'empty' }, { kind: 'empty' }],
			[{ kind: 'empty' }, { kind: 'empty' }]
		]
	});

	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Circuit Paths</h1>
				<p className='text-sm text-muted-foreground'>
					Design and visualize quantum circuit execution paths
				</p>
			</div>

			<VisualCircuitBuilder visual={visual} onVisualChange={setVisual} />
		</div>
	);
}
