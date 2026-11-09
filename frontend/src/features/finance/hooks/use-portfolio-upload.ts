"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { readApiError } from "@/shared/lib/api-error";
import { QUERY_KEYS, API } from "@/constants";
import type { BackendFinancialSubmitResponse } from "../types";

interface PortfolioUpload { file: File; useChainlink: boolean; investmentUsd: number; expectedEthPrice: number; }

export function usePortfolioUpload() {
  const queryClient = useQueryClient();

  return useMutation<BackendFinancialSubmitResponse, Error, PortfolioUpload>({
    mutationFn: async ({ file, useChainlink, investmentUsd, expectedEthPrice }: PortfolioUpload) => {
      const formData = new FormData();
      formData.append("file", file);
      if (useChainlink) {
        formData.append("use_chainlink", "true");
        formData.append("investment_usd", String(investmentUsd));
        formData.append("expected_eth_price", String(expectedEthPrice));
      }
      const res = await fetch(API.FINANCE.CREATE, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Upload failed"));
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
