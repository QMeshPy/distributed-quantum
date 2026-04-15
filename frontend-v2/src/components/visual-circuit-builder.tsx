'use client';

import * as React from 'react';
import {
	DndContext,
	PointerSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
	type DragEndEvent
} from '@dnd-kit/core';
import { EraserIcon, Grid3x3Icon, MinusIcon, PlusIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
	addMoment,
	addQubit,
	placeFromPalette,
	removeMoment,
	removeQubit,
	serializeOpenQasm2
} from '@/lib/visual-circuit';
import type { CircuitCell, PaletteItem, VisualCircuitState } from '@/types/visual-circuit';

const PALETTE: { item: PaletteItem; label: string; short: string; className?: string }[] = [
	{ item: { kind: 'single', gate: 'h' }, label: 'Hadamard', short: 'H' },
	{ item: { kind: 'single', gate: 'x' }, label: 'Pauli X', short: 'X' },
	{ item: { kind: 'single', gate: 'y' }, label: 'Pauli Y', short: 'Y' },
	{ item: { kind: 'single', gate: 'z' }, label: 'Pauli Z', short: 'Z' },
	{ item: { kind: 'single', gate: 's' }, label: 'Phase S', short: 'S' },
	{ item: { kind: 'single', gate: 't' }, label: 'T', short: 'T' },
	{ item: { kind: 'cx' }, label: 'CNOT (↓ target)', short: 'CX' },
	{ item: { kind: 'measure' }, label: 'Measure', short: 'M', className: 'border-chart-4/40 bg-chart-4/10' },
	{ item: { kind: 'erase' }, label: 'Erase cell', short: '⌫', className: 'border-muted-foreground/30' }
];

type VisualCircuitBuilderProps = {
	visual: VisualCircuitState;
	onVisualChange: (next: VisualCircuitState) => void;
};

function cellLabel(cell: CircuitCell): string {
	if (cell.kind === 'empty') return '';
	if (cell.kind === 'single') return cell.gate.toUpperCase();
	if (cell.kind === 'measure') return 'M';
	if (cell.kind === 'cx') return cell.role === 'control' ? '●' : '⊕';
	return '';
}

type PaletteRow = (typeof PALETTE)[number];

function PaletteDraggable({ id, item, label, short, className }: PaletteRow & { id: string }) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id,
		data: { paletteItem: item as PaletteItem }
	});

	return (
		<button
			ref={setNodeRef}
			type='button'
			className={cn(
				'flex min-w-[3rem] flex-col items-center justify-center rounded-2xl border border-border/80 bg-background/90 px-2 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40 hover:bg-muted/50',
				isDragging && 'opacity-40',
				className
			)}
			{...listeners}
			{...attributes}
		>
			<span className='text-[11px] text-muted-foreground'>{label}</span>
			<span className='mt-0.5 font-mono text-sm'>{short}</span>
		</button>
	);
}

function CircuitCellDropZone({
	id,
	columnIndex,
	qubitIndex,
	cell
}: {
	id: string;
	columnIndex: number;
	qubitIndex: number;
	cell: CircuitCell;
}) {
	const { setNodeRef, isOver } = useDroppable({
		id,
		data: { columnIndex, qubitIndex }
	});

	return (
		<div
			ref={setNodeRef}
			className={cn(
				'relative flex min-h-[52px] min-w-[56px] items-center justify-center rounded-2xl border-2 border-dashed border-border/70 bg-muted/15 transition',
				isOver && 'border-primary/60 bg-primary/5',
				cell.kind !== 'empty' && 'border-solid border-border bg-background/80',
				cell.kind === 'cx' && cell.role === 'control' && 'rounded-r-none border-r-0',
				cell.kind === 'cx' && cell.role === 'target' && 'rounded-l-none border-l-0'
			)}
		>
			{cell.kind === 'cx' && cell.role === 'control' ? (
				<div className='absolute inset-y-2 -right-px z-0 w-6 border-y border-r border-border bg-muted/20' />
			) : null}
			<span
				className={cn(
					'relative z-[1] font-mono text-sm font-semibold',
					cell.kind === 'empty' && 'text-muted-foreground/40'
				)}
			>
				{cell.kind === 'empty' ? '·' : cellLabel(cell)}
			</span>
		</div>
	);
}

