import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS_AGENTKIT } from "@/constants/query-keys";
import { API_AGENTKIT } from "@/constants/api";
import type { Notification } from "../types";

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: QUERY_KEYS_AGENTKIT.notifications(),
    queryFn: async () => {
      const res = await fetch(API_AGENTKIT.NOTIFICATIONS);
      if (!res.ok) throw new Error("Failed to fetch notifications");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.notifications ?? []);
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(API_AGENTKIT.NOTIFICATIONS, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notification_id: notificationId }),
      });
      if (!res.ok) throw new Error("Failed to mark notification read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS_AGENTKIT.notifications() });
    },
  });
}
