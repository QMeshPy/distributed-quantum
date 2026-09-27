import type { NextRequest } from "next/server";

import { getOptionsRun } from "@/features/x402/server/options-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<Response> {
  const { jobId } = await params;
  return getOptionsRun(jobId);
}
