import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/shared/lib/mongodb";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ exists: false });
  }

  const db = await getDatabase();
  const user = await db.collection("user").findOne(
    { email },
    { projection: { _id: 1 } },
  );

  return NextResponse.json({ exists: !!user });
}
