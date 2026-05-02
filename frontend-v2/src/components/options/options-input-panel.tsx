'use client';

import * as React from 'react';
import { Loader2Icon, ZapIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { OptionType, OptionsSubmitRequest } from '@/types/options';
import { OPTION_TYPE_LABELS, OPTION_TYPE_INPUT_LABELS, OPTION_TYPE_DAMODARAN } from '@/types/options';
import { DAMODARAN_INDUSTRIES } from '@/data/damodaran-industries';

type SigmaMode = 'equity' | 'firm';

const OPTION_TYPES: OptionType[] = [
	'european_call_short',
	'european_call_long',
	'expand',
	'delay',
	'abandon',
	'patent',
	'natural_resource',
	'financial_flexibility'
];

const DEFAULT_VALUES: Record<OptionType, Partial<OptionsSubmitRequest>> = {
	european_call_short: { current_value: 112.5, strike_or_cost: 110, time_to_expiry: 0.14, volatility: 0.35, risk_free_rate: 0.04 },
	european_call_long: { current_value: 500, strike_or_cost: 600, time_to_expiry: 15, volatility: 0.4, risk_free_rate: 0.04 },
	expand: { current_value: 100, strike_or_cost: 150, time_to_expiry: 10, volatility: 0.35, risk_free_rate: 0.04 },
	delay: { current_value: 350, strike_or_cost: 500, time_to_expiry: 20, volatility: 0.2, risk_free_rate: 0.04 },
	abandon: { current_value: 254, strike_or_cost: 150, time_to_expiry: 10, volatility: 0.25, risk_free_rate: 0.04 },
	patent: { current_value: 800000, strike_or_cost: 1000000, time_to_expiry: 10, volatility: 0.35, risk_free_rate: 0.04 },
	natural_resource: { current_value: 35, strike_or_cost: 1000000, time_to_expiry: 10, volatility: 0.2, risk_free_rate: 0.04, reserve_quantity: 50000, extraction_cost_per_unit: 10, annual_cashflow_after_tax: 50000 },
	financial_flexibility: { current_value: 0.0913, strike_or_cost: 0.05, time_to_expiry: 1, volatility: 0.4, risk_free_rate: 0.04, reinvestment_need_pct: 0.0913, reinvestment_volatility: 0.4, max_internal_financing_pct: 0.05, cost_of_capital: 0.1, return_on_capital: 0.16 }
};

function NumInput({
	label,
	hint,
	value,
	onChange,
	step = 'any'
}: {
	label: string;
	hint?: string;
	value: string;
	onChange: (v: string) => void;
	step?: string;
}) {
	return (
		<div className='space-y-1'>
			<label className='text-xs font-medium text-foreground'>{label}</label>
			{hint ? <p className='text-[0.68rem] text-muted-foreground'>{hint}</p> : null}
			<input
				type='number'
				step={step}
				value={value}
				onChange={e => onChange(e.target.value)}
				className='h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
			/>
		</div>
	);
}

export function OptionsInputPanel({
	submitting,
	onSubmit
}: {
	submitting: boolean;
	onSubmit: (req: OptionsSubmitRequest) => void;
}) {
	const [optionType, setOptionType] = React.useState<OptionType>('european_call_short');
	const defaults = DEFAULT_VALUES[optionType];

	const [currentValue, setCurrentValue] = React.useState(String(defaults.current_value ?? ''));
	const [strikeOrCost, setStrikeOrCost] = React.useState(String(defaults.strike_or_cost ?? ''));
	const [timeToExpiry, setTimeToExpiry] = React.useState(String(defaults.time_to_expiry ?? ''));
	const [volatility, setVolatility] = React.useState(String(defaults.volatility ?? ''));
	const [riskFreeRate, setRiskFreeRate] = React.useState(String(defaults.risk_free_rate ?? ''));

	// Natural resource extras
	const [reserveQty, setReserveQty] = React.useState(String(defaults.reserve_quantity ?? ''));
	const [extractionCost, setExtractionCost] = React.useState(String(defaults.extraction_cost_per_unit ?? ''));
	const [annualCashflow, setAnnualCashflow] = React.useState(String(defaults.annual_cashflow_after_tax ?? ''));

	// Financial flexibility extras
	const [reinvestPct, setReinvestPct] = React.useState(String(defaults.reinvestment_need_pct ?? ''));
	const [reinvestVol, setReinvestVol] = React.useState(String(defaults.reinvestment_volatility ?? ''));
	const [maxFinancing, setMaxFinancing] = React.useState(String(defaults.max_internal_financing_pct ?? ''));
	const [coc, setCoc] = React.useState(String(defaults.cost_of_capital ?? ''));
	const [roc, setRoc] = React.useState(String(defaults.return_on_capital ?? ''));

	// Annual cost of delay (expand, delay, patent)
	const [annualCostDelay, setAnnualCostDelay] = React.useState('');

	// IQAE config
	const [numQubits, setNumQubits] = React.useState('5');
	const [epsilon, setEpsilon] = React.useState('0.01');

	// Damodaran industry sigma picker
	const [selectedIndustry, setSelectedIndustry] = React.useState('');
	const [sigmaMode, setSigmaMode] = React.useState<SigmaMode>('equity');

	// Reset fields when option type changes
	React.useEffect(() => {
		const d = DEFAULT_VALUES[optionType];
		setCurrentValue(String(d.current_value ?? ''));
		setStrikeOrCost(String(d.strike_or_cost ?? ''));
		setTimeToExpiry(String(d.time_to_expiry ?? ''));
		setVolatility(String(d.volatility ?? ''));
		setRiskFreeRate(String(d.risk_free_rate ?? ''));
		setReserveQty(String(d.reserve_quantity ?? ''));
		setExtractionCost(String(d.extraction_cost_per_unit ?? ''));
		setAnnualCashflow(String(d.annual_cashflow_after_tax ?? ''));
		setReinvestPct(String(d.reinvestment_need_pct ?? ''));
		setReinvestVol(String(d.reinvestment_volatility ?? ''));
		setMaxFinancing(String(d.max_internal_financing_pct ?? ''));
		setCoc(String(d.cost_of_capital ?? ''));
		setRoc(String(d.return_on_capital ?? ''));
		setAnnualCostDelay('');
		setSelectedIndustry('');
	}, [optionType]);

	function applyIndustrySigma(industryName: string, mode: SigmaMode) {
		const ind = DAMODARAN_INDUSTRIES.find(i => i.name === industryName);
		if (!ind) return;
		const sigma = mode === 'equity' ? ind.sigma_equity : ind.sigma_firm;
		setVolatility(String(sigma));
		if (optionType === 'financial_flexibility') {
			setReinvestVol(String(sigma));
		}
	}

	const inputLabels = OPTION_TYPE_INPUT_LABELS[optionType];
	const showDelayExtras = ['expand', 'delay', 'patent'].includes(optionType);
	const showNatResExtras = optionType === 'natural_resource';
	const showFlexExtras = optionType === 'financial_flexibility';

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const req: OptionsSubmitRequest = {
			option_type: optionType,
			current_value: parseFloat(currentValue),
			strike_or_cost: parseFloat(strikeOrCost),
			time_to_expiry: parseFloat(timeToExpiry),
			volatility: parseFloat(volatility),
			risk_free_rate: parseFloat(riskFreeRate),
			num_uncertainty_qubits: parseInt(numQubits, 10),
			epsilon: parseFloat(epsilon)
		};

		if (showDelayExtras && annualCostDelay) req.annual_cost_of_delay = parseFloat(annualCostDelay);
		if (showNatResExtras) {
			if (reserveQty) req.reserve_quantity = parseFloat(reserveQty);
			if (extractionCost) req.extraction_cost_per_unit = parseFloat(extractionCost);
			if (annualCashflow) req.annual_cashflow_after_tax = parseFloat(annualCashflow);
		}
		if (showFlexExtras) {
			if (reinvestPct) req.reinvestment_need_pct = parseFloat(reinvestPct);
			if (reinvestVol) req.reinvestment_volatility = parseFloat(reinvestVol);
			if (maxFinancing) req.max_internal_financing_pct = parseFloat(maxFinancing);
			if (coc) req.cost_of_capital = parseFloat(coc);
			if (roc) req.return_on_capital = parseFloat(roc);
		}

		onSubmit(req);
	}

	return (
		<form onSubmit={handleSubmit} className='space-y-5 rounded-md border border-border bg-card p-5'>
			{/* Option type selector */}
			<div className='space-y-1'>
				<label className='text-xs font-medium text-foreground'>Option type</label>
				<p className='text-[0.68rem] text-muted-foreground'>
					Damodaran reference: <span className='font-mono'>{OPTION_TYPE_DAMODARAN[optionType]}</span>
				</p>
				<select
					value={optionType}
					onChange={e => setOptionType(e.target.value as OptionType)}
					className='h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
				>
					{OPTION_TYPES.map(t => (
						<option key={t} value={t}>
							{OPTION_TYPE_LABELS[t]}
						</option>
					))}
				</select>
			</div>

			{/* Damodaran industry sigma picker */}
			<div className='rounded-md border border-border bg-muted/30 p-3 space-y-2'>
				<p className='text-xs font-medium text-foreground'>
					Damodaran industry σ lookup{' '}
					<span className='font-normal text-muted-foreground'>(optional — auto-fills volatility)</span>
				</p>
				<div className='grid grid-cols-[1fr_auto] gap-2'>
					<select
						value={selectedIndustry}
						onChange={e => {
							setSelectedIndustry(e.target.value);
							if (e.target.value) applyIndustrySigma(e.target.value, sigmaMode);
						}}
						className='h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
					>
						<option value=''>— pick industry —</option>
						{DAMODARAN_INDUSTRIES.map(ind => (
							<option key={ind.name} value={ind.name}>
								{ind.name} (σ_eq={ind.sigma_equity}, σ_firm={ind.sigma_firm})
							</option>
						))}
					</select>
					<select
						value={sigmaMode}
						onChange={e => {
							const mode = e.target.value as SigmaMode;
							setSigmaMode(mode);
							if (selectedIndustry) applyIndustrySigma(selectedIndustry, mode);
						}}
						className='h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
					>
						<option value='equity'>Equity σ</option>
						<option value='firm'>Firm σ</option>
					</select>
				</div>
			</div>

			{/* Core inputs */}
			<div className='grid grid-cols-2 gap-3'>
				<NumInput label={inputLabels.s} value={currentValue} onChange={setCurrentValue} />
				<NumInput label={inputLabels.k} value={strikeOrCost} onChange={setStrikeOrCost} />
				<NumInput
					label='Time to expiry (years)'
					hint={optionType === 'european_call_short' ? 'Convert days to fraction: e.g. 52/365' : undefined}
					value={timeToExpiry}
					onChange={setTimeToExpiry}
				/>
				<NumInput
					label='Volatility (σ, annual)'
					hint='0.35 = 35%. Use industry lookup above.'
					value={volatility}
					onChange={setVolatility}
				/>
				<NumInput
					label='Risk-free rate (r, annual)'
					hint='0.04 = 4%'
					value={riskFreeRate}
					onChange={setRiskFreeRate}
				/>
			</div>

			{/* Option-type-specific extras */}
			{showDelayExtras ? (
				<NumInput
					label='Annual cost of delay (optional)'
					hint='E.g. annual dividend per share or opportunity cost. Used as dividend yield proxy.'
					value={annualCostDelay}
					onChange={setAnnualCostDelay}
				/>
			) : null}

			{showNatResExtras ? (
				<div className='grid grid-cols-2 gap-3'>
					<NumInput label='Reserve quantity (units)' value={reserveQty} onChange={setReserveQty} />
					<NumInput label='Extraction cost per unit' value={extractionCost} onChange={setExtractionCost} />
					<NumInput
						label='Annual after-tax cashflow'
						hint='Used to compute dividend yield on reserves'
						value={annualCashflow}
						onChange={setAnnualCashflow}
					/>
				</div>
			) : null}

			{showFlexExtras ? (
				<div className='grid grid-cols-2 gap-3'>
					<NumInput label='Reinvestment need (% of firm value)' hint='0.09 = 9%' value={reinvestPct} onChange={setReinvestPct} />
					<NumInput label='Reinvestment volatility' value={reinvestVol} onChange={setReinvestVol} />
					<NumInput label='Max internal financing capacity' value={maxFinancing} onChange={setMaxFinancing} />
					<NumInput label='Cost of capital (WACC)' hint='0.10 = 10%' value={coc} onChange={setCoc} />
					<NumInput label='Return on capital (ROC)' hint='0.16 = 16%' value={roc} onChange={setRoc} />
				</div>
			) : null}

			{/* IQAE configuration */}
			<div className='rounded-md border border-border bg-muted/20 p-3 space-y-3'>
				<p className='text-xs font-medium text-foreground'>IQAE circuit configuration</p>
				<div className='grid grid-cols-2 gap-3'>
					<NumInput
						label='Uncertainty qubits'
						hint='2^n = discretization points. 5 → 32 pts.'
						value={numQubits}
						onChange={setNumQubits}
						step='1'
					/>
					<NumInput
						label='Epsilon (accuracy target)'
						hint='0.01 = 1% error. Smaller = more circuit runs.'
						value={epsilon}
						onChange={setEpsilon}
					/>
				</div>
			</div>

			<Button type='submit' disabled={submitting} className='w-full'>
				{submitting ? <Loader2Icon className='size-4 animate-spin' /> : <ZapIcon className='size-4' />}
				{submitting ? 'Running QAE pipeline…' : 'Price this option'}
			</Button>
		</form>
	);
}
