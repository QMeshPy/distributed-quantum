import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/server/session";
import { getLinkedWalletsForUser } from "@/features/auth/server/siwe";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "unauthorized", message: "You must be signed in to view linked wallets." },
        { status: 401 },
      );
    }

    const wallets = await getLinkedWalletsForUser(session.user.id);
    return NextResponse.json({ wallets }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to fetch linked wallets.",
      },
      { status: 500 },
    );
  }
}
