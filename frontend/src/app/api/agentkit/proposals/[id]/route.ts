import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const res = await fetch(BACKEND_AGENTKIT.PROPOSAL(id), { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const url = body.action === "fund"
    ? BACKEND_AGENTKIT.PROPOSAL_FUND(id)
    : BACKEND_AGENTKIT.PROPOSAL(id);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
