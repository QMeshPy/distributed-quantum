"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type { CircuitSubmitRequest, CircuitSubmitResponse } from "../types";

export function useCreateRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      request: CircuitSubmitRequest,
    ): Promise<CircuitSubmitResponse> => {
      const res = await fetch(API.RUNS.CREATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error("Failed to create run");
      return res.json() as Promise<CircuitSubmitResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.runs.all() });
    },
  });
}
