"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { readApiError } from "@/shared/lib/api-error";
import { QUERY_KEYS, API } from "@/constants";
import type {
  BackendFinancialSubmitResponse,
  TokenizedPortfolioRequest,
} from "../types";

export function useTokenizedPortfolio() {
  const queryClient = useQueryClient();

  return useMutation<
    BackendFinancialSubmitResponse,
    Error,
    TokenizedPortfolioRequest
  >({
    mutationFn: async (request) => {
      const res = await fetch(API.FINANCE.TOKENIZED_PORTFOLIO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Analysis request failed"));
      }
      return res.json() as Promise<BackendFinancialSubmitResponse>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.finance.all() });
      toast.success("Tokenized-stock analysis submitted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
