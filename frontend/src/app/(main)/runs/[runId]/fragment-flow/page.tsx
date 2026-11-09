"use client";

import { Zap } from "lucide-react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
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
        title="Quantum Details"
        description="Qubit Bloch spheres, observable expectations, and circuit fragment execution."
      />
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "280px" }}>
          
          
        </div>

        <div className="relative z-10">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton lines={5} className="h-32 w-full" />
              <Skeleton lines={6} className="h-48 w-full" />
              <Skeleton lines={6} className="h-64 w-full" />
              <Skeleton lines={5} className="h-32 w-full" />
            </div>
          ) : isError || !run ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ring-danger/20"
              style={{ background: "color-mix(in oklab, var(--danger) 6%, transparent)" }}
            >
              <p className="text-sm text-danger">Failed to load run.</p>
            </div>
          ) : (
            <RunQuantumSummary run={run} />
          )}
        </div>
      </div>
    </div>
  );
}
