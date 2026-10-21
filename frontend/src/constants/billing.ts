export const BILLING = {
  PLAN_NAME: "pro",
  /** Stripe subscription statuses that unlock the platform. */
  ENTITLED_STATUSES: ["active", "trialing"] as readonly string[],
  /** Webhook events that can change a customer's subscription state. */
  SUBSCRIPTION_EVENTS: [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ] as readonly string[],
  PROCESSED_EVENTS_COLLECTION: "stripe_webhook_events",
  CHECKOUT_RESULT_PARAM: "billing",
  CHECKOUT_SUCCESS: "success",
  CHECKOUT_CANCELLED: "cancelled",
  /** How long to poll for the webhook after returning from Checkout. */
  CHECKOUT_POLL_INTERVAL_MS: 2_000,
  CHECKOUT_POLL_ATTEMPTS: 15,
} as const;
