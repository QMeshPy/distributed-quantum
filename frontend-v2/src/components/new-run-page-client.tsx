'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import * as React from 'react';
import {
	AlertCircleIcon,
	CheckCircle2Icon,
	Code2Icon,
	LayoutGridIcon,
	Loader2Icon,
	PlayCircleIcon,
	RefreshCcwIcon,
	SparklesIcon
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { VisualCircuitBuilder } from '@/components/visual-circuit-builder';
import { useCircuitComposer } from '@/hooks/use-circuit-composer';
import { useCreateRun } from '@/hooks/use-create-run';
import { createDefaultVisualCircuit, serializeOpenQasm2, tryImportOpenQasmToVisual } from '@/lib/visual-circuit';
import { cn } from '@/lib/utils';
import type { CircuitSnippetCategory } from '@/types/circuit-composer';
import type { VisualCircuitState } from '@/types/visual-circuit';

const SNIPPET_CATEGORY_ORDER: CircuitSnippetCategory[] = [
	'Registers',
	'Single-qubit',
	'Entanglement',
	'Readout',
	'Algorithms'
];

const SNIPPET_CATEGORY_THEME: Record<
	CircuitSnippetCategory,
	{ header: string; badge: string; card: string; code: string }
> = {
	Registers: {
		header: 'text-chart-1',
		badge: 'border-chart-1/40 bg-chart-1/10 text-chart-1 dark:bg-chart-1/15',
		card: 'border-chart-1/25 hover:border-chart-1/45 hover:bg-chart-1/5',
		code: 'bg-chart-1/8 text-foreground/90 dark:bg-chart-1/12'
	},
	'Single-qubit': {
		header: 'text-chart-2',
		badge: 'border-chart-2/40 bg-chart-2/10 text-chart-2 dark:bg-chart-2/15',
		card: 'border-chart-2/25 hover:border-chart-2/45 hover:bg-chart-2/5',
		code: 'bg-chart-2/8 text-foreground/90 dark:bg-chart-2/12'
	},
	Entanglement: {
		header: 'text-chart-3',
		badge: 'border-chart-3/40 bg-chart-3/10 text-chart-3 dark:bg-chart-3/15',
		card: 'border-chart-3/25 hover:border-chart-3/45 hover:bg-chart-3/5',
		code: 'bg-chart-3/8 text-foreground/90 dark:bg-chart-3/12'
	},
	Readout: {
		header: 'text-chart-4',
		badge: 'border-chart-4/40 bg-chart-4/10 text-chart-4 dark:bg-chart-4/15',
		card: 'border-chart-4/25 hover:border-chart-4/45 hover:bg-chart-4/5',
		code: 'bg-chart-4/8 text-foreground/90 dark:bg-chart-4/12'
	},
	Algorithms: {
		header: 'text-chart-5',
		badge: 'border-chart-5/40 bg-chart-5/10 text-chart-5 dark:bg-chart-5/15',
		card: 'border-chart-5/25 hover:border-chart-5/45 hover:bg-chart-5/5',
		code: 'bg-chart-5/8 text-foreground/90 dark:bg-chart-5/12'
	}
};

export function NewRunPageClient() {
	const {
		analysis,
		editorRef,
		openqasm,
		selectedTemplateId,
		templates,
		snippets,
		setOpenqasm,
		applyTemplate,
		insertSnippet,
		resetComposer
	} = useCircuitComposer();
	const { createRun, error, isPending } = useCreateRun();
	const snippetGroups = SNIPPET_CATEGORY_ORDER.map(category => ({
		category,
		items: snippets.filter(snippet => snippet.category === category)
	}));

	const [circuitTab, setCircuitTab] = React.useState<'visual' | 'code'>('code');
	const [visual, setVisual] = React.useState<VisualCircuitState>(() => createDefaultVisualCircuit());
	const [visualUnsupported, setVisualUnsupported] = React.useState(false);
	const openqasmFromVisualRef = React.useRef(false);

	const applyTemplateAndPreferCode = React.useCallback(
		(templateId: string) => {
			applyTemplate(templateId);
			setCircuitTab('code');
		},
		[applyTemplate]
	);

	const insertSnippetAndPreferCode = React.useCallback(
		(snippetId: string) => {
			insertSnippet(snippetId);
			setCircuitTab('code');
		},
		[insertSnippet]
	);

	const resetComposerAndPreferCode = React.useCallback(() => {
		resetComposer();
		setCircuitTab('code');
	}, [resetComposer]);

	const handleVisualChange = React.useCallback(
		(next: VisualCircuitState) => {
			setVisual(next);
			const serialized = serializeOpenQasm2(next);
			openqasmFromVisualRef.current = true;
			setOpenqasm(serialized);
			setVisualUnsupported(false);
		},
		[setOpenqasm]
	);

	React.useEffect(() => {
		if (circuitTab !== 'visual') return;
		if (openqasmFromVisualRef.current) {
			openqasmFromVisualRef.current = false;
			return;
		}
		const parsed = tryImportOpenQasmToVisual(openqasm);
		if (parsed) {
			setVisual(parsed);
			setVisualUnsupported(false);
		} else {
			setVisualUnsupported(true);
		}
	}, [openqasm, circuitTab]);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		try {
			await createRun({
				circuit: openqasm
			});
		} catch {
			// Submission errors are surfaced by the hook and shown inline in the page.
		}
	};

	return (
		<div className='flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6'>
			<section className='relative overflow-hidden rounded-4xl border border-border/80 bg-gradient-to-br from-chart-1/12 via-background to-chart-3/12 p-6 shadow-sm dark:from-chart-1/18 dark:via-background dark:to-chart-3/18'>
				<div className='pointer-events-none absolute -top-12 right-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl' />
				<div className='pointer-events-none absolute bottom-0 left-0 h-32 w-32 rounded-full bg-chart-2/20 blur-3xl' />
				<div className='relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
					<div className='max-w-3xl space-y-3'>
						<div className='flex flex-wrap items-center gap-2'>
							<Badge variant='secondary'>Visual + OpenQASM</Badge>
							<Badge variant='outline'>Coordinator-routed</Badge>
							<Badge variant='outline'>Drag-and-drop gates</Badge>
						</div>
						<div className='space-y-2'>
							<h1 className='text-2xl font-semibold tracking-tight text-balance'>
								Design a circuit, then queue it on the real backend
							</h1>
							<p className='max-w-2xl text-sm leading-6 text-muted-foreground'>
								Use the grid builder (gates from the standard library) or edit OpenQASM directly.
								Submitting posts the same circuit string to{' '}
								<code className='rounded bg-muted/80 px-1.5 py-0.5 font-mono text-xs'>
									POST /api/runs
								</code>
								.
							</p>
						</div>
					</div>

					<div className='flex flex-wrap gap-2'>
						<Button
							type='button'
							variant='outline'
							size='sm'
							onClick={resetComposerAndPreferCode}
						>
							<RefreshCcwIcon />
							Reset starter
						</Button>
						<Button
							variant='ghost'
							size='sm'
							asChild
						>
							<Link href='/runs'>Back to runs</Link>
						</Button>
					</div>
				</div>
			</section>

			{error ? (
				<Alert variant='destructive'>
					<AlertCircleIcon />
					<AlertTitle>Run submission failed</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			<div className='grid min-h-0 flex-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]'>
				<form
					id='new-run-circuit-form'
					className='flex min-h-0 min-w-0 flex-col'
					onSubmit={handleSubmit}
				>
					<Card className='min-h-0 flex flex-1 flex-col border-border/80 shadow-sm'>
						<CardHeader className='border-b border-border/60'>
							<div className='flex flex-wrap items-start justify-between gap-4'>
								<div className='space-y-1.5'>
									<div className='flex flex-wrap items-center gap-2'>
										<CardTitle>Circuit workspace</CardTitle>
										<Badge variant={analysis.readyToSubmit ? 'default' : 'secondary'}>
											{analysis.readyToSubmit ? 'Ready to queue' : 'Needs review'}
										</Badge>
									</div>
									<CardDescription>
										Visual grid and OpenQASM stay in sync when the circuit uses supported gates.
									</CardDescription>
								</div>
								<div className='grid min-w-[220px] grid-cols-2 gap-2 sm:grid-cols-3'>
									<MetricTile
										label='Version'
										value={
											analysis.detectedVersion ? `QASM ${analysis.detectedVersion}` : 'Missing'
										}
									/>
									<MetricTile
										label='Operations'
										value={String(analysis.operationCount)}
									/>
									<MetricTile
										label='Measurements'
										value={String(analysis.measurementCount)}
									/>
									<MetricTile
										label='Quantum regs'
										value={String(analysis.quantumRegisterCount)}
									/>
									<MetricTile
										label='Classical regs'
										value={String(analysis.classicalRegisterCount)}
									/>
									<MetricTile
										label='Lines'
										value={String(analysis.nonEmptyLineCount)}
									/>
								</div>
							</div>
						</CardHeader>

						<CardContent className='flex min-h-0 flex-1 flex-col gap-5 pt-6'>
							{circuitTab === 'visual' && visualUnsupported ? (
								<Alert variant='destructive'>
									<AlertCircleIcon />
									<AlertTitle>Visual builder can&apos;t mirror this OpenQASM</AlertTitle>
									<AlertDescription>
										This text uses gates or control flow outside the drag-and-drop palette (for
										example <code className='rounded bg-background px-1 font-mono text-xs'>rz</code>
										, <code className='rounded bg-background px-1 font-mono text-xs'>if</code>, or
										non-adjacent{' '}
										<code className='rounded bg-background px-1 font-mono text-xs'>cx</code>). Edit
										in the OpenQASM tab, or switch to a simpler template.
									</AlertDescription>
								</Alert>
							) : null}

							<div className='rounded-4xl border border-border/70 bg-gradient-to-br from-muted/25 via-muted/15 to-chart-5/5 p-3 shadow-inner shadow-black/5 dark:to-chart-5/10'>
								<div className='mb-3 flex flex-wrap items-center justify-between gap-3 px-1'>
									<div>
										<p className='text-sm font-medium'>
											{selectedTemplateId
												? (templates.find(template => template.id === selectedTemplateId)
														?.title ?? 'Starter template')
												: 'Custom circuit'}
										</p>
										<p className='text-xs text-muted-foreground'>
											{circuitTab === 'visual'
												? 'Drop gates on the grid; the OpenQASM tab shows the generated program.'
												: 'Edits apply to the payload sent when you queue the run.'}
										</p>
									</div>
									<div className='flex flex-wrap gap-2'>
										<Badge variant='outline'>Auto-routing</Badge>
										<Badge variant='outline'>Shots: backend</Badge>
									</div>
								</div>

								<Tabs
									value={circuitTab}
									onValueChange={value => setCircuitTab(value as 'visual' | 'code')}
									className='gap-4'
								>
									<TabsList className='h-auto w-full flex-wrap justify-start gap-1 rounded-3xl bg-background/80 p-1'>
										<TabsTrigger
											type='button'
											value='visual'
											className='rounded-2xl px-4 py-2'
										>
											<LayoutGridIcon />
											Visual builder
										</TabsTrigger>
										<TabsTrigger
											type='button'
											value='code'
											className='rounded-2xl px-4 py-2'
										>
											<Code2Icon />
											OpenQASM
										</TabsTrigger>
									</TabsList>
									<TabsContent
										value='visual'
										className='mt-0 outline-none'
									>
										<VisualCircuitBuilder
											visual={visual}
											onVisualChange={handleVisualChange}
										/>
									</TabsContent>
									<TabsContent
										value='code'
										className='mt-0 outline-none'
									>
										<Textarea
											ref={editorRef}
											value={openqasm}
											onChange={event => setOpenqasm(event.target.value)}
											spellCheck={false}
											className='min-h-[min(52vh,560px)] rounded-3xl border border-border/80 bg-background/90 font-mono text-sm leading-7 shadow-sm focus-visible:bg-background'
											placeholder='Paste OpenQASM 2.0 or 3.x here...'
										/>
									</TabsContent>
								</Tabs>
							</div>

							{analysis.warnings.length > 0 ? (
								<Alert>
									<AlertCircleIcon />
									<AlertTitle>Readiness notes</AlertTitle>
									<AlertDescription className='space-y-2'>
										<p>
											The circuit can still be edited and queued, but these checks are worth
											cleaning up first:
										</p>
										<ul className='space-y-1 pl-4 text-sm'>
											{analysis.warnings.map(warning => (
												<li
													key={warning}
													className='list-disc'
												>
													{warning}
												</li>
											))}
										</ul>
									</AlertDescription>
								</Alert>
							) : (
								<Alert>
									<CheckCircle2Icon />
									<AlertTitle>Submission shape looks healthy</AlertTitle>
									<AlertDescription>
										The circuit has the core pieces we expect, so you should get a cleaner handoff
										into the coordinator and more useful detail pages afterward.
									</AlertDescription>
								</Alert>
							)}
						</CardContent>

						<CardFooter className='flex flex-wrap items-center justify-between gap-3 border-t border-border/60'>
							<p className='text-sm text-muted-foreground'>
								After queueing, we redirect straight to the live run detail page so status, plan, and
								results stay in one flow.
							</p>
							<div className='flex flex-wrap gap-2'>
								<Button
									type='button'
									variant='ghost'
									asChild
								>
									<Link href='/runs'>Discard</Link>
								</Button>
								<Button
									type='submit'
									form='new-run-circuit-form'
									disabled={isPending || openqasm.trim().length === 0}
								>
									{isPending ? <Loader2Icon className='animate-spin' /> : <PlayCircleIcon />}
									Queue run
								</Button>
							</div>
						</CardFooter>
					</Card>
				</form>

				<div className='flex min-h-0 flex-col gap-6'>
					<Card className='min-h-0 border-border/80 shadow-sm'>
						<CardHeader className='border-b border-border/60'>
							<div className='space-y-1.5'>
								<CardTitle>Starter kit</CardTitle>
								<CardDescription>
									Use templates to replace the whole circuit, or snippets to patch the editor in
									place.
								</CardDescription>
							</div>
						</CardHeader>
						<CardContent className='min-h-0 flex-1 pt-6'>
							<Tabs
								defaultValue='templates'
								className='min-h-0'
							>
								<TabsList className='w-full justify-start'>
									<TabsTrigger
										type='button'
										value='templates'
									>
										Templates
									</TabsTrigger>
									<TabsTrigger
										type='button'
										value='snippets'
									>
										Snippets
									</TabsTrigger>
									<TabsTrigger
										type='button'
										value='inspect'
									>
										Inspect
									</TabsTrigger>
								</TabsList>

								<TabsContent
									value='templates'
									className='min-h-0 pt-4'
								>
									<ScrollArea className='h-[420px] pr-3'>
										<div className='space-y-3'>
											{templates.map(template => {
												const isActive = selectedTemplateId === template.id;

												return (
													<button
														key={template.id}
														type='button'
														onClick={() => applyTemplateAndPreferCode(template.id)}
														className={cn(
															'flex w-full flex-col gap-3 rounded-3xl border border-border/80 bg-background/80 p-4 text-left transition hover:border-foreground/15 hover:bg-muted/40',
															isActive && 'border-primary/35 bg-primary/5 shadow-sm'
														)}
													>
														<div className='flex flex-wrap items-start justify-between gap-3'>
															<div className='space-y-1'>
																<p className='font-medium'>{template.title}</p>
																<p className='text-sm text-muted-foreground'>
																	{template.description}
																</p>
															</div>
															{isActive ? (
																<Badge variant='default'>Loaded</Badge>
															) : (
																<Badge variant='outline'>Apply</Badge>
															)}
														</div>

														<div className='flex flex-wrap gap-2'>
															{template.tags.map(tag => (
																<Badge
																	key={tag}
																	variant='secondary'
																>
																	{tag}
																</Badge>
															))}
														</div>

														<div className='grid gap-1 text-xs text-muted-foreground'>
															{template.highlights.map(highlight => (
																<p key={highlight}>• {highlight}</p>
															))}
														</div>
													</button>
												);
											})}
										</div>
									</ScrollArea>
								</TabsContent>

								<TabsContent
									value='snippets'
									className='min-h-0 pt-4'
								>
									<ScrollArea className='h-[420px] pr-3'>
										<div className='space-y-5'>
											{snippetGroups.map(group => {
												const theme = SNIPPET_CATEGORY_THEME[group.category];

												return (
													<div
														key={group.category}
														className='space-y-3'
													>
														<div className='flex items-center justify-between gap-2 border-b border-border/50 pb-2'>
															<p
																className={cn(
																	'text-sm font-semibold tracking-tight',
																	theme.header
																)}
															>
																{group.category}
															</p>
															<Badge
																variant='outline'
																className={cn('border font-normal', theme.badge)}
															>
																{group.items.length} snippets
															</Badge>
														</div>
														<div className='grid gap-2 sm:grid-cols-2'>
															{group.items.map(snippet => (
																<button
																	key={snippet.id}
																	type='button'
																	onClick={() =>
																		insertSnippetAndPreferCode(snippet.id)
																	}
																	className={cn(
																		'rounded-3xl border bg-background/80 p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
																		theme.card
																	)}
																>
																	<div className='flex items-center justify-between gap-2'>
																		<p className='font-medium'>{snippet.label}</p>
																		<Badge
																			variant='outline'
																			className={cn(
																				'shrink-0 border text-xs font-normal',
																				theme.badge
																			)}
																		>
																			Insert
																		</Badge>
																	</div>
																	<p className='mt-1 text-xs text-muted-foreground'>
																		{snippet.description}
																	</p>
																	<code
																		className={cn(
																			'mt-3 block max-h-40 overflow-y-auto rounded-2xl px-3 py-2 font-mono text-[11px] leading-5 whitespace-pre-wrap break-all',
																			theme.code
																		)}
																	>
																		{snippet.snippet}
																	</code>
																</button>
															))}
														</div>
													</div>
												);
											})}
										</div>
									</ScrollArea>
								</TabsContent>

								<TabsContent
									value='inspect'
									className='min-h-0 pt-4'
								>
									<div className='space-y-3'>
										<div className='flex items-center justify-between gap-2'>
											<div>
												<p className='font-medium'>Operation preview</p>
												<p className='text-xs text-muted-foreground'>
													First detected gate and measurement lines, useful for a quick sanity
													pass.
												</p>
											</div>
											<Badge variant='secondary'>
												<SparklesIcon />
												Live parsed
											</Badge>
										</div>

										<ScrollArea className='h-[220px] rounded-3xl border border-border/80 bg-muted/25 p-3'>
											{analysis.operationPreview.length > 0 ? (
												<div className='space-y-2 font-mono text-xs leading-6'>
													{analysis.operationPreview.map((line, index) => (
														<div
															key={`${line}-${index}`}
															className='flex gap-3 rounded-2xl bg-background/80 px-3 py-1.5'
														>
															<span className='w-6 text-right text-muted-foreground'>
																{index + 1}
															</span>
															<span className='min-w-0 break-all'>{line}</span>
														</div>
													))}
												</div>
											) : (
												<div className='flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
													<AlertCircleIcon className='size-5' />
													<p>No operations detected yet.</p>
												</div>
											)}
										</ScrollArea>
									</div>
								</TabsContent>
							</Tabs>
						</CardContent>
						<CardFooter className='border-t border-border/60'>
							<div className='flex items-start gap-3 text-sm text-muted-foreground'>
								<PlayCircleIcon className='mt-0.5 size-4 shrink-0' />
								<p>
									This layout is intentionally ready for a richer composer later. Templates, snippets,
									and analysis already live behind typed interfaces instead of page-only ad hoc state.
								</p>
							</div>
						</CardFooter>
					</Card>
				</div>
			</div>
		</div>
	);
}

function MetricTile({ label, value }: { label: string; value: string }) {
	return (
		<div className='rounded-3xl border border-border/70 bg-muted/25 px-3 py-2'>
			<p className='text-[11px] uppercase tracking-[0.2em] text-muted-foreground'>{label}</p>
			<p className='mt-1 text-sm font-medium'>{value}</p>
		</div>
	);
}

function ContractRow({ label, value, description }: { label: string; value: string; description: string }) {
	return (
		<div className='rounded-3xl border border-border/80 bg-muted/20 p-4'>
			<div className='flex flex-wrap items-center justify-between gap-2'>
				<p className='text-sm font-medium'>{label}</p>
				<Badge variant='outline'>{value}</Badge>
			</div>
			<p className='mt-2 text-sm leading-6 text-muted-foreground'>{description}</p>
		</div>
	);
}
