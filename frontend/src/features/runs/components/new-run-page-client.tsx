"use client";

import { Button } from "@/components/arc/button/button";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";

import { useState, useCallback } from "react";
import {
  Atom,
  GitBranch,
  Zap,
  Sparkles,
  Tag,
  ArrowRight,
  Code2,
  Layers,
  CircuitBoard,
} from "lucide-react";
import {
  CIRCUIT_TEMPLATES,
  CIRCUIT_SNIPPETS,
  DEFAULT_CIRCUIT_TEMPLATE_ID,
  getCircuitTemplateById,
} from "../lib/circuit-templates";
import type { CircuitTemplate } from "../lib/circuit-templates";
import { RunCreateForm } from "./run-create-form";

type TemplateMeta = {
  icon: typeof Atom;
  accent: string;
  accentBg: string;
  previewBg: string;
  previewText: string;
  tagBg: string;
  tagText: string;
  borderActive: string;
  previewLines: number;
};

const TEMPLATE_META: Record<string, TemplateMeta> = {
  "bell-state": {
    icon: Atom,
    accent: "text-info",
    accentBg: "bg-info/10 ring-info/25",
    previewBg: "bg-info/30",
    previewText: "text-info group-hover:text-info",
    tagBg: "bg-info/10",
    tagText: "text-info",
    borderActive: "border-info/30",
    previewLines: 6,
  },
  "ghz-three": {
    icon: GitBranch,
    accent: "text-success",
    accentBg: "bg-success/10 ring-success/25",
    previewBg: "bg-success/30",
    previewText: "text-success group-hover:text-success",
    tagBg: "bg-success/10",
    tagText: "text-success",
    borderActive: "border-success/30",
    previewLines: 7,
  },
  "phase-kickback": {
    icon: Zap,
    accent: "text-warning",
    accentBg: "bg-warning/10 ring-warning/25",
    previewBg: "bg-warning/30",
    previewText: "text-warning group-hover:text-warning",
    tagBg: "bg-warning/10",
    tagText: "text-warning",
    borderActive: "border-warning/30",
    previewLines: 8,
  },
  "teleportation-skeleton": {
    icon: Sparkles,
    accent: "text-danger",
    accentBg: "bg-danger/10 ring-danger/25",
    previewBg: "bg-danger/30",
    previewText: "text-danger group-hover:text-danger",
    tagBg: "bg-danger/10",
    tagText: "text-danger",
    borderActive: "border-danger/30",
    previewLines: 10,
  },
};

type SnippetCategoryColor = {
  text: string;
  bg: string;
  ring: string;
  highlight: string;
};

const CATEGORY_COLORS: Record<string, SnippetCategoryColor> = {
  Registers: {
    text: "text-info",
    bg: "bg-info/8",
    ring: "ring-info/25",
    highlight: "color-mix(in oklab, var(--info) 8%, transparent)",
  },
  "Single-qubit": {
    text: "text-accent",
    bg: "bg-accent/8",
    ring: "ring-accent/25",
    highlight: "color-mix(in oklab, var(--accent) 8%, transparent)",
  },
  Entanglement: {
    text: "text-success",
    bg: "bg-success/8",
    ring: "ring-success/25",
    highlight: "color-mix(in oklab, var(--success) 8%, transparent)",
  },
  Readout: {
    text: "text-warning",
    bg: "bg-warning/8",
    ring: "ring-warning/25",
    highlight: "color-mix(in oklab, var(--warning) 8%, transparent)",
  },
  Algorithms: {
    text: "text-danger",
    bg: "bg-danger/8",
    ring: "ring-danger/25",
    highlight: "color-mix(in oklab, var(--danger) 8%, transparent)",
  },
};

export type HighlightedLine = {
  lineIndex: number;
  color: string;
};

const ALL_TAGS = [...new Set(CIRCUIT_TEMPLATES.flatMap((t) => t.tags))];

