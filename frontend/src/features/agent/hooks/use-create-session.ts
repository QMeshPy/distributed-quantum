import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGENT_API, AGENT_QUERY_KEYS } from "@/constants/agent";
import type { AgentSession, CreateSessionRequest } from "../types";

export function useCreateSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      request: CreateSessionRequest = {}
    ): Promise<AgentSession> => {
      const res = await fetch(AGENT_API.SESSIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw new Error("Failed to create agent session");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AGENT_QUERY_KEYS.sessions() });
    },
  });
}
