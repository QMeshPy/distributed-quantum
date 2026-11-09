import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function GET() {
  try {
    const res = await fetch(BACKEND_AGENTKIT.WALLET_BALANCE, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function POST() {
  try {
    const res = await fetch(BACKEND_AGENTKIT.WALLET_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    // 409 = wallet already exists — treat as success and return current balance
    if (res.status === 409) {
      const balRes = await fetch(BACKEND_AGENTKIT.WALLET_BALANCE, { cache: "no-store" });
      const balData = await balRes.json();
      return NextResponse.json(balData, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
