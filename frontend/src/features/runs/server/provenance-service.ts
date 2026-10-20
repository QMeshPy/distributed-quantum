import "server-only";

import { BACKEND, CONFIG, UI } from "@/constants";

export async function proxyProvenanceVerification(
  bundleId: string,
  authorization: string | null,
): Promise<Response> {
  try {
    // Forward only explicit backend credentials; never manufacture a dev token
    // or forward browser cookies to a different authentication system.
    const response = await fetch(BACKEND.PROVENANCE.VERIFY(bundleId), {
      headers: authorization ? { Authorization: authorization } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(CONFIG.PROVENANCE_TIMEOUT_MS),
    });
    return Response.json(await response.json(), {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json({ error: UI.PROVENANCE.BACKEND_UNREACHABLE }, {
      status: 502,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
