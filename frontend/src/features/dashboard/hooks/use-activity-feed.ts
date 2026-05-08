"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";

export type ActivityItem = {
  id: string;
  type: "run" | "options" | "risk" | "finance";
  label: string;
  status: "completed" | "running" | "failed" | "pending";
  createdAt: string;
};

export type ActivityFeedResult = {
  items: ActivityItem[];
};

export function useActivityFeed(limit = 5) {
  return useQuery<ActivityFeedResult>({
    queryKey: QUERY_KEYS.dashboard.activity(limit),
    queryFn: async () => {
      const res = await fetch(`${API.DASHBOARD.ACTIVITY}?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json() as Promise<ActivityFeedResult>;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
