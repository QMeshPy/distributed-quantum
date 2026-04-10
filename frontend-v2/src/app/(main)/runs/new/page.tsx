'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const OPENQASM_PLACEHOLDER = `OPENQASM 2.0;
include "qelib1.inc";

qreg q[2];
creg c[2];

h q[0];
cx q[0],q[1];
measure q -> c;
`;

export default function NewRunPage() {
	const router = useRouter();
	const nameId = useId();
	const shotsId = useId();
	const circuitId = useId();
	const [name, setName] = useState('');
	const [shots, setShots] = useState('1024');
	const [backend, setBackend] = useState('simulator');
	const [openqasm, setOpenqasm] = useState(OPENQASM_PLACEHOLDER);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		// Placeholder until API exists
		router.push('/runs');
	};

	return (
		<div className='flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6'>
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div>
					<h1 className='text-lg font-semibold tracking-tight'>New run</h1>
					<p className='mt-1 text-sm text-muted-foreground'>
						Describe the job, pick a backend, and paste your OpenQASM circuit.
					</p>
				</div>
				<Button
					variant='outline'
					size='sm'
					asChild
				>
					<Link href='/runs'>Cancel</Link>
				</Button>
			</div>

			<form
				className='flex min-h-0 flex-1 flex-col gap-6'
				onSubmit={handleSubmit}
			>
				<Card className='flex min-h-0 flex-1 flex-col border-border/80 shadow-sm'>
					<CardHeader className='border-b border-border/60 pb-4'>
						<CardTitle>Run configuration</CardTitle>
						<CardDescription>Optional metadata and execution target. Circuit editor below.</CardDescription>
					</CardHeader>
					<CardContent className='flex min-h-0 flex-1 flex-col gap-6 pt-6'>
						<div className='grid gap-6 sm:grid-cols-2 lg:grid-cols-3'>
							<div className='space-y-2 sm:col-span-2 lg:col-span-1'>
								<Label htmlFor={nameId}>Run name</Label>
								<Input
									id={nameId}
									value={name}
									onChange={e => setName(e.target.value)}
									placeholder='e.g. Surface code distance-5'
									autoComplete='off'
								/>
							</div>
							<div className='space-y-2'>
								<Label htmlFor={shotsId}>Shots</Label>
								<Input
									id={shotsId}
									inputMode='numeric'
									value={shots}
									onChange={e => setShots(e.target.value.replace(/\D/g, ''))}
									placeholder='1024'
								/>
							</div>
							<div className='space-y-2'>
								<Label>Backend</Label>
								<Select
									value={backend}
									onValueChange={setBackend}
								>
									<SelectTrigger className='w-full min-w-0'>
										<SelectValue placeholder='Backend' />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='simulator'>Simulator</SelectItem>
										<SelectItem value='ibmq'>IBM Quantum (mock)</SelectItem>
										<SelectItem value='ionq'>IonQ (mock)</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>

						<div className='flex min-h-0 flex-1 flex-col gap-2'>
							<Label htmlFor={circuitId}>OpenQASM circuit</Label>
							<Textarea
								id={circuitId}
								value={openqasm}
								onChange={e => setOpenqasm(e.target.value)}
								spellCheck={false}
								className='min-h-[min(58vh,560px)] flex-1 resize-y rounded-xl border-border/80 bg-muted/30 font-mono text-sm leading-relaxed focus-visible:bg-background'
								placeholder='Paste OpenQASM 2.0 or 3.0 here…'
							/>
							<p className='text-xs text-muted-foreground'>
								Large editor area for full circuits. Syntax highlighting can be added when you wire a code
								mirror or Monaco.
							</p>
						</div>
					</CardContent>
					<CardFooter className='flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4'>
						<Button
							type='button'
							variant='ghost'
							asChild
						>
							<Link href='/runs'>Discard</Link>
						</Button>
						<Button type='submit'>Queue run</Button>
					</CardFooter>
				</Card>
			</form>
		</div>
	);
}
