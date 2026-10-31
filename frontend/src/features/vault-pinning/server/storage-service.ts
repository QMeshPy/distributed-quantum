import "server-only";

import { z } from "zod";
import { CID } from "multiformats/cid";
import { getSession } from "@/features/auth/server/session";
import { getDatabase } from "@/shared/lib/mongodb";
import { getProvider, StorageError } from "./providers";

const MAX_BODY_BYTES = 1_048_576;
const fields = {
  cid: z.string().max(200).refine((value) => {
    try { CID.parse(value); return true; } catch { return false; }
  }),
  service: z.enum(["pinata", "nft.storage", "lighthouse"]),
};
const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    ...fields,
    action: z.literal("pin"),
    type: z.enum(["circuit", "run"]),
    metadata: z.object({ name: z.string().min(1).max(500) }).catchall(z.unknown()),
  }).strict(),
  z.object({ ...fields, action: z.literal("unpin"), hardDelete: z.boolean().default(false) }).strict(),
]);
const metadataUpdateSchema = z.object({
  service: fields.service,
  size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  sizeSource: z.enum(["estimated", "actual"]).optional(),
  syncStatus: z.enum(["pending", "synced", "failed"]).optional(),
  error: z.string().max(500).optional(),
}).strict();

async function getVaultUser(request: Request): Promise<string> {
  const session = await getSession();
  if (!session?.user?.id) throw new StorageError("Unauthorized", 401);
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new StorageError("Cross-origin storage requests are not allowed.", 403);
  }
  return session.user.id;
}

function errorResponse(error: unknown): Response {
  return Response.json({
    error: error instanceof StorageError ? error.message : "Vault storage is unavailable. Retry shortly.",
  }, { status: error instanceof StorageError ? error.status : 503 });
}

async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new StorageError("Content-Type must be application/json.", 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new StorageError("Vault requests must be at most 1 MiB.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new StorageError("JSON body is required.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new StorageError("Vault requests must be at most 1 MiB.", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof StorageError) throw error;
    throw new StorageError("Invalid JSON body.", 400);
  } finally {
    reader.releaseLock();
  }
}

export async function mutateVaultPin(request: Request): Promise<Response> {
  try {
    const userId = await getVaultUser(request);
    const parsed = mutationSchema.safeParse(await readBody(request));
    if (!parsed.success) throw new StorageError("Invalid vault pin request.", 400);
    const body = parsed.data;
    const { cid, service, action } = body;
    const audit = (await getDatabase()).collection("vault_pin_audit");
    if (action === "pin") {
      const result = await getProvider(service).pin(cid, body.metadata);
      await audit.insertOne({
        userId, cid, service, action, gatewayCid: result.cid,
        size: result.size, sizeSource: "actual", type: body.type, metadata: body.metadata,
        timestamp: result.pinnedAt, syncStatus: "synced",
      });
      return Response.json({ success: true, gatewayCid: result.cid });
    }

    const previous = await audit.findOne({ userId, cid, service }, { sort: { timestamp: -1 } });
    if (!previous || previous.action !== "pin") throw new StorageError("Pin not found.", 404);
    if (body.hardDelete) {
      // Shared provider pins can acquire another owner while a deletion is in flight.
      throw new StorageError("Permanent deletion is only available in the provider dashboard. Remove this pin from vault tracking only.", 409);
    }
    await audit.insertOne({
      userId, cid, service, action, gatewayCid: previous.gatewayCid,
      size: 0, sizeSource: "actual", type: previous.type, metadata: previous.metadata,
      timestamp: new Date(), syncStatus: "synced",
    });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function updateVaultPinMetadata(request: Request, cid: string): Promise<Response> {
  try {
    const userId = await getVaultUser(request);
    const parsed = metadataUpdateSchema.safeParse(await readBody(request));
    if (!fields.cid.safeParse(cid).success || !parsed.success) {
      throw new StorageError("Invalid vault metadata update.", 400);
    }
    const { service, ...update } = parsed.data;
    if (!Object.keys(update).length) throw new StorageError("No metadata update supplied.", 400);
    const audit = (await getDatabase()).collection("vault_pin_audit");
    const previous = await audit.findOne({ userId, cid, service }, { sort: { timestamp: -1 } });
    if (!previous) throw new StorageError("Pin not found.", 404);
    await audit.updateOne({ _id: previous._id, userId }, { $set: update });
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
