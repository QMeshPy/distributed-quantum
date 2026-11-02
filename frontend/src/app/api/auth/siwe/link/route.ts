import { NextResponse } from "next/server";
import { getSession } from "@/features/auth/server/session";
import { linkWalletToUser } from "@/features/auth/server/siwe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "unauthorized", message: "You must be signed in to link a wallet." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { message, signature } = body as { message?: string; signature?: string };

    if (!message || !signature) {
      return NextResponse.json(
        { error: "bad_request", message: "Both message and signature are required." },
        { status: 400 },
      );
    }

    const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host");

    const result = await linkWalletToUser({
      userId: session.user.id,
      message,
      signature,
      hostHeader,
    });

    return NextResponse.json(result, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: "internal_error",
        message: error instanceof Error ? error.message : "Failed to link wallet.",
      },
      { status: 500 },
    );
  }
}
