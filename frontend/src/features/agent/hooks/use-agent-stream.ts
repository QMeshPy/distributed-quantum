import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getStreamWS, AGENT_QUERY_KEYS } from "@/constants/agent";
import { useAgentStore } from "../stores/agent-store";
import { toast } from "sonner";
import type { AgentSession } from "../types";

export function useAgentStream(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const setPendingApproval = useAgentStore((s) => s.setPendingApproval);

  useEffect(() => {
    if (!sessionId) return;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const ws = new WebSocket(
        getStreamWS(sessionId)
      );

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        // Update query cache with real-time data
        queryClient.setQueryData(
          AGENT_QUERY_KEYS.session(sessionId),
          (old: AgentSession | undefined) => {
            if (!old) return old;

            switch (message.type) {
              case "agent_message":
                return {
                  ...old,
                  messages: [...old.messages, {
                    id: crypto.randomUUID(),
                    role: "agent" as const,
                    content: message.data.message,
                    metadata: {
                      thinking: message.data.thinking,
                      actions: message.data.actions,
                    },
                    timestamp: new Date().toISOString(),
                  }],
                };

              case "step_progress":
                return {
                  ...old,
                  workflow: old.workflow ? {
                    ...old.workflow,
                    steps: old.workflow.steps.map((step) =>
                      step.id === message.data.step_id
                        ? {
                            ...step,
                            progress_percent: message.data.progress_percent,
                            status: message.data.status,
                          }
                        : step
                    ),
                    progress_percent: message.data.workflow_progress_percent,
                  } : old.workflow,
                };

              case "approval_required":
                setPendingApproval({
                  sessionId,
                  data: message.data,
                });
                return old;

              case "cost_update":
                return {
                  ...old,
                  cost: { ...old.cost, ...message.data },
                };

              case "workflow_completed":
                toast.success("Workflow completed!");
                return {
                  ...old,
                  status: "completed" as const,
                };

              case "error":
                toast.error(message.data.message);
                return old;

              default:
                return old;
            }
          }
        );
      };

      ws.onclose = () => {
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);

          toast.info(`Reconnecting... (attempt ${reconnectAttempts})`);

          reconnectTimeout = setTimeout(() => {
            connect();
          }, delay);
        } else {
          toast.error("Lost connection to agent. Please refresh the page.");
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onopen = () => {
        reconnectAttempts = 0;
        if (reconnectAttempts > 0) {
          toast.success("Reconnected to agent!");
        }
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [sessionId, queryClient, setPendingApproval]);
}
