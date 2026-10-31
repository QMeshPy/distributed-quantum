import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";
import { agentBackendFetch } from "@/features/agentkit/server/backend-fetch";

type Params = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const res = await agentBackendFetch(BACKEND_AGENTKIT.CHAT_SESSION(id));
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const { id } = await params;
    const res = await agentBackendFetch(BACKEND_AGENTKIT.CHAT_SESSION(id), { method: "DELETE" });
    if (res.status === 204) return new NextResponse(null, { status: 204 });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
