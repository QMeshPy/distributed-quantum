import "server-only";
import { cache } from "react";
import { BACKEND } from "@/constants";
import { backendAssertion } from "@/features/auth/server/backend-assertion";
import { getSession } from "@/features/auth/server/session";
import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";
import type { BackendJobListItem, BackendJobDetail } from "../types";
import {
  transformRunSummary,
  transformRunDetail,
} from "../lib/run-transformers";

export const getRunsList = cache(async () => {
  try {
    const res = await financeBackendFetch(BACKEND.JOBS.LIST);
    if (!res.ok) return null;
    const data = (await res.json()) as BackendJobListItem[];
    return data.map(transformRunSummary);
  } catch {
    return null;
  }
});

export const getRunDetail = cache(async (jobId: string) => {
  try {
    const res = await financeBackendFetch(BACKEND.JOBS.DETAIL(jobId));
    if (!res.ok) return null;
    const data = (await res.json()) as BackendJobDetail;
    return transformRunDetail(data);
  } catch {
    return null;
  }
});

/**
 * Submits a circuit as the signed-in user, so the backend can charge their
 * credits. Without a session or bridge secret it submits anonymously, as before.
 */
export async function submitCircuitRun(body: unknown): Promise<Response> {
  const session = await getSession();
  const assertion = session?.user ? backendAssertion(session.user) : null;
  const res = await fetch(BACKEND.CIRCUITS.SUBMIT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(assertion ? { Authorization: assertion } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return Response.json(await res.json(), { status: res.status });
}
