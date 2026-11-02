import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";
import { NextResponse } from "next/server";
import { BACKEND } from "@/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await financeBackendFetch(BACKEND.FINANCE.TOKENIZED_ASSETS);
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
