import { useQuery } from "@tanstack/react-query";
import { AGENT_API, AGENT_QUERY_KEYS } from "@/constants/agent";
import type { AgentSession } from "../types";

export function useAgentSessions() {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.sessions(),
    queryFn: async (): Promise<AgentSession[]> => {
      const res = await fetch(AGENT_API.SESSIONS, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch agent sessions");
      }
      return res.json();
    },
    refetchInterval: 10000, // Refetch every 10s
  });
}
