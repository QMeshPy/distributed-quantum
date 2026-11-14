import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";
import { agentBackendFetch } from "@/features/agentkit/server/backend-fetch";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const res = await agentBackendFetch(BACKEND_AGENTKIT.NEAR_PUBLISH(id), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await request.json()),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
