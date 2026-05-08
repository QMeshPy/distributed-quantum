"use client";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/constants";
import { authClient } from "@/features/auth/hooks/use-auth";

export function useSettings() {
  const { data: session } = authClient.useSession();

  const profileQuery = useQuery({
    queryKey: [...QUERY_KEYS.auth.session(), "profile"],
    queryFn: () => session?.user ?? null,
    enabled: !!session,
    staleTime: Infinity,
  });

  return { session, profile: profileQuery.data };
}
