import "server-only";
import { backendAssertion } from "@/features/auth/server/backend-assertion";
import { getSession } from "@/features/auth/server/session";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/shared/lib/mongodb";

export async function agentBackendFetch(url: string, init: RequestInit = {}) {
  const session = await getSession();
  if (!session?.user) return Response.json({ error: "Sign in to use your agent." }, { status: 401 });
  // The primary SIWE wallet is committed into agent-made provenance bundles.
  const wallet = await (await getDatabase())
    .collection("walletAddress")
    .findOne(
      // Better Auth's SIWE sign-in stores an ObjectId; the link route stores the string id.
      { userId: { $in: ObjectId.isValid(session.user.id) ? [session.user.id, new ObjectId(session.user.id)] : [session.user.id] }, isPrimary: true },
      { projection: { address: 1 } },
    );
  const assertion = backendAssertion(session.user, wallet?.address);
  if (!assertion) return Response.json({ error: "Agent authentication is not configured." }, { status: 503 });
  const headers = new Headers(init.headers);
  headers.set("Authorization", assertion);
  return fetch(url, { ...init, headers, cache: "no-store", redirect: "error" });
}
