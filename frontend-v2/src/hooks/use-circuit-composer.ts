'use client';

import * as React from 'react';

import {
	analyzeOpenQasm,
	CIRCUIT_SNIPPETS,
	CIRCUIT_TEMPLATES,
	DEFAULT_CIRCUIT_TEMPLATE_ID,
	getCircuitSnippetById,
	getCircuitTemplateById
} from '@/lib/circuit-composer';

const FALLBACK_TEMPLATE = CIRCUIT_TEMPLATES[0]!;
const DEFAULT_TEMPLATE = getCircuitTemplateById(DEFAULT_CIRCUIT_TEMPLATE_ID) ?? FALLBACK_TEMPLATE;

export function useCircuitComposer() {
	const editorRef = React.useRef<HTMLTextAreaElement | null>(null);
	const [openqasm, setOpenQasmState] = React.useState(DEFAULT_TEMPLATE.circuit);
	const [selectedTemplateId, setSelectedTemplateId] = React.useState<string | null>(DEFAULT_TEMPLATE.id);
	const analysis = React.useMemo(() => analyzeOpenQasm(openqasm), [openqasm]);

	const focusEditor = (cursorPosition?: number) => {
		requestAnimationFrame(() => {
			const editor = editorRef.current;
			if (!editor) return;

			editor.focus();
			if (typeof cursorPosition === 'number') {
				editor.setSelectionRange(cursorPosition, cursorPosition);
			}
		});
	};

	const setOpenqasm = (nextValue: string) => {
		setSelectedTemplateId(null);
		setOpenQasmState(nextValue);
	};

	const applyTemplate = (templateId: string) => {
		const template = getCircuitTemplateById(templateId);
		if (!template) return;

		setSelectedTemplateId(template.id);
		setOpenQasmState(template.circuit);
		focusEditor(template.circuit.length);
	};

	const resetComposer = () => {
		applyTemplate(DEFAULT_TEMPLATE.id);
	};

	const insertSnippet = (snippetId: string) => {
		const snippet = getCircuitSnippetById(snippetId);
		if (!snippet) return;

		const editor = editorRef.current;
		const selectionStart = editor?.selectionStart ?? openqasm.length;
		const selectionEnd = editor?.selectionEnd ?? openqasm.length;
		const prefix = openqasm.slice(0, selectionStart);
		const suffix = openqasm.slice(selectionEnd);
		const needsLeadingBreak = prefix.length > 0 && !prefix.endsWith('\n');
		const needsTrailingBreak = suffix.length > 0 && !suffix.startsWith('\n');
		const insertion = `${needsLeadingBreak ? '\n' : ''}${snippet.snippet}${needsTrailingBreak ? '\n' : ''}`;
		const nextValue = `${prefix}${insertion}${suffix}`;
		const nextCursor = prefix.length + insertion.length;

		setSelectedTemplateId(null);
		setOpenQasmState(nextValue);
		focusEditor(nextCursor);
	};

	return {
		analysis,
		editorRef,
		openqasm,
		selectedTemplateId,
		templates: CIRCUIT_TEMPLATES,
		snippets: CIRCUIT_SNIPPETS,
		setOpenqasm,
		applyTemplate,
		insertSnippet,
		resetComposer
	};
}
