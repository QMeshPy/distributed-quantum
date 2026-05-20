import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS_AGENTKIT } from "@/constants/query-keys";
import { API_AGENTKIT } from "@/constants/api";
import type { Proposal, CreateProposalForm } from "../types";

export function useProposals() {
  return useQuery<Proposal[]>({
    queryKey: QUERY_KEYS_AGENTKIT.proposals(),
    queryFn: async () => {
      const res = await fetch(API_AGENTKIT.PROPOSALS);
      if (!res.ok) throw new Error("Failed to fetch proposals");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.proposals ?? []);
    },
    staleTime: 60_000,
  });
}

export function useCreateProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateProposalForm) => {
      const res = await fetch(API_AGENTKIT.PROPOSALS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create proposal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS_AGENTKIT.proposals() });
    },
  });
}

export function useFundProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: string }) => {
      const res = await fetch(API_AGENTKIT.PROPOSAL(id), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fund", amount }),
      });
      if (!res.ok) throw new Error("Failed to fund proposal");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS_AGENTKIT.proposals() });
    },
  });
}
