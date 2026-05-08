import "server-only";
import { CONFIG } from "@/constants";
import type { TrialStatus } from "../types";

export type { TrialStatus };

export function getTrialStatus(userEmail: string, createdAt: Date): TrialStatus {
  const bypassEmails = (process.env.TRIAL_BYPASS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (bypassEmails.includes(userEmail.toLowerCase())) return "bypass";

  const trialEndsAt = new Date(createdAt.getTime() + CONFIG.TRIAL_DURATION_MS);
  return new Date() < trialEndsAt ? "active" : "expired";
}

export function getTrialEndsAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + CONFIG.TRIAL_DURATION_MS);
}
