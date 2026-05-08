import { BACKEND } from "@/constants";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ peerId: string }> },
) {
  try {
    const { peerId } = await params;
    const res = await fetch(BACKEND.DISCOVERY.PEER(peerId));
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Failed to fetch peer" }, { status: 502 });
  }
}
