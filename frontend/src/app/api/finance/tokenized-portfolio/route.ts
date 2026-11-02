import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";
import { type NextRequest, NextResponse } from "next/server";
import { BACKEND } from "@/constants";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Expected a JSON body" }, { status: 400 });
  }
  try {
    const res = await financeBackendFetch(BACKEND.FINANCE.TOKENIZED_PORTFOLIO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}
