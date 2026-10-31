/** Worker Connect Express onboarding status (#110). */
export type ConnectPayoutStatus =
  | "not_started"
  | "pending"
  | "ready"
  | "unavailable";

export interface ConnectOverview {
  status: ConnectPayoutStatus;
  /** Stripe connected account id when onboarding has started. */
  accountId: string | null;
  /** True when Express Dashboard login links are available. */
  dashboardAvailable: boolean;
}

/** A credit pack as offered in the UI. */
export interface CreditOffer {
  priceId: string;
  credits: string;
  /** Formatted pack price, e.g. "$10.00". */
  price: string;
  /** True when the pack can also be paid in stablecoins (flag on, USD price). */
  stablecoin: boolean;
}

export interface CreditsOverview {
  /** Decimal strings, so credit amounts never pass through floats. */
  available: string;
  held: string;
  /** "0" when circuit runs do not use credits. */
  circuitJobCost: string;
  offers: CreditOffer[];
}
