import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/shared/lib/mongodb";
import { AUTH } from "@/constants";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
  }

  try {
    const db = await getDatabase();
    const user = await db.collection("user").findOne(
      { email },
      { projection: { _id: 1 } },
    );
    return NextResponse.json({ exists: !!user });
  } catch (error) {
    console.error("Auth email lookup failed:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ message: AUTH.UNAVAILABLE_MESSAGE }, { status: 503 });
  }
}
