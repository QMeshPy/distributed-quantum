"use client";

import { Zap } from "lucide-react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useFinanceJob } from "@/features/finance/hooks/use-finance-job";
import { FinanceQuantumSummary } from "@/features/finance/components/finance-quantum-summary";

export default function FinanceQuantumPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, isPending, isError } = useFinanceJob(jobId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Zap}
        title="Quantum Execution"
        description="QAOA circuit, measurement states, and solver diagnostics."
      />
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "280px" }}>
          
          
        </div>

        <div className="relative z-10">
          {isPending ? (
            <div className="space-y-4">
              <Skeleton lines={5} className="h-32 w-full" />
              <Skeleton lines={6} className="h-48 w-full" />
              <Skeleton lines={6} className="h-64 w-full" />
              <Skeleton lines={5} className="h-32 w-full" />
            </div>
          ) : isError || !data ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ring-danger/20"
              style={{ background: "color-mix(in oklab, var(--danger) 6%, transparent)" }}
            >
              <p className="text-sm text-danger">Failed to load finance job.</p>
            </div>
          ) : (
            <FinanceQuantumSummary job={data} />
          )}
        </div>
      </div>
    </div>
  );
}
