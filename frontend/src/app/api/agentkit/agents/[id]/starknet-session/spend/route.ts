import { agentBackendFetch } from "@/features/agentkit/server/backend-fetch";
import { BACKEND_AGENTKIT } from "@/constants/backend";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const response = await agentBackendFetch(
      `${BACKEND_AGENTKIT.AGENTS}/${encodeURIComponent(id)}/starknet-session/spend`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch {
    return Response.json({ error: "Starknet session service unavailable." }, { status: 502 });
  }
}
