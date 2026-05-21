import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.toString();
    // Backend marketplace uses /workers endpoint
    const BASE = BACKEND_AGENTKIT.MARKETPLACE.replace("/agents", "/workers");
    const url = query ? `${BASE}?${query}` : BASE;
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();
    // Normalize: workers -> agents shape for frontend consistency
    if (data.workers !== undefined) {
      return NextResponse.json(
        data.workers.map((w: Record<string, unknown>) => ({
          agent_id: w.worker_id ?? w.id,
          agent_name: w.agent_name ?? w.worker_name ?? w.name,
          description: w.description ?? "",
          capabilities: w.capabilities ?? [],
          pricing_per_task: w.pricing_per_task ?? w.price_per_task ?? "0",
          reputation_score: w.reputation_score ?? 0,
          total_tasks: w.total_tasks ?? 0,
          status: w.status ?? "active",
          specialty: w.specialty as string | undefined,
          rating: w.rating as number | undefined,
          price_per_task: w.price_per_task as number | undefined,
        })),
        { status: res.status }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
