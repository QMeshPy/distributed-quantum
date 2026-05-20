import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const res = await fetch(BACKEND_AGENTKIT.AGENT_DETAIL(id), { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
