"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/shared/lib/toast";
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
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { Input } from "@/components/arc/input/input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { Button } from "@/components/arc/button/button";
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
    accent: "text-info",
    accentBg: "bg-info/10 ring-info/25",
    previewBg: "bg-info/30",
    previewText: "text-info group-hover:text-info",
    tagBg: "bg-info/10",
    tagText: "text-info",
    borderActive: "border-info/30",
  },
  "egfr-inhibitor": {
    icon: Activity,
    accent: "text-accent",
    accentBg: "bg-accent/10 ring-accent/25",
    previewBg: "bg-accent/30",
    previewText: "text-accent group-hover:text-accent",
    tagBg: "bg-accent/10",
    tagText: "text-accent",
    borderActive: "border-accent/30",
  },
  "hsp90-discovery": {
    icon: Atom,
    accent: "text-success",
    accentBg: "bg-success/10 ring-success/25",
    previewBg: "bg-success/30",
    previewText: "text-success group-hover:text-success",
    tagBg: "bg-success/10",
    tagText: "text-success",
    borderActive: "border-success/30",
  },
  "ache-alzheimer": {
    icon: Brain,
    accent: "text-warning",
    accentBg: "bg-warning/10 ring-warning/25",
    previewBg: "bg-warning/30",
    previewText: "text-warning group-hover:text-warning",
    tagBg: "bg-warning/10",
    tagText: "text-warning",
    borderActive: "border-warning/30",
  },
  "tnf-alpha-discovery": {
    icon: Shield,
    accent: "text-danger",
    accentBg: "bg-danger/10 ring-danger/25",
    previewBg: "bg-danger/30",
    previewText: "text-danger group-hover:text-danger",
    tagBg: "bg-danger/10",
    tagText: "text-danger",
    borderActive: "border-danger/30",
  },
  "jak2-hematology": {
    icon: Dna,
    accent: "text-accent",
    accentBg: "bg-accent/10 ring-accent/25",
    previewBg: "bg-accent/30",
    previewText: "text-accent group-hover:text-accent",
    tagBg: "bg-accent/10",
    tagText: "text-accent",
    borderActive: "border-accent/30",
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
      .regex(/^[A-Z0-9]+$/, "PDB ID must be alphanumeric"),
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
      <header className="relative border-b border-border px-6 pb-6 pt-6">
        <div className="relative">
          <div className="flex items-center gap-2 text-faint">
            <Microscope size={14} />
            <span className="text-xs font-medium">
              Quantum Drug Discovery Marketplace
            </span>
          </div>
          <h1 className="mt-2 text-2xl text-foreground">
            Browse &amp; Submit
          </h1>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-faint">
            Pick a curated target–ligand system or configure your own. One click
            to deploy across the distributed quantum-accelerated docking mesh.
          </p>
        </div>
      </header>

      {/* ── Two-panel layout ──────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-0 lg:flex-row">
        {/* ── Left: Browse panel ─────────────────────────────────────────── */}
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
                          ?`${meta.borderActive} bg-surface-muted`
                          : "border-border bg-surface-muted hover:border-border hover:bg-surface-muted"
                      }`}
                    >
                      {/* Coloured preview band */}
                      <div
                        className={`relative flex flex-col gap-1 border-b border-border px-4 py-3 ${meta.previewBg}`}
                      >
                        <div className={`font-mono text-xs leading-relaxed ${meta.previewText}`}>
                          <span className="opacity-50">TARGET</span>{" "}
                          <span className="font-medium">{template.target_pdb_id}</span>
                        </div>
                        <div className={`font-mono text-xs leading-relaxed ${meta.previewText} opacity-70`}>
                          {template.target_name}
                        </div>
                        {template.initial_ligand_smiles && (
                          <div
                            className={`mt-1 truncate font-mono text-xs ${meta.previewText} opacity-50`}
                            title={template.initial_ligand_smiles}
                          >
                            {template.initial_ligand_smiles.slice(0, 44)}
                            {template.initial_ligand_smiles.length > 44 ? "…" : ""}
                          </div>
                        )}
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
                          <div>
                            <h3 className="text-sm font-medium text-foreground group-hover:text-foreground">
                              {template.title}
                            </h3>
                            <p className={`text-xs ${meta.accent} opacity-70`}>
                              {template.indication}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-faint">
                          {template.description}
                        </p>
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
        <div className="flex flex-col border-t border-border lg:flex-1 lg:border-t-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <SlidersHorizontal size={12} className="text-faint" />
            <span className="text-xs font-medium text-faint">
              Pipeline Configuration
            </span>
            {activeTemplateId && (
              <span className="ml-auto rounded-full bg-surface-muted px-2 py-0.5 text-xs text-faint">
                from{" "}
                <span className="text-subtle">
                  {getPharmaTemplateById(activeTemplateId)?.title}
                </span>
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
              {/* Mode selector */}
              <div>
                <p className="mb-2 text-xs font-medium text-faint">
                  Pipeline Mode
                </p>
                <RadioCards
                  aria-label="Pipeline mode"
                  value={mode}
                  onValueChange={(m) => setValue("mode", m as "optimization" | "discovery")}
                  options={[
                    { value: "optimization", label: "Optimization", description: "Refine a known ligand", icon: <Dna size={16} /> },
                    { value: "discovery", label: "Discovery", description: "Generate novel candidates", icon: <Search size={16} /> },
                  ]}
                />
              </div>

              {/* PDB ID */}
              <div>
                <Input
                  label="Target PDB ID"
                  {...register("target_pdb_id")}
                  onChange={(e) =>
                    setValue("target_pdb_id", e.target.value.toUpperCase(), {
                      shouldValidate: true,
                    })
                  }
                  placeholder="e.g. 6LU7"
                />
                {errors.target_pdb_id && (
                  <p className="mt-1 text-xs text-danger">
                    {errors.target_pdb_id.message}
                  </p>
                )}
              </div>

              {/* Seed SMILES (optimization only) */}
              {mode === "optimization" && (
                <div>
                  <Textarea
                    label="Seed Ligand SMILES (optional)"
                    {...register("initial_ligand_smiles")}
                    rows={3}
                    placeholder="CC(C)Cc1ccc(cc1)C(C)C(O)=O"
                  />
                  {errors.initial_ligand_smiles && (
                    <p className="mt-1 text-xs text-danger">
                      {errors.initial_ligand_smiles.message}
                    </p>
                  )}
                </div>
              )}

              {/* Advanced parameters */}
              <div>
                <p className="mb-2 text-xs font-medium text-faint">
                  Advanced Parameters
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="Max Iterations"
                      type="number"
                      {...register("max_iterations", { valueAsNumber: true })}
                      min={1}
                      max={20}
                    />
                    {errors.max_iterations && (
                      <p className="mt-1 text-xs text-danger">
                        {errors.max_iterations.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Input
                      label="Candidate Count"
                      type="number"
                      {...register("candidate_count", { valueAsNumber: true })}
                      min={10}
                      max={500}
                    />
                    {errors.candidate_count && (
                      <p className="mt-1 text-xs text-danger">
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
                className="mt-2 w-full bg-success text-accent-foreground hover:bg-success disabled:opacity-50"
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
