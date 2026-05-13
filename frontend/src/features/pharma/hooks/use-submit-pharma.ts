"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { PharmaSubmitPayload, PharmaSubmitResponse } from "../types";

export function useSubmitPharma() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PharmaSubmitPayload): Promise<PharmaSubmitResponse> => {
      const res = await fetch(API.PHARMA.SUBMIT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || "Pharma submission failed");
      }
      return res.json() as Promise<PharmaSubmitResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.pharma.list() });
    },
  });
}
