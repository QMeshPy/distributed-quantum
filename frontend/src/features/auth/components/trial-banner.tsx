"use client";
import { Clock } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { LinkButton } from "@/shared/components/link-button";
import { useTrial } from "@/features/auth/hooks/use-trial";

function formatTimeLeft(msLeft: number): string {
  if (msLeft <= 0) return "Trial ended";

  const hoursLeft = Math.ceil(msLeft / (1000 * 60 * 60));
  if (hoursLeft <= 1) return "Trial ends in less than 1 hour";
  if (hoursLeft < 24) return `${hoursLeft} hours left in trial`;

  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  return daysLeft === 1 ? "Trial ends today" : `${daysLeft} days left in trial`;
}

export function TrialBanner() {
  const { trialStatus, trialEndsAt, msLeft, isLoading } = useTrial();

  if (isLoading) return null;
  if (trialStatus !== "active") return null;
  if (!trialEndsAt || msLeft === null) return null;

  const label = formatTimeLeft(msLeft);
  const isExpiringSoon = msLeft < 6 * 60 * 60 * 1000;

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
        <div className="flex items-center gap-3">
          <Clock
            className={
              isExpiringSoon
                ? "text-danger size-4"
                : "text-subtle size-4"
            }
          />
          <Badge  className="text-xs">
            1-Hour Trial
          </Badge>
          <p className="text-sm text-subtle">{label}</p>
        </div>
        <LinkButton href="/settings" size="sm" variant="secondary">Upgrade</LinkButton>
      </div>
    </div>
  );
}
