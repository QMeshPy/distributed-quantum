import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/shared/lib/mongodb";
import { getSession } from "@/features/auth/server/session";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cid: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cid } = await params;
  const body = await req.json();
  const { service, size, sizeSource, syncStatus, error } = body;

  if (!service) {
    return NextResponse.json({ error: "service is required" }, { status: 400 });
  }

  const db = await getDatabase();
  const update: Record<string, unknown> = {};
  if (size !== undefined) update.size = size;
  if (sizeSource) update.sizeSource = sizeSource;
  if (syncStatus) update.syncStatus = syncStatus;
  if (error !== undefined) update.error = error;

  await db.collection("vault_pin_audit").updateOne(
    { userId: session.user.id, cid, service },
    { $set: update },
    { sort: { timestamp: -1 } } as never,
  );

  return NextResponse.json({ success: true });
}
