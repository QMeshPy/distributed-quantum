import { VisualCircuitBuilder } from '@/components/visual-circuit-builder';

export default function CircuitPathsPage() {
	return (
		<div className='flex flex-col gap-6 p-6'>
			<div className='flex flex-col gap-2'>
				<h1 className='text-2xl font-semibold tracking-tight'>Circuit Paths</h1>
				<p className='text-sm text-muted-foreground'>
					Design and visualize quantum circuit execution paths
				</p>
			</div>

			<VisualCircuitBuilder />
		</div>
	);
}
