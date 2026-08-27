import type { NextRequest } from "next/server";

import { getQuantumRun } from "@/features/x402/server/quantum-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params;
  return getQuantumRun(jobId);
}
