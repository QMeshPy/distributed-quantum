import { BACKEND } from "@/constants";
import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const { planId } = await params;
    const res = await financeBackendFetch(BACKEND.JOBS.PLAN(planId));
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
