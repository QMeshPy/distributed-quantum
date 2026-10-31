import { type NextRequest, NextResponse } from "next/server";
import { BACKEND } from "@/constants";
import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  try {
    const res = await financeBackendFetch(BACKEND.PHARMA.LIVE(jobId));
    if (res.status === 404) return new NextResponse(null, { status: 404 });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
