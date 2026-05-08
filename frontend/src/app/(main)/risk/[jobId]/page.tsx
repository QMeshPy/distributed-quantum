"use client";

import { ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useRiskJob } from "@/features/risk/hooks/use-risk-job";
import { RiskResultDashboard } from "@/features/risk/components/risk-result-dashboard";

export default function RiskDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, isPending, isError } = useRiskJob(jobId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={ShieldAlert}
        label="Risk Engine"
        title="Job Result"
        description="Quantum CVaR and VaR risk analysis against classical Monte Carlo."
        glow="rose"
      />
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "280px" }}>
          <div
            className="absolute h-[240px] w-[300px] rounded-full opacity-12 blur-[90px]"
            style={{ left: "0%", top: "-40px", background: "radial-gradient(circle, rgba(251,113,133,0.45) 0%, transparent 70%)" }}
          />
          <div
            className="absolute h-[200px] w-[250px] rounded-full opacity-8 blur-[75px]"
            style={{ right: "5%", top: "-20px", background: "radial-gradient(circle, rgba(244,63,94,0.4) 0%, transparent 70%)" }}
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
              <p className="text-sm text-red-400">Failed to load risk job.</p>
            </div>
          ) : (
            <RiskResultDashboard job={data} />
          )}
        </div>
      </div>
    </div>
  );
}
