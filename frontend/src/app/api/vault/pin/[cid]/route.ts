import { updateVaultPinMetadata } from "@/features/vault-pinning/server/storage-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ cid: string }> },
) {
  const { cid } = await params;
  return updateVaultPinMetadata(req, cid);
}
