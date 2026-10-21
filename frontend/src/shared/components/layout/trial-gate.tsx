"use client";
import { UI } from "@/constants";
import { useTrial } from "@/features/auth";
import { TrialExpiredOverlay } from "@/features/auth";
import { UpgradeButton } from "@/features/billing";

interface TrialGateProps {
  children: React.ReactNode;
}

export function TrialGate({ children }: TrialGateProps) {
  const { trialStatus, trialEndsAt, isLoading } = useTrial();

  if (isLoading || trialStatus !== "expired") {
    return <>{children}</>;
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="pointer-events-none select-none blur-sm">{children}</div>
      <TrialExpiredOverlay
        endsAt={trialEndsAt}
        action={<UpgradeButton label={UI.BILLING.UPGRADE_NOW_CTA} className="w-full" />}
      />
    </div>
  );
}
