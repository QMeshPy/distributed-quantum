export type CircuitTemplate = {
	id: string;
	title: string;
	description: string;
	tags: string[];
	highlights: string[];
	circuit: string;
};

export type CircuitSnippetCategory =
	| 'Registers'
	| 'Single-qubit'
	| 'Entanglement'
	| 'Readout'
	| 'Algorithms';

export type CircuitSnippet = {
	id: string;
	label: string;
	description: string;
	category: CircuitSnippetCategory;
	snippet: string;
};

export type CircuitComposerAnalysis = {
	detectedVersion: string | null;
	lineCount: number;
	nonEmptyLineCount: number;
	operationCount: number;
	measurementCount: number;
	quantumRegisterCount: number;
	classicalRegisterCount: number;
	readyToSubmit: boolean;
	warnings: string[];
	operationPreview: string[];
};
