"use client";

import { Zap } from "lucide-react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useRunDetail } from "@/features/runs/hooks/use-run-detail";
import { RunQuantumSummary } from "@/features/runs/components/run-quantum-summary";

export default function RunQuantumPage() {
  const { runId } = useParams<{ runId: string }>();
  const { data: run, isLoading, isError } = useRunDetail(runId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Zap}
        label="Quantum Runs"
        title="Quantum Details"
        description="Qubit Bloch spheres, observable expectations, and circuit fragment execution."
        glow="violet"
      />
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "280px" }}>
          <div
            className="absolute h-[240px] w-[300px] rounded-full opacity-12 blur-[90px]"
            style={{ left: "5%", top: "-40px", background: "radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)" }}
          />
          <div
            className="absolute h-[200px] w-[250px] rounded-full opacity-8 blur-[75px]"
            style={{ right: "10%", top: "-20px", background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-2xl bg-white/5" />
              <Skeleton className="h-48 w-full rounded-2xl bg-white/5" />
              <Skeleton className="h-64 w-full rounded-2xl bg-white/5" />
              <Skeleton className="h-32 w-full rounded-2xl bg-white/5" />
            </div>
          ) : isError || !run ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ring-red-500/20"
              style={{ background: "rgba(239,68,68,0.06)" }}
            >
              <p className="text-sm text-red-400">Failed to load run.</p>
            </div>
          ) : (
            <RunQuantumSummary run={run} />
          )}
        </div>
      </div>
    </div>
  );
}
