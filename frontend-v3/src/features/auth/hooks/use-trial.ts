"use client";
import { useMemo } from "react";
import { CONFIG } from "@/constants";
import type { TrialStatus } from "../types";
import { useAuth } from "./use-auth";

export type { TrialStatus };

export interface UseTrialReturn {
  trialStatus: TrialStatus;
  trialEndsAt: Date | null;
  msLeft: number | null;
  isLoading: boolean;
}

export function useTrial(): UseTrialReturn {
  const { user, loading } = useAuth();

  return useMemo<UseTrialReturn>(() => {
    if (process.env.NEXT_PUBLIC_TRIAL_DISABLED === "true") {
      return { trialStatus: "bypass", trialEndsAt: null, msLeft: null, isLoading: false };
    }

    if (loading || !user) {
      return { trialStatus: "active", trialEndsAt: null, msLeft: null, isLoading: true };
    }

    const bypassEmails = (
      process.env.NEXT_PUBLIC_TRIAL_BYPASS_EMAILS ?? ""
    )
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (bypassEmails.includes(user.email.toLowerCase())) {
      return { trialStatus: "bypass", trialEndsAt: null, msLeft: null, isLoading: false };
    }

    const createdAt =
      user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt as string);

    const endsAt = new Date(createdAt.getTime() + CONFIG.TRIAL_DURATION_MS);
    const now = new Date();
    const ms = endsAt.getTime() - now.getTime();
    const status: TrialStatus = ms > 0 ? "active" : "expired";

    return {
      trialStatus: status,
      trialEndsAt: endsAt,
      msLeft: Math.max(0, ms),
      isLoading: false,
    };
  }, [user, loading]);
}

export function useTrialEnabled(): boolean {
  const { trialStatus, isLoading } = useTrial();
  if (isLoading) return true;
  return trialStatus !== "expired";
}
