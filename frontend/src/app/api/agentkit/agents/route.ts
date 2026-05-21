import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function GET() {
  try {
    const res = await fetch(BACKEND_AGENTKIT.AGENTS, { cache: "no-store" });
    const data = await res.json();
    const agents = Array.isArray(data) ? data : (data.agents ?? []);
    return NextResponse.json(agents, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(BACKEND_AGENTKIT.AGENTS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
