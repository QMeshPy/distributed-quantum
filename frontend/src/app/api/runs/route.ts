import { BACKEND } from "@/constants";
import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";
import { submitCircuitRun } from "@/features/runs/server/runs-service";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await financeBackendFetch(BACKEND.JOBS.LIST);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    return await submitCircuitRun(body);
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
