import { BACKEND } from "@/constants";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type ActivityItem = {
  id: string;
  type: "run" | "options" | "risk" | "finance";
  label: string;
  status: "completed" | "running" | "failed" | "pending";
  createdAt: string;
};

type RawJob = { id: string; status: string; createdAt?: string; created_at?: string };

function normaliseStatus(raw: string): ActivityItem["status"] {
  const s = raw.toLowerCase();
  if (s === "completed" || s === "success") return "completed";
  if (s === "running" || s === "in_progress") return "running";
  if (s === "failed" || s === "error") return "failed";
  return "pending";
}

export async function GET(req: NextRequest) {
  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "5");

    const [runsRes, optionsRes, riskRes, financeRes] = await Promise.allSettled([
      fetch(BACKEND.WORKFLOWS.RUNS),
      fetch(BACKEND.OPTIONS.LIST),
      fetch(BACKEND.RISK.LIST),
      fetch(BACKEND.FINANCE.LIST),
    ]);

    const sources: Array<[PromiseSettledResult<Response>, ActivityItem["type"], string]> = [
      [runsRes, "run", "Run"],
      [optionsRes, "options", "Options Job"],
      [riskRes, "risk", "Risk Analysis"],
      [financeRes, "finance", "Finance Analysis"],
    ];

    const items: ActivityItem[] = [];

    for (const [result, type, labelPrefix] of sources) {
      if (result.status !== "fulfilled" || !result.value.ok) continue;
      try {
        const data = await result.value.json() as RawJob[] | { items?: RawJob[]; results?: RawJob[] };
        const jobs: RawJob[] = Array.isArray(data) ? data : (data.items ?? data.results ?? []);
        for (const job of jobs.slice(0, limit)) {
          items.push({
            id: job.id,
            type,
            label: `${labelPrefix} ${job.id.slice(0, 8)}`,
            status: normaliseStatus(job.status ?? ""),
            createdAt: job.createdAt ?? job.created_at ?? new Date().toISOString(),
          });
        }
      } catch {
        // skip malformed responses
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ items: items.slice(0, limit) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 502 });
  }
}
