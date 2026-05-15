import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AGENT_API, AGENT_QUERY_KEYS } from "@/constants/agent";

export function useApproveAction(sessionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (approved: boolean): Promise<void> => {
      if (!sessionId) throw new Error("No active session");

      const endpoint = approved ? "approve" : "reject";
      const res = await fetch(`${AGENT_API.SESSIONS}/${sessionId}/${endpoint}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to ${endpoint} action`);
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
