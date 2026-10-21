"use client";

import { Button } from "@/components/ui/button";
import { UI } from "@/constants";
import { useUpgrade } from "../hooks/use-billing";

interface UpgradeButtonProps {
  label?: string;
  className?: string;
}

export function UpgradeButton({ label = UI.BILLING.UPGRADE_CTA, className }: UpgradeButtonProps) {
  const upgrade = useUpgrade();

  return (
    <Button
      className={className}
      disabled={upgrade.isPending}
      onClick={() => upgrade.mutate()}
    >
      {label}
    </Button>
  );
}
