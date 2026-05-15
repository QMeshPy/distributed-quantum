import { useQuery } from "@tanstack/react-query";
import { AGENT_API, AGENT_QUERY_KEYS, AGENT_LIMITS } from "@/constants/agent";
import type { AgentSession } from "../types";

export function useAgentSession(sessionId: string | null) {
  return useQuery({
    queryKey: AGENT_QUERY_KEYS.session(sessionId ?? ""),
    queryFn: async (): Promise<AgentSession | null> => {
      if (!sessionId) return null;

      const res = await fetch(`${AGENT_API.SESSIONS}/${sessionId}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch agent session");
      }
      return res.json();
    },
    enabled: !!sessionId,
    refetchInterval: AGENT_LIMITS.POLL_INTERVAL_MS,
  });
}
