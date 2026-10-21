import { describe, expect, test } from "bun:test";

import { handleStripeWebhook } from "../src/features/billing/lib/webhook.ts";
import { customerIdFromEvent, isEntitled } from "../src/features/billing/lib/subscription.ts";

const WEBHOOK_URL = "http://localhost:3000/api/auth/stripe/webhook";

function memoryStore() {
  const claimed = new Set();
  return {
    claimed,
    async claim(id) {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    },
    async release(id) {
      claimed.delete(id);
    },
  };
}

function delivery(eventId, signature = "t=1,v1=valid") {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: JSON.stringify({ id: eventId }),
  });
}

function deps({ store = memoryStore(), status = 200 } = {}) {
  const forwarded = [];
  return {
    forwarded,
    store,
    verify: async (payload, signature) => {
      if (signature !== "t=1,v1=valid") throw new Error("bad signature");
      return JSON.parse(payload);
    },
    forward: async (request) => {
      forwarded.push(await request.text());
      return new Response(null, { status });
    },
  };
}

describe("Stripe webhook", () => {
  test("rejects a delivery without a signature", async () => {
    const d = deps();
    const response = await handleStripeWebhook(delivery("evt_1", null), d);

    expect(response.status).toBe(400);
    expect(d.forwarded).toHaveLength(0);
  });

  test("rejects a delivery with an invalid signature", async () => {
    const d = deps();
    const response = await handleStripeWebhook(delivery("evt_1", "t=1,v1=forged"), d);

    expect(response.status).toBe(400);
    expect(d.forwarded).toHaveLength(0);
  });

  test("processes a replayed event exactly once", async () => {
    const d = deps();

    const first = await handleStripeWebhook(delivery("evt_1"), d);
    const replay = await handleStripeWebhook(delivery("evt_1"), d);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    expect(d.forwarded).toEqual([JSON.stringify({ id: "evt_1" })]);
  });

  test("lets Stripe retry an event whose processing failed", async () => {
    const store = memoryStore();

    const failed = await handleStripeWebhook(delivery("evt_2"), deps({ store, status: 400 }));
    expect(failed.status).toBe(400);
    expect(store.claimed.has("evt_2")).toBe(false);

    const retry = deps({ store });
    const retried = await handleStripeWebhook(delivery("evt_2"), retry);
    expect(retried.status).toBe(200);
    expect(retry.forwarded).toHaveLength(1);
  });
});

describe("subscription state", () => {
  test("active and trialing subscriptions unlock the platform", () => {
    expect(isEntitled(["active"])).toBe(true);
    expect(isEntitled(["canceled", "trialing"])).toBe(true);
    expect(isEntitled(["canceled", "past_due", "incomplete"])).toBe(false);
    expect(isEntitled([])).toBe(false);
  });

  test("reads the customer from subscription events only", () => {
    const object = { customer: "cus_123" };

    expect(customerIdFromEvent({ type: "customer.subscription.updated", data: { object } })).toBe("cus_123");
    expect(
      customerIdFromEvent({
        type: "checkout.session.completed",
        data: { object: { customer: { id: "cus_456" } } },
      }),
    ).toBe("cus_456");
    expect(customerIdFromEvent({ type: "invoice.paid", data: { object } })).toBeNull();
    expect(
      customerIdFromEvent({ type: "customer.subscription.deleted", data: { object: {} } }),
    ).toBeNull();
  });
});
