import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGENT_API, AGENT_QUERY_KEYS } from "@/constants/agent";
import type { SendMessageRequest } from "../types";

export function useSendMessage(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: SendMessageRequest): Promise<void> => {
      if (!sessionId) throw new Error("No active session");

      const res = await fetch(`${AGENT_API.SESSIONS}/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        throw new Error("Failed to send message");
      }
    },
    onSuccess: () => {
      if (sessionId) {
        queryClient.invalidateQueries({
          queryKey: AGENT_QUERY_KEYS.session(sessionId),
        });
      }
    },
  });
}
