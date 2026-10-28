import "server-only";
import { getSession } from "@/features/auth/server/session";
import { backendAssertion } from "@/features/auth/server/backend-assertion";

export async function pharmaRequest(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const session = await getSession();
  if (!session?.user)
    return Response.json({ detail: "Sign in required" }, { status: 401 });
  const assertion = backendAssertion(session.user);
  if (!assertion)
    return Response.json(
      { detail: "Backend identity bridge unavailable" },
      { status: 503 },
    );
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...init.headers, Authorization: assertion },
  });
}
