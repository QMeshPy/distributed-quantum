import { type NextRequest, NextResponse } from "next/server";
import { BACKEND } from "@/constants";
import { financeBackendFetch } from "@/shared/server/finance-backend-fetch";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await financeBackendFetch(BACKEND.PHARMA.LIST);
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const res = await financeBackendFetch(BACKEND.PHARMA.SUBMIT, {
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
