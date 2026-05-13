"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { LiveJobState } from "../types-live";

export function usePharmaJobLive(jobId: string, enabled: boolean) {
  return useQuery<LiveJobState | null>({
    queryKey: QUERY_KEYS.pharma.live(jobId),
    queryFn: async () => {
      const res = await fetch(API.PHARMA.LIVE(jobId));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch live state");
      return res.json() as Promise<LiveJobState>;
    },
    refetchInterval: enabled ? 2_000 : false,
    enabled: !!jobId && enabled,
  });
}
