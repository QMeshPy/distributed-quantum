import { BILLING } from "@/constants";
import type { ConnectPayoutStatus } from "../types";

/** Connect Express is opt-in and test-mode oriented (#110). */
export function connectEnabled(
  secretKey: string | undefined,
  flag: string | undefined = process.env.STRIPE_CONNECT_ENABLED,
): boolean {
  if (!secretKey?.trim()) return false;
  if ((flag ?? "").trim().toLowerCase() !== "true") return false;
  // Prefer test keys; live keys are out of scope for #110.
  return secretKey.startsWith("sk_test_");
}

/**
 * Maps a Stripe Account into the UI status workers see.
 * Ready = KYC submitted and payouts enabled; otherwise pending once an account exists.
 */
export function connectStatusFromAccount(account: {
  details_submitted?: boolean | null;
  payouts_enabled?: boolean | null;
}): Exclude<ConnectPayoutStatus, "not_started" | "unavailable"> {
  if (account.details_submitted && account.payouts_enabled) {
    return BILLING.CONNECT_STATUS_READY;
  }
  return BILLING.CONNECT_STATUS_PENDING;
}

export function connectStatusLabel(status: ConnectPayoutStatus): string {
  switch (status) {
    case BILLING.CONNECT_STATUS_READY:
      return "Payout ready";
    case BILLING.CONNECT_STATUS_PENDING:
      return "Pending";
    case BILLING.CONNECT_STATUS_UNAVAILABLE:
      return "Unavailable";
    default:
      return "Not set up";
  }
}
