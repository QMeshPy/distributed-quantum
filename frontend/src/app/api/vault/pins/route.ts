import { NextResponse } from "next/server";
import { getDatabase } from "@/shared/lib/mongodb";
import { getSession } from "@/features/auth/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDatabase();

  const pipeline = [
    { $match: { userId: session.user.id } },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: { cid: "$cid", service: "$service" },
        lastAction: { $first: "$action" },
        size: { $first: "$size" },
        type: { $first: "$type" },
        metadata: { $first: "$metadata" },
        timestamp: { $first: "$timestamp" },
      },
    },
    { $match: { lastAction: "pin" } },
    { $sort: { timestamp: -1 } },
  ];

  const results = await db
    .collection("vault_pin_audit")
    .aggregate(pipeline)
    .toArray();

  const pins = results.map((r) => ({
    cid: r._id.cid,
    service: r._id.service,
    size: r.size,
    type: r.type,
    metadata: r.metadata,
    pinnedAt: r.timestamp?.toISOString?.() ?? new Date().toISOString(),
  }));

  return NextResponse.json({ pins });
}
