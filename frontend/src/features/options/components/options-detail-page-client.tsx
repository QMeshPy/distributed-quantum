"use client";

import { TrendingUp } from "lucide-react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { ShareToVaultButton } from "@/features/ipfs/components/share-to-vault-button";
import { useOptionsJob } from "../hooks/use-options-job";
import { OptionsResultCard } from "./options-result-card";

export function OptionsDetailPageClient() {
  const { jobId } = useParams<{ jobId: string }>();
  const { data, isPending, isError } = useOptionsJob(jobId);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={TrendingUp}
        label="Options Pricing"
        title="Job Result"
        description="Quantum vs classical Black-Scholes pricing analysis."
        glow="amber"
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
          <div
            className="absolute h-[240px] w-[300px] rounded-full opacity-12 blur-[90px]"
            style={{ left: "0%", top: "-40px", background: "radial-gradient(circle, rgba(251,191,36,0.45) 0%, transparent 70%)" }}
          />
          <div
            className="absolute h-[200px] w-[250px] rounded-full opacity-8 blur-[75px]"
            style={{ right: "5%", top: "-20px", background: "radial-gradient(circle, rgba(245,158,11,0.4) 0%, transparent 70%)" }}
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
              <p className="text-sm text-red-400">Failed to load options job.</p>
            </div>
          ) : (
            <OptionsResultCard job={data} />
          )}
        </div>
      </div>
    </div>
  );
}
