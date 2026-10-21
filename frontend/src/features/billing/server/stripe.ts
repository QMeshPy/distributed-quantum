import "server-only";

import Stripe from "stripe";
import { stripe as stripePlugin } from "@better-auth/stripe";
import { BILLING } from "@/constants";
import { getDatabase } from "@/shared/lib/mongodb";
import { customerIdFromEvent, isEntitled } from "../lib/subscription";

interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
}

/** Billing is optional: it is enabled only when all Stripe variables are set. */
export function getStripeConfig(): StripeConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!secretKey || !webhookSecret || !priceId) return null;
  return { secretKey, webhookSecret, priceId };
}

let _client: Stripe | undefined;

export function getStripeClient(secretKey: string): Stripe {
  _client ??= new Stripe(secretKey);
  return _client;
}

/**
 * Recomputes `hasSubscription` from Stripe itself rather than from the event
 * payload, so duplicate or out-of-order deliveries always converge on the
 * customer's current state.
 */
async function syncSubscriptionFlag(client: Stripe, customerId: string): Promise<void> {
  const subscriptions = await client.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const hasSubscription = isEntitled(subscriptions.data.map((s) => s.status));

  const db = await getDatabase();
  await db
    .collection("user")
    .updateOne({ stripeCustomerId: customerId }, { $set: { hasSubscription } });
}

export function createStripePlugin() {
  const config = getStripeConfig();
  if (!config) return null;

  const client = getStripeClient(config.secretKey);

  return stripePlugin({
    stripeClient: client,
    stripeWebhookSecret: config.webhookSecret,
    subscription: {
      enabled: true,
      plans: [{ name: BILLING.PLAN_NAME, priceId: config.priceId }],
    },
    // Runs after the plugin has stored the subscription row. Errors propagate so
    // the webhook responds non-2xx and Stripe retries the event.
    onEvent: async (event) => {
      const customerId = customerIdFromEvent(event);
      if (customerId) await syncSubscriptionFlag(client, customerId);
    },
  });
}
