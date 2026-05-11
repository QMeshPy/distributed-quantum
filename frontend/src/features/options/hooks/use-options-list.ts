"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS, API } from "@/constants";
import type {
  BackendOptionsJobSummary,
  OptionsJobSummary,
} from "../types";

function transform(raw: BackendOptionsJobSummary): OptionsJobSummary {
  return {
    jobId: raw.job_id,
    optionType: raw.option_type,
    status: raw.status,
    error: raw.error,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export function useOptionsList() {
  return useQuery<OptionsJobSummary[]>({
    queryKey: QUERY_KEYS.options.list(),
    queryFn: async () => {
      const res = await fetch(API.OPTIONS.LIST);
      if (!res.ok) throw new Error("Failed to fetch options list");
      const data = (await res.json()) as BackendOptionsJobSummary[];
      return data.map(transform);
    },
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      return data.some((j) => j.status === "queued" || j.status === "running" || j.status === "compiling" || j.status === "executing") ? 5_000 : 30_000;
    },
  });
}
