"use client";

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
    accent: "text-sky-300",
    accentBg: "bg-sky-400/10 ring-sky-400/25",
    previewBg: "bg-sky-950/30",
    previewText: "text-sky-300/50 group-hover:text-sky-300/70",
    tagBg: "bg-sky-400/10",
    tagText: "text-sky-300/60",
    borderActive: "border-sky-400/30",
    previewLines: 6,
  },
  "ghz-three": {
    icon: GitBranch,
    accent: "text-emerald-300",
    accentBg: "bg-emerald-400/10 ring-emerald-400/25",
    previewBg: "bg-emerald-950/30",
    previewText: "text-emerald-300/50 group-hover:text-emerald-300/70",
    tagBg: "bg-emerald-400/10",
    tagText: "text-emerald-300/60",
    borderActive: "border-emerald-400/30",
    previewLines: 7,
  },
  "phase-kickback": {
    icon: Zap,
    accent: "text-amber-300",
    accentBg: "bg-amber-400/10 ring-amber-400/25",
    previewBg: "bg-amber-950/30",
    previewText: "text-amber-300/50 group-hover:text-amber-300/70",
    tagBg: "bg-amber-400/10",
    tagText: "text-amber-300/60",
    borderActive: "border-amber-400/30",
    previewLines: 8,
  },
  "teleportation-skeleton": {
    icon: Sparkles,
    accent: "text-rose-300",
    accentBg: "bg-rose-400/10 ring-rose-400/25",
    previewBg: "bg-rose-950/30",
    previewText: "text-rose-300/50 group-hover:text-rose-300/70",
    tagBg: "bg-rose-400/10",
    tagText: "text-rose-300/60",
    borderActive: "border-rose-400/30",
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
    text: "text-sky-300",
    bg: "bg-sky-400/8",
    ring: "ring-sky-400/25",
    highlight: "rgba(56,189,248,0.08)",
  },
  "Single-qubit": {
    text: "text-violet-300",
    bg: "bg-violet-400/8",
    ring: "ring-violet-400/25",
    highlight: "rgba(167,139,250,0.08)",
  },
  Entanglement: {
    text: "text-emerald-300",
    bg: "bg-emerald-400/8",
    ring: "ring-emerald-400/25",
    highlight: "rgba(52,211,153,0.08)",
  },
  Readout: {
    text: "text-amber-300",
    bg: "bg-amber-400/8",
    ring: "ring-amber-400/25",
    highlight: "rgba(251,191,36,0.08)",
  },
  Algorithms: {
    text: "text-rose-300",
    bg: "bg-rose-400/8",
    ring: "ring-rose-400/25",
    highlight: "rgba(251,113,133,0.08)",
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
        CATEGORY_COLORS[category]?.highlight ?? "rgba(255,255,255,0.06)";

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
    <div className="flex h-full flex-col overflow-y-auto">
      {/* ── Marketplace hero ── */}
      <header className="relative border-b border-white/6 px-6 pb-6 pt-6">
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute -left-20 -top-20 h-[300px] w-[400px] rounded-full opacity-[0.07] blur-[100px]"
            style={{
              background:
                "conic-gradient(from 180deg, #60a5fa, #a78bfa, #f472b6, #60a5fa)",
            }}
          />
          <div
            className="absolute -right-10 -top-10 h-[200px] w-[300px] rounded-full opacity-[0.05] blur-[80px]"
            style={{
              background:
                "radial-gradient(circle, #34d399 0%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/30">
            <CircuitBoard size={14} />
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Quantum Circuit Marketplace
            </span>
          </div>
          <h1 className="mt-2 text-[28px] font-light tracking-tight text-white/90">
            Browse &amp; Execute
          </h1>
          <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-white/35">
            Pick a circuit from our curated collection or compose your own. One
            click to deploy across the distributed quantum mesh.
          </p>
        </div>
      </header>

      {/* ── Main content: two-panel marketplace ── */}
      <div className="flex flex-1 flex-col gap-0 lg:flex-row">
        {/* ── Left: Browse panel ── */}
        <div className="flex flex-1 flex-col border-r border-white/5 lg:max-w-[58%]">
          {/* Filter tags */}
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
            <Tag size={12} className="text-white/25" />
            <button
              type="button"
              onClick={() => setFilterTag(null)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                filterTag === null
                  ? "bg-white/12 text-white/80"
                  : "text-white/35 hover:text-white/60"
              }`}
            >
              All
            </button>
            {ALL_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilterTag(tag === filterTag ? null : tag)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                  filterTag === tag
                    ? "bg-white/12 text-white/80"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                {tag}
              </button>
            ))}
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
                      className={`relative flex h-full flex-col overflow-hidden rounded-xl border transition-all duration-200 ${
                        isActive
                          ? `${meta.borderActive} bg-white/[0.07]`
                          : "border-white/6 bg-white/[0.025] hover:border-white/12 hover:bg-white/[0.045]"
                      }`}
                    >
                      {/* Code preview area — colored per template */}
                      <div
                        className={`relative border-b border-white/5 px-4 py-3 ${meta.previewBg}`}
                      >
                        <pre
                          className={`overflow-hidden font-mono text-[10px] leading-[1.6] ${meta.previewText}`}
                        >
                          {preview.map((line, i) => (
                            <div key={i} className="truncate">
                              {line}
                            </div>
                          ))}
                        </pre>
                        {isActive && (
                          <div
                            className={`absolute right-3 top-3 flex h-5 items-center rounded-full px-2 text-[9px] font-semibold uppercase tracking-wide ${meta.tagBg} ${meta.tagText}`}
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
                          <h3 className="text-[13px] font-semibold text-white/80 group-hover:text-white/95">
                            {template.title}
                          </h3>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/30">
                          {template.description}
                        </p>
                        {/* Colored tag capsules */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {template.tags.map((tag) => (
                            <span
                              key={tag}
                              className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${meta.tagBg} ${meta.tagText}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-auto pt-3">
                          {template.highlights.map((h) => (
                            <div
                              key={h}
                              className="flex items-center gap-1.5 text-[10px] text-white/25"
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
            <div className="mt-6 border-t border-white/5 pt-5">
              <div className="mb-3 flex items-center gap-2">
                <Layers size={12} className="text-white/25" />
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/30">
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
                        className={`mb-1.5 text-[10px] font-medium ${catColor.text} opacity-60`}
                      >
                        {category}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {CIRCUIT_SNIPPETS.filter(
                          (s) => s.category === category,
                        ).map((snippet) => (
                          <button
                            key={snippet.id}
                            type="button"
                            onClick={() =>
                              handleSnippetInsert(snippet.snippet, category)
                            }
                            title={snippet.description}
                            className={`group/s flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-all hover:scale-[1.03] ${catColor.bg} ${catColor.ring} ring-1 ${catColor.text} opacity-70 hover:opacity-100`}
                          >
                            <Code2
                              size={10}
                              className="opacity-50 transition-opacity group-hover/s:opacity-80"
                            />
                            {snippet.label}
                          </button>
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
        <div className="flex flex-col border-t border-white/5 lg:flex-1 lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
            <Code2 size={12} className="text-white/30" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/35">
              Your Circuit
            </span>
            {activeTemplateId && (
              <span className="ml-auto rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-white/35">
                from{" "}
                <span className="text-white/55">
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
