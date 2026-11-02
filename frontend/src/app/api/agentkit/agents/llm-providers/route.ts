import { agentBackendFetch } from "@/features/agentkit/server/backend-fetch";
import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function GET() {
  try {
    const res = await agentBackendFetch(`${BACKEND_AGENTKIT.AGENTS}/llm-providers`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
