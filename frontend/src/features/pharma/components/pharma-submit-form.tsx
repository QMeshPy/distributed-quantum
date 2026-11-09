"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  FlaskConical,
  Dna,
  Search,
  Loader2,
  Tag,
  ArrowRight,
  Microscope,
  Zap,
  Atom,
  Brain,
  Shield,
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubmitPharma } from "@/features/pharma";
import { ROUTES } from "@/constants";
import type { PharmaMode } from "@/features/pharma";
import {
  PHARMA_TEMPLATES,
  DEFAULT_PHARMA_TEMPLATE_ID,
  getPharmaTemplateById,
} from "../lib/pharma-templates";
import type { PharmaTemplate } from "../lib/pharma-templates";

// ── Visual metadata per template ──────────────────────────────────────────────

type TemplateMeta = {
  icon: typeof Atom;
  accent: string;
  accentBg: string;
  previewBg: string;
  previewText: string;
  tagBg: string;
  tagText: string;
  borderActive: string;
};

const TEMPLATE_META: Record<string, TemplateMeta> = {
  "covid-main-protease": {
    icon: Zap,
    accent: "text-sky-300",
    accentBg: "bg-sky-400/10 ring-sky-400/25",
    previewBg: "bg-sky-950/30",
    previewText: "text-sky-300/60 group-hover:text-sky-300/80",
    tagBg: "bg-sky-400/10",
    tagText: "text-sky-300/60",
    borderActive: "border-sky-400/30",
  },
  "egfr-inhibitor": {
    icon: Activity,
    accent: "text-violet-300",
    accentBg: "bg-violet-400/10 ring-violet-400/25",
    previewBg: "bg-violet-950/30",
    previewText: "text-violet-300/60 group-hover:text-violet-300/80",
    tagBg: "bg-violet-400/10",
    tagText: "text-violet-300/60",
    borderActive: "border-violet-400/30",
  },
  "hsp90-discovery": {
    icon: Atom,
    accent: "text-emerald-300",
    accentBg: "bg-emerald-400/10 ring-emerald-400/25",
    previewBg: "bg-emerald-950/30",
    previewText: "text-emerald-300/60 group-hover:text-emerald-300/80",
    tagBg: "bg-emerald-400/10",
    tagText: "text-emerald-300/60",
    borderActive: "border-emerald-400/30",
  },
  "ache-alzheimer": {
    icon: Brain,
    accent: "text-amber-300",
    accentBg: "bg-amber-400/10 ring-amber-400/25",
    previewBg: "bg-amber-950/30",
    previewText: "text-amber-300/60 group-hover:text-amber-300/80",
    tagBg: "bg-amber-400/10",
    tagText: "text-amber-300/60",
    borderActive: "border-amber-400/30",
  },
  "tnf-alpha-discovery": {
    icon: Shield,
    accent: "text-rose-300",
    accentBg: "bg-rose-400/10 ring-rose-400/25",
    previewBg: "bg-rose-950/30",
    previewText: "text-rose-300/60 group-hover:text-rose-300/80",
    tagBg: "bg-rose-400/10",
    tagText: "text-rose-300/60",
    borderActive: "border-rose-400/30",
  },
  "jak2-hematology": {
    icon: Dna,
    accent: "text-fuchsia-300",
    accentBg: "bg-fuchsia-400/10 ring-fuchsia-400/25",
    previewBg: "bg-fuchsia-950/30",
    previewText: "text-fuchsia-300/60 group-hover:text-fuchsia-300/80",
    tagBg: "bg-fuchsia-400/10",
    tagText: "text-fuchsia-300/60",
    borderActive: "border-fuchsia-400/30",
  },
};

const FALLBACK_META = TEMPLATE_META["covid-main-protease"]!;

// ── Tag filter population ─────────────────────────────────────────────────────

const ALL_TAGS = [...new Set(PHARMA_TEMPLATES.flatMap((t) => t.tags))];

// ── Form schema ───────────────────────────────────────────────────────────────

const schema = z
  .object({
    mode: z.enum(["optimization", "discovery"]),
    target_pdb_id: z
      .string()
      .min(3, "PDB ID must be at least 3 characters")
      .max(10, "PDB ID too long")
      .regex(/^[A-Z0-9]+$/, "PDB ID must be uppercase alphanumeric"),
    initial_ligand_smiles: z.string().optional(),
    max_iterations: z.number().int().min(1).max(20),
    candidate_count: z.number().int().min(10).max(500),
  })
  .refine(
    (v) =>
      v.mode !== "optimization" ||
      !v.initial_ligand_smiles ||
      v.initial_ligand_smiles.length >= 5,
    {
      message: "SMILES must be at least 5 characters",
      path: ["initial_ligand_smiles"],
    },
  );

