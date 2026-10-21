"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <Card className="border-hairline">
      <CardHeader>
        <CardTitle className="text-base font-medium">{UI.BILLING.TITLE}</CardTitle>
        <CardDescription>{UI.BILLING.DESCRIPTION}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Badge variant={hasSubscription ? "default" : "secondary"}>
          {confirming
            ? UI.BILLING.CONFIRMING
            : hasSubscription
              ? UI.BILLING.STATUS_SUBSCRIBED
              : UI.BILLING.STATUS_FREE}
        </Badge>
        {hasSubscription ? (
          <Button
            variant="outline"
            disabled={portal.isPending}
            onClick={() => portal.mutate()}
          >
            {UI.BILLING.MANAGE_CTA}
          </Button>
        ) : (
          <UpgradeButton />
        )}
      </CardContent>
    </Card>
  );
}
