import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS_AGENTKIT } from "@/constants/query-keys";
import { API_AGENTKIT } from "@/constants/api";
import type { WalletBalance } from "../types";

export function useWallet() {
  return useQuery<WalletBalance>({
    queryKey: QUERY_KEYS_AGENTKIT.wallet(),
    queryFn: async () => {
      const res = await fetch(API_AGENTKIT.WALLET);
      // 400/404 means no wallet yet — return null instead of throwing
      if (res.status === 400 || res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch wallet");
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
  });
}

export function useCreateWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(API_AGENTKIT.WALLET, { method: "POST" });
      if (!res.ok) throw new Error("Failed to create wallet");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS_AGENTKIT.wallet() });
    },
  });
}

export function useTransferUSDC() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ to_address, amount }: { to_address: string; amount: string }) => {
      const res = await fetch(API_AGENTKIT.WALLET_TRANSFER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_address, amount }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.error ?? "Transfer failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS_AGENTKIT.wallet() });
    },
  });
}

export function useWalletTransactions() {
  return useQuery({
    queryKey: [...QUERY_KEYS_AGENTKIT.wallet(), "transactions"],
    queryFn: async () => {
      const res = await fetch(API_AGENTKIT.WALLET_TX);
      if (!res.ok) throw new Error("Failed to fetch transactions");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.transactions ?? []);
    },
    staleTime: 30_000,
    retry: false,
  });
}
