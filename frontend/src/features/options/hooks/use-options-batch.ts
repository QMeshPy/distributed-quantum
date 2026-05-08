"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QUERY_KEYS, API } from "@/constants";
import type { BackendOptionsJobSummary } from "../types";

export function useOptionsBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(API.OPTIONS.BATCH, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail ?? "Batch upload failed");
      }
      return res.json() as Promise<BackendOptionsJobSummary>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.options.all() });
      toast.success("Batch job submitted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
