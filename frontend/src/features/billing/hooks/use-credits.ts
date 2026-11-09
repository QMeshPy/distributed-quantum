"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { API, BILLING, CONFIG, QUERY_KEYS, UI } from "@/constants";
import type { CreditPaymentMethod } from "../lib/credit-packs";
import type { CreditsOverview } from "../types";

/** The signed-in user's credit balance and the packs on offer. */
export function useCredits(pollUntil: number | null) {
  return useQuery<CreditsOverview>({
    queryKey: QUERY_KEYS.billing.credits(),
    queryFn: async () => {
      const res = await fetch(API.BILLING.CREDITS);
      if (!res.ok) throw new Error(UI.CREDITS.ERROR);
      return res.json() as Promise<CreditsOverview>;
    },
    staleTime: CONFIG.STALE_TIME_MS,
    retry: false,
    // After Checkout the webhook lands a few seconds later; poll until then.
    refetchInterval: () =>
      pollUntil !== null && Date.now() < pollUntil ? BILLING.CHECKOUT_POLL_INTERVAL_MS : false,
  });
}

/** Starts Stripe Checkout for a credit pack; the browser is redirected on success. */
export function useBuyCredits() {
  return useMutation({
    mutationFn: async ({ priceId, method }: { priceId: string; method: CreditPaymentMethod }) => {
      const res = await fetch(API.BILLING.CREDITS_CHECKOUT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, method }),
      });
      if (!res.ok) throw new Error(UI.CREDITS.UNAVAILABLE);
      const { url } = (await res.json()) as { url: string };
      window.location.assign(url);
    },
    onError: () => toast.error(UI.BILLING.ERROR),
  });
}

/**
 * Handles the return from a credit-pack Checkout. Returns the time until
 * which the balance should be polled, or null when not returning from one.
 */
export function useCreditsReturn(): number | null {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const result = searchParams.get(BILLING.CREDITS_RESULT_PARAM);
  const [pollUntil] = useState(() =>
    result === BILLING.CHECKOUT_SUCCESS
      ? Date.now() + BILLING.CHECKOUT_POLL_INTERVAL_MS * BILLING.CHECKOUT_POLL_ATTEMPTS
      : null,
  );

  useEffect(() => {
    if (result === BILLING.CHECKOUT_SUCCESS) toast.success(UI.CREDITS.CHECKOUT_SUCCESS);
    else if (result === BILLING.CHECKOUT_CANCELLED) toast.info(UI.CREDITS.CHECKOUT_CANCELLED);
    else return;
    router.replace(pathname);
  }, [result, router, pathname]);

  return pollUntil;
}
