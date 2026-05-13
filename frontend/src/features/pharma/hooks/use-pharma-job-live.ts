import { useQuery } from "@tanstack/react-query";
import { BACKEND } from "@/constants/backend";
import { QUERY_KEYS } from "@/constants/query-keys";
import type { LiveJobState } from "../types-live";

export function usePharmaJobLive(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.pharma.live(jobId),
    queryFn: async (): Promise<LiveJobState | null> => {
      const res = await fetch(BACKEND.PHARMA.LIVE(jobId));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch live state");
      return res.json() as Promise<LiveJobState>;
    },
    refetchInterval: enabled ? 2000 : false,
    enabled: !!jobId && enabled,
  });
}