export function VisualCircuitBuilder({ visual, onVisualChange }: VisualCircuitBuilderProps) {
	const uid = React.useId().replace(/:/g, '');
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 6 }
		})
	);

	const applyOpenQasm = React.useCallback(
		(next: VisualCircuitState) => {
			onVisualChange(next);
		},
		[onVisualChange]
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over) return;
		const paletteItem = active.data.current?.paletteItem as PaletteItem | undefined;
		const columnIndex = over.data.current?.columnIndex as number | undefined;
		const qubitIndex = over.data.current?.qubitIndex as number | undefined;
		if (!paletteItem || columnIndex === undefined || qubitIndex === undefined) return;

		const next = placeFromPalette(visual, columnIndex, qubitIndex, paletteItem);
		applyOpenQasm(next);
	};

	const bumpMoments = () => applyOpenQasm(addMoment(visual));
	const trimMoments = () => applyOpenQasm(removeMoment(visual));
	const bumpQubits = () => applyOpenQasm(addQubit(visual));
	const trimQubits = () => applyOpenQasm(removeQubit(visual));

	const serializedPreview = React.useMemo(() => serializeOpenQasm2(visual).trim(), [visual]);

	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<div className='flex flex-wrap items-center gap-2'>
					<p className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
						<Grid3x3Icon className='size-3.5' />
						Gate palette — drag onto the grid
					</p>
				</div>
				<div className='flex flex-wrap gap-2'>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={bumpQubits}
					>
						<PlusIcon />
						Qubit
					</Button>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={trimQubits}
						disabled={visual.numQubits <= 1}
					>
						<MinusIcon />
						Qubit
					</Button>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={bumpMoments}
					>
						<PlusIcon />
						Step
					</Button>
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={trimMoments}
						disabled={visual.columns.length <= 1}
					>
						<MinusIcon />
						Step
					</Button>
				</div>
			</div>

			<DndContext
				sensors={sensors}
				onDragEnd={handleDragEnd}
			>
				<div className='flex flex-wrap gap-2 rounded-3xl border border-border/70 bg-muted/20 p-3'>
					{PALETTE.map((row, i) => (
						<PaletteDraggable
							key={`${row.short}-${i}`}
							id={`${uid}-pal-${i}`}
							{...row}
						/>
					))}
				</div>

				<div className='overflow-x-auto rounded-3xl border border-border/80 bg-gradient-to-br from-background/95 to-muted/20 p-4'>
					<div className='inline-flex min-w-min flex-col gap-2'>
						<div className='flex gap-2 pl-14'>
							{visual.columns.map((_, m) => (
								<div
									key={`hdr-${m}`}
									className='flex w-14 shrink-0 justify-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground'
								>
									t{m + 1}
								</div>
							))}
						</div>
						{Array.from({ length: visual.numQubits }, (_, q) => (
							<div
								key={`row-${q}`}
								className='flex items-center gap-2'
							>
								<div className='flex w-12 shrink-0 justify-end pr-2 font-mono text-xs text-muted-foreground'>
									q{q}
								</div>
								<div className='flex gap-2'>
									{visual.columns.map((col, m) => {
										const cell = col[q] ?? { kind: 'empty' as const };
										return (
											<CircuitCellDropZone
												key={`c-${m}-${q}`}
												id={`${uid}-cell-${m}-${q}`}
												columnIndex={m}
												qubitIndex={q}
												cell={cell}
											/>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</div>
			</DndContext>

			<p className='text-xs leading-5 text-muted-foreground'>
				<EraserIcon className='mr-1 inline size-3.5 align-text-bottom' />
				CNOT spans the dropped qubit and the one below. Unsupported OpenQASM (e.g. mid-circuit classical logic)
				stays in the text tab only.
			</p>

			<details className='rounded-2xl border border-border/60 bg-muted/10 px-3 py-2 text-xs'>
				<summary className='cursor-pointer font-medium text-muted-foreground'>
					Generated OpenQASM preview
				</summary>
				<pre className='mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-foreground/90'>
					{serializedPreview || '—'}
				</pre>
			</details>
		</div>
	);
}