export function NewRunPageClient() {
  const defaultTemplate = getCircuitTemplateById(DEFAULT_CIRCUIT_TEMPLATE_ID)!;
  const [selectedCircuit, setSelectedCircuit] = useState(
    defaultTemplate.circuit,
  );
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(
    defaultTemplate.id,
  );
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [highlightedLines, setHighlightedLines] = useState<HighlightedLine[]>(
    [],
  );

  const handleTemplateSelect = useCallback((template: CircuitTemplate) => {
    setSelectedCircuit(template.circuit);
    setActiveTemplateId(template.id);
    setHighlightedLines([]);
  }, []);

  const handleSnippetInsert = useCallback(
    (snippet: string, category: string) => {
      const color =
        CATEGORY_COLORS[category]?.highlight ?? "color-mix(in oklab, var(--foreground) 6%, transparent)";

      setSelectedCircuit((prev) => {
        const needsBreak = prev.length > 0 && !prev.endsWith("\n");
        const prefix = `${prev}${needsBreak ? "\n" : ""}`;
        const newContent = `${prefix}${snippet}\n`;
        const startLineIndex = prefix.split("\n").length - 1;
        const snippetLineCount = snippet.split("\n").length;

        const newHighlights: HighlightedLine[] = [];
        for (let i = 0; i < snippetLineCount; i++) {
          newHighlights.push({ lineIndex: startLineIndex + i, color });
        }
        setHighlightedLines((hl) => [...hl, ...newHighlights]);

        return newContent;
      });
      setActiveTemplateId(null);
    },
    [],
  );

  const handleCircuitChange = useCallback((value: string) => {
    setSelectedCircuit(value);
    setActiveTemplateId(null);
    setHighlightedLines([]);
  }, []);

  const filteredTemplates = filterTag
    ? CIRCUIT_TEMPLATES.filter((t) => t.tags.includes(filterTag))
    : CIRCUIT_TEMPLATES;

  const snippetCategories = [
    ...new Set(CIRCUIT_SNIPPETS.map((s) => s.category)),
  ];

  return (
    <div className="flex min-h-full flex-col overflow-y-auto">
      {/* ── Marketplace hero ── */}
      <header className="relative border-b border-border px-6 pb-6 pt-6">
        <div className="relative">
          <div className="flex items-center gap-2 text-faint">
            <CircuitBoard size={14} />
            <span className="text-xs font-medium">
              Quantum Circuit Marketplace
            </span>
          </div>
          <h1 className="mt-2 text-2xl text-foreground">
            Browse &amp; Execute
          </h1>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-faint">
            Pick a circuit from our curated collection or compose your own. One
            click to deploy across the distributed quantum mesh.
          </p>
        </div>
      </header>

      {/* ── Main content: two-panel marketplace ── */}
      <div className="flex flex-1 flex-col gap-0 lg:flex-row">
        {/* ── Left: Browse panel ── */}
        <div className="flex flex-1 flex-col border-r border-border lg:max-w-[58%]">
          {/* Filter tags */}
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Tag size={12} className="text-faint" aria-hidden="true" />
            <ChipGroup
              label="Filter by tag"
              multiple={false}
              options={ALL_TAGS.map((tag) => ({ value: tag, label: tag }))}
              value={filterTag ? [filterTag] : []}
              onValueChange={(v) => setFilterTag(v[0] ?? null)}
            />
          </div>

          {/* Template grid */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const meta =
                  TEMPLATE_META[template.id] ?? TEMPLATE_META["bell-state"]!;
                const Icon = meta.icon;
                const isActive = activeTemplateId === template.id;
                const codeLines = template.circuit
                  .split("\n")
                  .filter(Boolean);
                const preview = codeLines
                  .filter(
                    (l) =>
                      !l.startsWith("OPENQASM") && !l.startsWith("include"),
                  )
                  .slice(0, meta.previewLines);

                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => handleTemplateSelect(template)}
                    className="group relative text-left"
                  >
                    <div
                      className={`relative flex min-h-full flex-col overflow-hidden rounded-xl border transition-all duration-200 ${
                        isActive
                          ?`${meta.borderActive} bg-surface-muted`
                          : "border-border bg-surface-muted hover:border-border hover:bg-surface-muted"
                      }`}
                    >
                      {/* Code preview area, colored per template */}
                      <div
                        className={`relative border-b border-border px-4 py-3 ${meta.previewBg}`}
                      >
                        <pre
                          className={`overflow-hidden font-mono text-xs leading-[1.6] ${meta.previewText}`}
                        >
                          {preview.map((line, i) => (
                            <div key={i} className="truncate">
                              {line}
                            </div>
                          ))}
                        </pre>
                        {isActive && (
                          <div
                            className={`absolute right-3 top-3 flex h-5 items-center rounded-full px-2 text-xs font-medium ${meta.tagBg} ${meta.tagText}`}
                          >
                            Selected
                          </div>
                        )}
                      </div>

                      {/* Info area */}
                      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${meta.accentBg}`}
                          >
                            <Icon size={14} className={meta.accent} />
                          </div>
                          <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">
                            {template.title}
                          </h3>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-faint">
                          {template.description}
                        </p>
                        {/* Colored tag capsules */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {template.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${meta.tagBg} ${meta.tagText}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-auto pt-3">
                          {template.highlights.map((h) => (
                            <div
                              key={h}
                              className="flex items-center gap-1.5 text-xs text-faint"
                            >
                              <ArrowRight size={8} className={meta.accent + " opacity-40"} />
                              <span>{h}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Snippets shelf ── */}
            <div className="mt-6 border-t border-border pt-5">
              <div className="mb-3 flex items-center gap-2">
                <Layers size={12} className="text-faint" />
                <span className="text-xs font-medium text-faint">
                  Gate Snippets
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {snippetCategories.map((category) => {
                  const catColor =
                    CATEGORY_COLORS[category] ?? CATEGORY_COLORS["Registers"]!;
                  return (
                    <div key={category}>
                      <p
                        className={`mb-1.5 text-xs font-medium ${catColor.text} opacity-60`}
                      >
                        {category}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {CIRCUIT_SNIPPETS.filter(
                          (s) => s.category === category,
                        ).map((snippet) => (
                          <Button
                            key={snippet.id}
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => handleSnippetInsert(snippet.snippet, category)}
                            title={snippet.description}
                          >
                            <Code2
                              size={10}
                              className="opacity-50 transition-opacity group-hover/s:opacity-80"
                            />
                            {snippet.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Editor workspace panel ── */}
        <div className="flex flex-col border-t border-border lg:flex-1 lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Code2 size={12} className="text-faint" />
            <span className="text-xs font-medium text-faint">
              Your Circuit
            </span>
            {activeTemplateId && (
              <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-xs text-faint">
                from{" "}
                <span className="text-subtle">
                  {getCircuitTemplateById(activeTemplateId)?.title}
                </span>
              </span>
            )}
          </div>
          <div className="flex-1 p-5">
            <RunCreateForm
              circuit={selectedCircuit}
              onCircuitChange={handleCircuitChange}
              highlightedLines={highlightedLines}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
