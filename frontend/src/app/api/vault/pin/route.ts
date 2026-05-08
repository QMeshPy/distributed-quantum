import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/shared/lib/mongodb";
import { getSession } from "@/features/auth/server/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { cid, service, action, size, sizeSource, type, metadata } = body;

  if (!cid || !service || !action || !type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = await getDatabase();
  const result = await db.collection("vault_pin_audit").insertOne({
    userId: session.user.id,
    cid,
    service,
    action,
    size: size ?? 0,
    sizeSource: sizeSource ?? "estimated",
    type,
    metadata: metadata ?? {},
    timestamp: new Date(),
    syncStatus: "synced",
  });

  return NextResponse.json({ success: true, id: result.insertedId.toString() });
}
