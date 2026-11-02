import "server-only";
import { backendAssertion } from "@/features/auth/server/backend-assertion";
import { getSession } from "@/features/auth/server/session";

export async function financeBackendFetch(
  url: string,
  init: RequestInit = {},
  signInMessage = "Sign in to run financial analysis.",
) {
  const session = await getSession();
  if (!session?.user)
    return Response.json(
      { detail: signInMessage },
      { status: 401 },
    );
  const assertion = backendAssertion(session.user);
  if (!assertion)
    return Response.json(
      { detail: "Backend authentication is not configured." },
      { status: 503 },
    );
  const headers = new Headers(init.headers);
  headers.set("Authorization", assertion);
  return fetch(url, { ...init, headers, cache: "no-store", redirect: "error" });
}
