import type { NextRequest } from "next/server";

import { postQuantumRun } from "@/features/x402/server/quantum-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  return postQuantumRun(request);
}
