import type { NextRequest } from "next/server";

import { postOptionsRun } from "@/features/x402/server/options-runs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  return postOptionsRun(request);
}
