"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QUERY_KEYS, API } from "@/constants";
import type { BackendFinancialSubmitResponse } from "../types";

export function usePortfolioUpload() {
  const queryClient = useQueryClient();

  return useMutation<BackendFinancialSubmitResponse, Error, File>({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(API.FINANCE.CREATE, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail ?? "Upload failed");
      }
      return res.json() as Promise<BackendFinancialSubmitResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.finance.all() });
      toast.success("Finance job submitted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
