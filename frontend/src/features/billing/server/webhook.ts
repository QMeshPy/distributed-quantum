import "server-only";

import { toNextJsHandler } from "better-auth/next-js";
import { MongoServerError, type Db } from "mongodb";
import { BILLING } from "@/constants";
import { getAuth } from "@/features/auth/server/auth";
import { getDatabase } from "@/shared/lib/mongodb";
import { handleStripeWebhook, type ProcessedEventStore } from "../lib/webhook";
import { getStripeClient, getStripeConfig } from "./stripe";

const DUPLICATE_KEY_ERROR = 11000;

let _indexReady: Promise<string> | undefined;

function createMongoEventStore(db: Db): ProcessedEventStore {
  const events = db.collection(BILLING.PROCESSED_EVENTS_COLLECTION);
  _indexReady ??= events.createIndex({ eventId: 1 }, { unique: true });

  return {
    async claim(eventId) {
      await _indexReady;
      try {
        await events.insertOne({ eventId, receivedAt: new Date() });
        return true;
      } catch (error) {
        if (error instanceof MongoServerError && error.code === DUPLICATE_KEY_ERROR) {
          return false;
        }
        throw error;
      }
    },
    async release(eventId) {
      await events.deleteOne({ eventId });
    },
  };
}

export async function handleStripeWebhookRequest(request: Request): Promise<Response> {
  const config = getStripeConfig();
  if (!config) {
    return Response.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const client = getStripeClient(config.secretKey);
  const auth = await getAuth();
  const { POST } = toNextJsHandler(auth);

  return handleStripeWebhook(request, {
    verify: (payload, signature) =>
      client.webhooks.constructEventAsync(payload, signature, config.webhookSecret),
    store: createMongoEventStore(await getDatabase()),
    forward: POST,
  });
}
