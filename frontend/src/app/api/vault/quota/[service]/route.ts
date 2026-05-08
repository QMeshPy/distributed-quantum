import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/shared/lib/mongodb";
import { getSession } from "@/features/auth/server/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ service: string }> },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { service } = await params;
  const db = await getDatabase();

  const pipeline = [
    { $match: { userId: session.user.id, service } },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: { cid: "$cid", service: "$service" },
        lastAction: { $first: "$action" },
        size: { $first: "$size" },
      },
    },
    { $match: { lastAction: "pin" } },
    {
      $group: {
        _id: null,
        totalSize: { $sum: "$size" },
        itemCount: { $sum: 1 },
      },
    },
  ];

  const results = await db
    .collection("vault_pin_audit")
    .aggregate(pipeline)
    .toArray();

  const agg = results[0] ?? { totalSize: 0, itemCount: 0 };

  return NextResponse.json({
    used: agg.totalSize,
    total: service === "nft.storage" ? null : null,
    itemCount: agg.itemCount,
    lastSynced: new Date().toISOString(),
  });
}
