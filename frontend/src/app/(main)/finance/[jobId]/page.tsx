"use client";

import { BarChart2 } from "lucide-react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useFinanceJob } from "@/features/finance/hooks/use-finance-job";
import { FinanceResultSummary } from "@/features/finance/components/finance-result-summary";

export default function FinanceDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, isPending, isError } = useFinanceJob(jobId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={BarChart2}
        label="Financial Analysis"
        title="Job Result"
        description="Quantum financial optimization and fairness analysis."
        glow="emerald"
      />
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "280px" }}>
          <div
            className="absolute h-[240px] w-[300px] rounded-full opacity-12 blur-[90px]"
            style={{ left: "0%", top: "-40px", background: "radial-gradient(circle, rgba(52,211,153,0.45) 0%, transparent 70%)" }}
          />
          <div
            className="absolute h-[200px] w-[250px] rounded-full opacity-8 blur-[75px]"
            style={{ right: "5%", top: "-20px", background: "radial-gradient(circle, rgba(16,185,129,0.4) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative z-10">
          {isPending ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-2xl bg-white/5" />
              <Skeleton className="h-48 w-full rounded-2xl bg-white/5" />
              <Skeleton className="h-32 w-full rounded-2xl bg-white/5" />
            </div>
          ) : isError || !data ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ring-red-500/20"
              style={{ background: "rgba(239,68,68,0.06)" }}
            >
              <p className="text-sm text-red-400">Failed to load finance job.</p>
            </div>
          ) : (
            <FinanceResultSummary job={data} />
          )}
        </div>
      </div>
    </div>
  );
}
