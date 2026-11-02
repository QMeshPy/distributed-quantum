import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/server/session";
import { unlinkWalletFromUser } from "@/features/auth/server/siwe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "unauthorized", message: "You must be signed in to unlink a wallet." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { address } = body as { address?: string };

    if (!address) {
      return NextResponse.json(
        { error: "bad_request", message: "Wallet address is required." },
        { status: 400 },
      );
    }

    const result = await unlinkWalletFromUser(session.user.id, address);
    return NextResponse.json(result, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to unlink wallet.",
      },
      { status: 500 },
    );
  }
}
