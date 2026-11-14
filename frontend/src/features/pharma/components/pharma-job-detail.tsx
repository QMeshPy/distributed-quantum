"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { usePharmaJob } from "@/features/pharma/hooks/use-pharma-job";
import { useCancelPharma } from "@/features/pharma/hooks/use-cancel-pharma";

// NGL uses window + WebGL — must be client-only, no SSR
const PharmaLiveCanvas = dynamic(
  () => import("./pharma-live-canvas").then((m) => ({ default: m.PharmaLiveCanvas })),
  { ssr: false },
);

export function PharmaJobDetail({ jobId }: { jobId: string }) {
  const { data: job, isLoading, error } = usePharmaJob(jobId);
  const { mutate: cancelJob, isPending: isCancelling } = useCancelPharma(jobId);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={22} className="animate-spin text-white/20" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-400">{error instanceof Error ? error.message : "Job not found"}</p>
      </div>
    );
  }

  return <PharmaLiveCanvas job={job} onCancel={() => cancelJob()} isCancelling={isCancelling} />;
}
