import { BILLING } from "@/constants";

interface StripeEventLike {
  type: string;
  data: { object: unknown };
}

/** A user is entitled when any of their Stripe subscriptions is active or trialing. */
export function isEntitled(statuses: readonly string[]): boolean {
  return statuses.some((status) => BILLING.ENTITLED_STATUSES.includes(status));
}

/**
 * Returns the Stripe customer id for events that can change subscription state,
 * or null for every other event.
 */
export function customerIdFromEvent(event: StripeEventLike): string | null {
  if (!BILLING.SUBSCRIPTION_EVENTS.includes(event.type)) return null;

  const object = event.data.object;
  if (typeof object !== "object" || object === null || !("customer" in object)) {
    return null;
  }

  const customer = object.customer;
  if (typeof customer === "string") return customer;
  if (typeof customer === "object" && customer !== null && "id" in customer) {
    return typeof customer.id === "string" ? customer.id : null;
  }
  return null;
}
