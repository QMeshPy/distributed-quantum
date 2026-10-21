import { handleStripeWebhookRequest } from "@/features/billing/server/webhook";

export const dynamic = "force-dynamic";

// Takes precedence over the Better Auth catch-all so every Stripe event is
// signature-checked and de-duplicated before the subscription handler sees it.
export async function POST(req: Request) {
  return handleStripeWebhookRequest(req);
}
