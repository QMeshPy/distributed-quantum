"use client";

import { useQuery } from "@tanstack/react-query";
import { API, QUERY_KEYS } from "@/constants";
import type { PinningService, QuotaInfo } from "../types";

export function useQuota(service: PinningService) {
  return useQuery<QuotaInfo>({
    queryKey: QUERY_KEYS.vault.quota(service),
    queryFn: async () => {
      const res = await fetch(API.VAULT.QUOTA(service));
      if (!res.ok) throw new Error("Failed to fetch quota");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
