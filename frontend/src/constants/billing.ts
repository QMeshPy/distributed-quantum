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
  /** Marks a one-off Checkout Session as a credit-pack purchase. */
  CREDIT_PACK_KIND: "credit_pack",
  /** A paid session is final on either event; async methods pay on the second. */
  CREDIT_PACK_EVENTS: [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
  ] as readonly string[],
  CREDITS_RESULT_PARAM: "credits",
  /** Stripe's payment method type for stablecoins (USDC and others). */
  STABLECOIN_PAYMENT_METHOD: "crypto",
  /** Stripe only presents stablecoin payments for USD prices. */
  STABLECOIN_CURRENCY: "usd",
  /** Sent to the backend's internal credit-purchase route. */
  BILLING_SECRET_HEADER: "X-Billing-Internal-Secret",
  MIN_BILLING_SECRET_LENGTH: 32,
  /** Opt-in Connect Express onboarding for worker cash-out (#110). */
  CONNECT_RESULT_PARAM: "connect",
  CONNECT_RETURN: "return",
  CONNECT_REFRESH: "refresh",
  CONNECT_STATUS_NOT_STARTED: "not_started",
  CONNECT_STATUS_PENDING: "pending",
  CONNECT_STATUS_READY: "ready",
  CONNECT_STATUS_UNAVAILABLE: "unavailable",
  /** Default Express account country when the worker has none set. */
  CONNECT_DEFAULT_COUNTRY: "US",
  /** Settings return paths for Account Link callbacks. */
  CONNECT_RETURN_PATH: "/settings?connect=return",
  CONNECT_REFRESH_PATH: "/settings?connect=refresh",
} as const;
