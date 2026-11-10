import { agentBackendFetch } from "@/features/agentkit/server/backend-fetch";
import { proxyFilecoin } from "@/features/filecoin/server/proxy";

export const maxDuration = 600;
async function handle(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyFilecoin(request, path, agentBackendFetch);
}
export { handle as GET, handle as POST };
