import { NextResponse } from "next/server";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function GET() {
  const res = await fetch(BACKEND_AGENTKIT.NOTIFICATIONS, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { notification_id } = body;
  const res = await fetch(BACKEND_AGENTKIT.NOTIF_READ(notification_id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
