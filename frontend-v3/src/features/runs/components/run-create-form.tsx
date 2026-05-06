"use client";

import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCreateRun } from "../hooks/use-create-run";
import { ROUTES } from "@/constants";
import type { HighlightedLine } from "./new-run-page-client";

const schema = z.object({
  circuit: z.string().min(10, "Circuit must be at least 10 characters"),
});

type FormValues = z.infer<typeof schema>;

type RunCreateFormProps = {
  circuit: string;
  onCircuitChange: (value: string) => void;
  highlightedLines?: HighlightedLine[];
};

export function RunCreateForm({
  circuit,
  onCircuitChange,
  highlightedLines = [],
}: RunCreateFormProps) {
  const router = useRouter();
  const { mutate: createRun, isPending } = useCreateRun();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { circuit },
  });

  useEffect(() => {
    setValue("circuit", circuit);
  }, [circuit, setValue]);

  const { onChange: rhfOnChange, ref: rhfRef, ...registerRest } = register("circuit");

  function onSubmit(values: FormValues) {
    createRun(
      { circuit: values.circuit },
      {
        onSuccess: (result) => {
          toast.success("Run submitted successfully");
          router.push(ROUTES.runDetail(result.job_id));
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Submission failed");
        },
      },
    );
  }

  function handleReset() {
    const blank = `OPENQASM 2.0;\ninclude "qelib1.inc";\n\nqreg q[2];\ncreg c[2];\n\n`;
    reset({ circuit: blank });
    onCircuitChange(blank);
  }

  function handleScroll() {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  const lines = circuit.split("\n");
  const lineCount = lines.length;
  const gateCount = lines.filter(
    (l) =>
      l.trim() &&
      !l.trim().startsWith("//") &&
      !l.trim().startsWith("OPENQASM") &&
      !l.trim().startsWith("include") &&
      !l.trim().startsWith("qreg") &&
      !l.trim().startsWith("creg") &&
      !l.trim().startsWith("measure"),
  ).length;

  const highlightMap = new Map<number, string>();
  for (const hl of highlightedLines) {
    highlightMap.set(hl.lineIndex, hl.color);
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex h-full flex-col gap-4"
    >
      {/* Stats bar */}
      <div className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2 ring-1 ring-white/8">
        <div className="flex items-center gap-4 text-[11px] tabular-nums text-white/40">
          <span>
            <span className="font-semibold text-white/70">{lineCount}</span> lines
          </span>
          <span>
            <span className="font-semibold text-white/70">{gateCount}</span> gates
          </span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-red-500/8 px-2.5 py-1 text-[11px] font-medium text-red-400/70 ring-1 ring-red-400/20 transition-all hover:bg-red-500/15 hover:text-red-300"
        >
          <Trash2 size={10} />
          Clear
        </button>
      </div>

      {/* Highlighted code editor */}
      <div className="relative flex-1">
        {/* Backdrop with line highlights */}
        <div
          ref={backdropRef}
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
          aria-hidden="true"
        >
          <div className="px-3 pt-[9px]" style={{ lineHeight: "1.7", fontSize: "11px" }}>
            {lines.map((_, i) => {
              const bgColor = highlightMap.get(i);
              return (
                <div
                  key={i}
                  className="transition-colors duration-500"
                  style={{
                    height: "calc(11px * 1.7)",
                    background: bgColor ?? "transparent",
                    borderLeft: bgColor
                      ? `2px solid ${bgColor.replace("0.08", "0.4")}`
                      : "2px solid transparent",
                    marginLeft: "-2px",
                    borderRadius: "2px",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Actual textarea */}
        <textarea
          id="circuit"
          ref={(el) => {
            rhfRef(el);
            textareaRef.current = el;
          }}
          className="relative z-10 h-full min-h-[320px] w-full resize-none rounded-lg border border-white/6 bg-black/30 px-3 py-2 font-mono text-[11px] leading-[1.7] text-white/75 placeholder:text-white/15 focus:border-white/12 focus:outline-none focus:ring-1 focus:ring-white/8 lg:min-h-[420px]"
          placeholder="OPENQASM 2.0; ..."
          onScroll={handleScroll}
          onChange={(e) => {
            rhfOnChange(e);
            onCircuitChange(e.target.value);
          }}
          {...registerRest}
        />
        {errors.circuit && (
          <p className="mt-1.5 text-[11px] text-red-400/70">
            {errors.circuit.message}
          </p>
        )}
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full gap-2 rounded-lg bg-indigo-500 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-indigo-400 disabled:opacity-40"
      >
        {isPending ? (
          <Spinner className="size-4" />
        ) : (
          <Play size={13} className="fill-current" />
        )}
        {isPending ? "Submitting…" : "Execute on Mesh"}
      </Button>
    </form>
  );
}
