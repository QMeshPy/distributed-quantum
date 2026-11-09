"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API, BILLING, CONFIG, QUERY_KEYS, UI } from "@/constants";
import { authClient } from "@/features/auth/hooks/use-auth";
import type { ConnectOverview } from "../types";

export function useConnectOverview() {
  return useQuery<ConnectOverview>({
    queryKey: QUERY_KEYS.billing.connect(),
    queryFn: async () => {
      const res = await fetch(API.BILLING.CONNECT);
      if (!res.ok) throw new Error(UI.CONNECT.ERROR);
      return res.json() as Promise<ConnectOverview>;
    },
    staleTime: CONFIG.STALE_TIME_MS,
    retry: false,
  });
}

export function useConnectOnboard() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(API.BILLING.CONNECT_ONBOARD, { method: "POST" });
      if (!res.ok) throw new Error(UI.CONNECT.UNAVAILABLE);
      const { url } = (await res.json()) as { url: string };
      window.location.assign(url);
    },
    onError: () => toast.error(UI.CONNECT.ERROR),
  });
}

export function useConnectDashboard() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(API.BILLING.CONNECT_DASHBOARD, { method: "POST" });
      if (!res.ok) throw new Error(UI.CONNECT.UNAVAILABLE);
      const { url } = (await res.json()) as { url: string };
      window.location.assign(url);
    },
    onError: () => toast.error(UI.CONNECT.ERROR),
  });
}

/** Handles Account Link return/refresh query params on Settings. */
export function useConnectReturn() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const result = searchParams.get(BILLING.CONNECT_RESULT_PARAM);

  useEffect(() => {
    if (result !== BILLING.CONNECT_RETURN && result !== BILLING.CONNECT_REFRESH) return;

    if (result === BILLING.CONNECT_RETURN) toast.success(UI.CONNECT.RETURN_SUCCESS);
    else toast.info(UI.CONNECT.RETURN_REFRESH);

    void (async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.billing.connect() });
      await authClient.getSession({ query: { disableCookieCache: true } });
      router.replace(pathname);
    })();
  }, [result, queryClient, router, pathname]);
}