type FormValues = z.infer<typeof schema>;

// ── Main component ────────────────────────────────────────────────────────────

export function PharmaSubmitForm() {
  const router = useRouter();
  const { mutate: submit, isPending } = useSubmitPharma();

  const defaultTemplate = getPharmaTemplateById(DEFAULT_PHARMA_TEMPLATE_ID)!;

  const [activeTemplateId, setActiveTemplateId] = useState<string>(
    defaultTemplate.id,
  );
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: defaultTemplate.mode,
      target_pdb_id: defaultTemplate.target_pdb_id,
      initial_ligand_smiles: defaultTemplate.initial_ligand_smiles ?? "",
      max_iterations: defaultTemplate.max_iterations,
      candidate_count: defaultTemplate.candidate_count,
    },
  });

  const mode = watch("mode");

  const handleTemplateSelect = useCallback(
    (template: PharmaTemplate) => {
      setActiveTemplateId(template.id);
      setValue("mode", template.mode);
      setValue("target_pdb_id", template.target_pdb_id);
      setValue("initial_ligand_smiles", template.initial_ligand_smiles ?? "");
      setValue("max_iterations", template.max_iterations);
      setValue("candidate_count", template.candidate_count);
    },
    [setValue],
  );

  function onSubmit(values: FormValues): void {
    submit(
      {
        mode: values.mode as PharmaMode,
        target_pdb_id: values.target_pdb_id,
        initial_ligand_smiles: values.initial_ligand_smiles || undefined,
        max_iterations: values.max_iterations,
        candidate_count: values.candidate_count,
      },
      {
        onSuccess: (res) => {
          toast.success("Pipeline queued successfully");
          router.push(ROUTES.pharmaJob(res.job_id));
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Submission failed");
        },
      },
    );
  }

  const filteredTemplates = filterTag
    ? PHARMA_TEMPLATES.filter((t) => t.tags.includes(filterTag))
    : PHARMA_TEMPLATES;

  return (
    <div className="flex min-h-full flex-col overflow-y-auto">
      {/* ── Marketplace hero ──────────────────────────────────────────────── */}
      <header className="relative border-b border-white/6 px-6 pb-6 pt-6">
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute -left-20 -top-20 h-[300px] w-[400px] rounded-full opacity-[0.07] blur-[100px]"
            style={{
              background:
                "conic-gradient(from 180deg, #34d399, #6ee7b7, #a7f3d0, #34d399)",
            }}
          />
          <div
            className="absolute -right-10 -top-10 h-[200px] w-[300px] rounded-full opacity-[0.05] blur-[80px]"
            style={{
              background: "radial-gradient(circle, #60a5fa 0%, transparent 70%)",
            }}
          />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 text-white/30">
            <Microscope size={14} />
            <span className="text-[11px] font-medium uppercase tracking-wider">
              Quantum Drug Discovery Marketplace
            </span>
          </div>
          <h1 className="mt-2 text-[28px] font-light tracking-tight text-white/90">
            Browse &amp; Submit
          </h1>
          <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-white/35">
            Pick a curated target–ligand system or configure your own. One click
            to deploy across the distributed quantum-accelerated docking mesh.
          </p>
        </div>
      </header>

      {/* ── Two-panel layout ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-0 lg:flex-row">
        {/* ── Left: Browse panel ─────────────────────────────────────────── */}
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
                const meta = TEMPLATE_META[template.id] ?? FALLBACK_META;
                const Icon = meta.icon;
                const isActive = activeTemplateId === template.id;

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
                          ? `${meta.borderActive} bg-white/[0.07]`
                          : "border-white/6 bg-white/[0.025] hover:border-white/12 hover:bg-white/[0.045]"
                      }`}
                    >
                      {/* Coloured preview band */}
                      <div
                        className={`relative flex flex-col gap-1 border-b border-white/5 px-4 py-3 ${meta.previewBg}`}
                      >
                        <div className={`font-mono text-[10px] leading-relaxed ${meta.previewText}`}>
                          <span className="opacity-50">TARGET</span>{" "}
                          <span className="font-semibold">{template.target_pdb_id}</span>
                        </div>
                        <div className={`font-mono text-[9px] leading-relaxed ${meta.previewText} opacity-70`}>
                          {template.target_name}
                        </div>
                        {template.initial_ligand_smiles && (
                          <div
                            className={`mt-1 truncate font-mono text-[9px] ${meta.previewText} opacity-50`}
                            title={template.initial_ligand_smiles}
                          >
                            {template.initial_ligand_smiles.slice(0, 44)}
                            {template.initial_ligand_smiles.length > 44 ? "…" : ""}
                          </div>
                        )}
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
                          <div>
                            <h3 className="text-[13px] font-semibold text-white/80 group-hover:text-white/95">
                              {template.title}
                            </h3>
                            <p className={`text-[10px] ${meta.accent} opacity-70`}>
                              {template.indication}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/30">
                          {template.description}
                        </p>
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
                              <ArrowRight
                                size={8}
                                className={`${meta.accent} opacity-40`}
                              />
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
          </div>
        </div>

        {/* ── Right: Config panel ─────────────────────────────────────────── */}
        <div className="flex flex-col border-t border-white/5 lg:flex-1 lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-white/5 px-5 py-3">
            <SlidersHorizontal size={12} className="text-white/30" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/35">
              Pipeline Configuration
            </span>
            {activeTemplateId && (
              <span className="ml-auto rounded-full bg-white/6 px-2 py-0.5 text-[10px] text-white/35">
                from{" "}
                <span className="text-white/55">
                  {getPharmaTemplateById(activeTemplateId)?.title}
                </span>
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
              {/* Mode selector */}
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Pipeline Mode
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(["optimization", "discovery"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setValue("mode", m)}
                      className={[
                        "flex items-center gap-3 rounded-xl border p-4 text-left transition-all",
                        mode === m
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          : "border-white/6 bg-white/[0.025] text-white/40 hover:border-white/12 hover:bg-white/[0.045]",
                      ].join(" ")}
                    >
                      {m === "optimization" ? (
                        <Dna size={16} />
                      ) : (
                        <Search size={16} />
                      )}
                      <div>
                        <p className="text-[13px] font-medium capitalize">
                          {m}
                        </p>
                        <p className="mt-0.5 text-[11px] opacity-60">
                          {m === "optimization"
                            ? "Refine a known ligand"
                            : "Generate novel candidates"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* PDB ID */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Target PDB ID
                </label>
                <input
                  {...register("target_pdb_id")}
                  onChange={(e) =>
                    setValue("target_pdb_id", e.target.value.toUpperCase(), {
                      shouldValidate: true,
                    })
                  }
                  placeholder="e.g. 6LU7"
                  className="w-full rounded-lg border border-white/6 bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none transition-colors"
                />
                {errors.target_pdb_id && (
                  <p className="mt-1 text-xs text-red-400">
                    {errors.target_pdb_id.message}
                  </p>
                )}
              </div>

              {/* Seed SMILES (optimization only) */}
              {mode === "optimization" && (
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-white/30">
                    Seed Ligand SMILES{" "}
                    <span className="normal-case opacity-50">(optional)</span>
                  </label>
                  <textarea
                    {...register("initial_ligand_smiles")}
                    rows={3}
                    placeholder="CC(C)Cc1ccc(cc1)C(C)C(O)=O"
                    className="w-full resize-none rounded-lg border border-white/6 bg-white/[0.04] px-4 py-2.5 font-mono text-[12px] text-white/80 placeholder:text-white/20 focus:border-emerald-500/50 focus:outline-none transition-colors"
                  />
                  {errors.initial_ligand_smiles && (
                    <p className="mt-1 text-xs text-red-400">
                      {errors.initial_ligand_smiles.message}
                    </p>
                  )}
                </div>
              )}

              {/* Advanced parameters */}
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Advanced Parameters
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] text-white/25">
                      Max Iterations
                    </label>
                    <input
                      type="number"
                      {...register("max_iterations", { valueAsNumber: true })}
                      min={1}
                      max={20}
                      className="w-full rounded-lg border border-white/6 bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 focus:border-emerald-500/50 focus:outline-none transition-colors"
                    />
                    {errors.max_iterations && (
                      <p className="mt-1 text-xs text-red-400">
                        {errors.max_iterations.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] text-white/25">
                      Candidate Count
                    </label>
                    <input
                      type="number"
                      {...register("candidate_count", { valueAsNumber: true })}
                      min={10}
                      max={500}
                      className="w-full rounded-lg border border-white/6 bg-white/[0.04] px-4 py-2.5 text-sm text-white/80 focus:border-emerald-500/50 focus:outline-none transition-colors"
                    />
                    {errors.candidate_count && (
                      <p className="mt-1 text-xs text-red-400">
                        {errors.candidate_count.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isPending}
                className="mt-2 w-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <FlaskConical size={15} className="mr-2" />
                    Submit Pipeline
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
