"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BILLING, ROUTES, UI } from "@/constants";
import { authClient, useAuth } from "@/features/auth";

function checkoutReturnUrl(result: string): string {
  const url = new URL(ROUTES.SETTINGS, window.location.origin);
  url.searchParams.set(BILLING.CHECKOUT_RESULT_PARAM, result);
  return url.toString();
}

/** Starts Stripe Checkout for the subscription plan; the browser is redirected on success. */
export function useUpgrade() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.subscription.upgrade({
        plan: BILLING.PLAN_NAME,
        successUrl: checkoutReturnUrl(BILLING.CHECKOUT_SUCCESS),
        cancelUrl: checkoutReturnUrl(BILLING.CHECKOUT_CANCELLED),
      });
      if (error) throw new Error(error.message ?? UI.BILLING.ERROR);
    },
    onError: () => toast.error(UI.BILLING.ERROR),
  });
}

/** Opens the Stripe customer portal for managing or cancelling the subscription. */
export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.subscription.billingPortal({
        returnUrl: new URL(ROUTES.SETTINGS, window.location.origin).toString(),
      });
      if (error) throw new Error(error.message ?? UI.BILLING.ERROR);
    },
    onError: () => toast.error(UI.BILLING.ERROR),
  });
}

/**
 * After returning from Checkout, the webhook may land a few seconds later.
 * Poll the session (bypassing the cookie cache) until `hasSubscription` flips.
 */
export function useCheckoutReturn(): { confirming: boolean } {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, refetch } = useAuth();
  const [attempts, setAttempts] = useState(0);

  const result = searchParams.get(BILLING.CHECKOUT_RESULT_PARAM);
  const hasSubscription = Boolean(user?.hasSubscription);

  useEffect(() => {
    if (result === BILLING.CHECKOUT_CANCELLED) {
      toast.info(UI.BILLING.CHECKOUT_CANCELLED);
      router.replace(pathname);
      return;
    }
    if (result !== BILLING.CHECKOUT_SUCCESS) return;

    if (hasSubscription) {
      toast.success(UI.BILLING.CHECKOUT_SUCCESS);
      router.replace(pathname);
      return;
    }
    if (attempts >= BILLING.CHECKOUT_POLL_ATTEMPTS) {
      toast.info(UI.BILLING.CHECKOUT_PENDING);
      router.replace(pathname);
      return;
    }

    const timer = setTimeout(async () => {
      await authClient.getSession({ query: { disableCookieCache: true } });
      await refetch();
      setAttempts((n) => n + 1);
    }, BILLING.CHECKOUT_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [result, hasSubscription, attempts, refetch, router, pathname]);

  return { confirming: result === BILLING.CHECKOUT_SUCCESS && !hasSubscription };
}
