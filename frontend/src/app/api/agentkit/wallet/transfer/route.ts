import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function POST(request: Request) {
  try {
    const { to_address, amount } = await request.json();
    const res = await fetch(BACKEND_AGENTKIT.WALLET_TRANSFER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_address, amount }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
