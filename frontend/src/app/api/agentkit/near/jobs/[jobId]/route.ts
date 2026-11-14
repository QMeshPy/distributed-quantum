import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";
import { agentBackendFetch } from "@/features/agentkit/server/backend-fetch";

type Params = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { jobId } = await params;
    const res = await agentBackendFetch(BACKEND_AGENTKIT.NEAR_STATUS(jobId));
    return NextResponse.json(await res.json(), { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
