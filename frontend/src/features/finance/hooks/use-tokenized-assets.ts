"use client";
import { useQuery } from "@tanstack/react-query";
import { readApiError } from "@/shared/lib/api-error";
import { QUERY_KEYS, API } from "@/constants";
import type { TokenizedAssetsResponse } from "../types";

export function useTokenizedAssets() {
  return useQuery<TokenizedAssetsResponse>({
    queryKey: QUERY_KEYS.finance.tokenizedAssets(),
    queryFn: async () => {
      const res = await fetch(API.FINANCE.TOKENIZED_ASSETS);
      if (!res.ok) {
        throw new Error(await readApiError(res, "Tokenized assets are unavailable"));
      }
      return res.json() as Promise<TokenizedAssetsResponse>;
    },
    staleTime: Infinity,
  });
}
