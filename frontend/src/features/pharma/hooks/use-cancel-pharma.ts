"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";

export function useCancelPharma(jobId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch(API.PHARMA.CANCEL(jobId), { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || "Failed to cancel job");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pharma.job(jobId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pharma.list() });
    },
  });
}
