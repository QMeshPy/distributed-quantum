import "server-only";
import { cache } from "react";
import { BACKEND } from "@/constants";
import type { BackendJobListItem, BackendJobDetail } from "../types";
import {
  transformRunSummary,
  transformRunDetail,
} from "../lib/run-transformers";

export const getRunsList = cache(async () => {
  try {
    const res = await fetch(BACKEND.JOBS.LIST, { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendJobListItem[];
    return data.map(transformRunSummary);
  } catch {
    return null;
  }
});

export const getRunDetail = cache(async (jobId: string) => {
  try {
    const res = await fetch(BACKEND.JOBS.DETAIL(jobId), {
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendJobDetail;
    return transformRunDetail(data);
  } catch {
    return null;
  }
});
