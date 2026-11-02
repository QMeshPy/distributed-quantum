import { agentBackendFetch } from "@/features/agentkit/server/backend-fetch";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const response = await agentBackendFetch(
      `${BACKEND_AGENTKIT.AGENTS}/${encodeURIComponent(id)}/starknet-session/revoke`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
    );
    return Response.json(await response.json(), { status: response.status });
  } catch {
    return Response.json({ error: "Starknet session service unavailable." }, { status: 502 });
  }
}
