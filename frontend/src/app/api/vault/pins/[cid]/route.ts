import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/shared/lib/mongodb";
import { getSession } from "@/features/auth/server/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cid: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { cid } = await params;
  const db = await getDatabase();

  const latestAction = await db
    .collection("vault_pin_audit")
    .findOne(
      { userId: session.user.id, cid },
      { sort: { timestamp: -1 } },
    );

  if (!latestAction || latestAction.action === "unpin") {
    return NextResponse.json({ pinned: false });
  }

  return NextResponse.json({
    pinned: true,
    service: latestAction.service,
    pinnedAt: latestAction.timestamp?.toISOString?.() ?? null,
    size: latestAction.size,
  });
}
