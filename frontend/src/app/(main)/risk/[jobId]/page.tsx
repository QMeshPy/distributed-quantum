"use client";

import { ShieldAlert } from "lucide-react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useRiskJob } from "@/features/risk/hooks/use-risk-job";
import { ShareToVaultButton } from "@/features/ipfs/components/share-to-vault-button";
import { RiskResultDashboard } from "@/features/risk/components/risk-result-dashboard";

export default function RiskDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, isPending, isError } = useRiskJob(jobId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={ShieldAlert}
        title="Job Result"
        description="Quantum CVaR and VaR risk analysis against classical Monte Carlo."
      >
        {data && data.status.toLowerCase() === "completed" && (
          <ShareToVaultButton
            data={data as unknown as Record<string, unknown>}
            name={data.jobId}
            type="run"
          />
        )}
      </PageHeader>
      <div className="relative flex-1 overflow-y-auto p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: "280px" }}>
          
          
        </div>

        <div className="relative z-10">
          {isPending ? (
            <div className="space-y-4">
              <Skeleton lines={5} className="h-32 w-full" />
              <Skeleton lines={6} className="h-48 w-full" />
              <Skeleton lines={5} className="h-32 w-full" />
            </div>
          ) : isError || !data ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ring-danger/20"
              style={{ background: "color-mix(in oklab, var(--danger) 6%, transparent)" }}
            >
              <p className="text-sm text-danger">Failed to load risk job.</p>
            </div>
          ) : (
            <RiskResultDashboard job={data} />
          )}
        </div>
      </div>
    </div>
  );
}
