import { proxyProvenanceVerification } from "@/features/runs/server/provenance-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bundleId: string }> },
) {
  const { bundleId } = await params;
  return proxyProvenanceVerification(bundleId, request.headers.get("authorization"));
}
