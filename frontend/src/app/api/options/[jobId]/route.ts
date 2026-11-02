import { financeResultResponse } from "@/shared/server/finance-result-response";
import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";
import { type NextRequest, NextResponse } from "next/server";
import { BACKEND } from "@/constants";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  try {
    const download = request.nextUrl.searchParams.get("download") === "provenance";
    const url = new URL(BACKEND.OPTIONS.DETAIL(jobId));
    if (download) url.searchParams.set("download", "provenance");
    const res = await financeBackendFetch(url.toString());
    return await financeResultResponse(res, download);
  } catch {
    return NextResponse.json(
      { detail: "Backend unreachable" },
      { status: 502 },
    );
  }
}
