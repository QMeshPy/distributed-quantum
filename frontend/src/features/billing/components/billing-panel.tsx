"use client";

import { Badge } from "@/components/arc/badge/badge";
import { legacyBadge } from "@/lib/legacy-badge";
import { Button } from "@/components/arc/button/button";
import {
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@/shared/components/panel/panel";
import { UI } from "@/constants";
import { useAuth } from "@/features/auth";
import { useBillingPortal, useCheckoutReturn } from "../hooks/use-billing";
import { UpgradeButton } from "./upgrade-button";

export function BillingPanel() {
  const { user } = useAuth();
  const portal = useBillingPortal();
  const { confirming } = useCheckoutReturn();
  const hasSubscription = Boolean(user?.hasSubscription);

  return (
    <Panel className="border-border-subtle">
      <PanelHeader>
        <PanelTitle className="text-base font-medium">{UI.BILLING.TITLE}</PanelTitle>
        <PanelDescription>{UI.BILLING.DESCRIPTION}</PanelDescription>
      </PanelHeader>
      <PanelContent className="flex items-center justify-between gap-4">
        <Badge {...legacyBadge(hasSubscription ? "default" : "secondary")}>
          {confirming
            ? UI.BILLING.CONFIRMING
            : hasSubscription
              ? UI.BILLING.STATUS_SUBSCRIBED
              : UI.BILLING.STATUS_FREE}
        </Badge>
        {hasSubscription ? (
          <Button
            variant="secondary"
            disabled={portal.isPending}
            onClick={() => portal.mutate()}
          >
            {UI.BILLING.MANAGE_CTA}
          </Button>
        ) : (
          <UpgradeButton />
        )}
      </PanelContent>
    </Panel>
  );
}
