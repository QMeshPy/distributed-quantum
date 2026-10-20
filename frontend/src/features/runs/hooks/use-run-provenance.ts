"use client";

import { useQuery } from "@tanstack/react-query";
import { API, CONFIG, QUERY_KEYS, UI } from "@/constants";
import { verificationReportSchema } from "../lib/provenance";

export function useRunProvenance(bundleId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.runs.provenance(bundleId),
    enabled: bundleId !== null,
    queryFn: async () => {
      if (!bundleId) throw new Error(UI.PROVENANCE.EMPTY);
      const response = await fetch(API.PROVENANCE.VERIFY(bundleId), { cache: "no-store" });
      if (!response.ok) throw new Error(UI.PROVENANCE.ERROR);
      return verificationReportSchema.parse(await response.json());
    },
    staleTime: CONFIG.STALE_TIME_MS,
    retry: false,
  });
}
