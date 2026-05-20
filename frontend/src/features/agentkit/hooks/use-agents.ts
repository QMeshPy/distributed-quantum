import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS_AGENTKIT } from "@/constants/query-keys";
import { API_AGENTKIT } from "@/constants/api";

export type AgentItem = {
  agent_id: string;
  agent_name: string;
  owner_id: string;
  wallet_address: string;
  config: Record<string, unknown>;
  total_spent: string;
  created_at: string;
};

const DEFAULT_AGENT_BODY = {
  agent_name: "Research Assistant",
  config: {
    auto_fund: false,
    max_per_proposal: "50",
    daily_budget: "200",
    research_interests: ["quantum computing", "error correction", "variational algorithms"],
    min_reputation_threshold: 40,
  },
};

export function useAgents() {
  return useQuery<AgentItem[]>({
    queryKey: QUERY_KEYS_AGENTKIT.agents(),
    queryFn: async () => {
      const res = await fetch(API_AGENTKIT.AGENTS);
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.agents ?? []);
    },
    staleTime: 60_000,
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body?: typeof DEFAULT_AGENT_BODY) => {
      const payload = body ?? DEFAULT_AGENT_BODY;
      const res = await fetch(API_AGENTKIT.AGENTS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? err.error ?? "Failed to create agent");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS_AGENTKIT.agents() });
    },
  });
}
