"use client";
import { Clock } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    <div className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
        <div className="flex items-center gap-3">
          <Clock
            className={
              isExpiringSoon
                ? "text-destructive size-4"
                : "text-muted-foreground size-4"
            }
          />
          <Badge variant="secondary" className="text-xs">
            1-Hour Trial
          </Badge>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/settings">Upgrade</Link>
        </Button>
      </div>
    </div>
  );
}
