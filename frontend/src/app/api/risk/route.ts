import { type NextRequest, NextResponse } from "next/server";
import { BACKEND } from "@/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(BACKEND.RISK.LIST);
    const data: unknown = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ detail: "Backend unreachable" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const res = await fetch(BACKEND.RISK.SUBMIT_CSV, {
        method: "POST",
        body: formData,
      });
      const data: unknown = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
    const body: unknown = await request.json();
    const res = await fetch(BACKEND.RISK.SUBMIT, {
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
