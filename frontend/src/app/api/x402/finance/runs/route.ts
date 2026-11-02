import type { NextRequest } from "next/server";

import { postServiceRun } from "@/features/x402/server/service-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  return postServiceRun(request);
}
