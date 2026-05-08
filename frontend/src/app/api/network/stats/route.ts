import { BACKEND } from "@/constants";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(BACKEND.DISCOVERY.STATS);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to fetch network stats" }, { status: 502 });
  }
}
