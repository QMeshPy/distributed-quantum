"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QUERY_KEYS_AGENTKIT } from "@/constants/query-keys";
import { fetchNearPublication, publishExperiments } from "@/features/agentkit/lib/near-publish";

/** Header action on a finished experiment: anchor its result on NEAR testnet, then link it. */
export function PublishToNearButton({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const key = QUERY_KEYS_AGENTKIT.nearPublication(jobId);
  const status = useQuery({ queryKey: key, queryFn: () => fetchNearPublication(jobId) });
  const publish = useMutation({
    mutationFn: () => publishExperiments([jobId]),
    onSuccess: (result) => {
      queryClient.setQueryData(key, result);
      toast.success("Published to NEAR testnet", {
        action: { label: "View", onClick: () => window.open(result.explorer_url, "_blank", "noopener") },
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "NEAR publishing failed"),
  });

  if (status.isPending) return null;
  if (status.data?.published && status.data.explorer_url) {
    return (
      <a
        href={status.data.explorer_url}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[12px] font-medium text-emerald-300 ring-1 ring-emerald-400/30 transition-colors hover:bg-emerald-400/10"
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        On NEAR testnet
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={publish.isPending}
      onClick={() => publish.mutate()}
      className="h-8 cursor-pointer gap-1.5"
    >
      {publish.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      )}
      {publish.isPending ? "Publishing…" : "Publish to NEAR"}
    </Button>
  );
}
