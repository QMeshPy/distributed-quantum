"use client";

import { useMutation } from "@tanstack/react-query";
import { API } from "@/constants";
import type {
  WalletPortfolioAnalysis,
  WalletPortfolioRequest,
} from "../types/wallet-portfolio";

async function analyzeWallet(
  body: WalletPortfolioRequest,
): Promise<WalletPortfolioAnalysis> {
  const res = await fetch(API.RISK.ANALYZE_WALLET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as { detail: unknown }).detail === "string"
        ? (data as { detail: string }).detail
        : "Wallet analysis failed";
    throw new Error(detail);
  }
  return data as WalletPortfolioAnalysis;
}

export function useWalletPortfolio() {
  return useMutation({ mutationFn: analyzeWallet });
}
