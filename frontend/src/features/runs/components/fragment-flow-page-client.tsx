"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunDetail } from "../hooks/use-run-detail";

const FragmentFlowCanvas = dynamic(
  () =>
    import("./fragment-flow-canvas").then((m) => m.FragmentFlowCanvas),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full" />,
  },
);

export function FragmentFlowPageClient() {
  const { runId } = useParams<{ runId: string }>();
  const { data: run, isLoading, isError } = useRunDetail(runId);

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !run) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Run not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-normal text-foreground">Fragment Flow</h1>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {run.jobId}
        </p>
      </div>
      <FragmentFlowCanvas run={run} />
    </div>
  );
}
