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
import { BILLING, UI } from "@/constants";
import { connectStatusLabel } from "../lib/connect";
import type { ConnectOverview, ConnectPayoutStatus } from "../types";
import {
  useConnectDashboard,
  useConnectOnboard,
  useConnectOverview,
  useConnectReturn,
} from "../hooks/use-connect";

function statusVariant(
  status: ConnectPayoutStatus,
): "default" | "secondary" | "outline" {
  if (status === BILLING.CONNECT_STATUS_READY) return "default";
  if (status === BILLING.CONNECT_STATUS_PENDING) return "outline";
  return "secondary";
}

/** Presentational card used by the settings panel and screenshot fixtures. */
export function ConnectPayoutsCard({
  overview,
  onboarding,
  openingDashboard,
  onOnboard,
  onDashboard,
}: {
  overview: ConnectOverview;
  onboarding?: boolean;
  openingDashboard?: boolean;
  onOnboard?: () => void;
  onDashboard?: () => void;
}) {
  const { status } = overview;
  const showOnboard =
    status === BILLING.CONNECT_STATUS_NOT_STARTED ||
    status === BILLING.CONNECT_STATUS_PENDING;
  const showDashboard =
    overview.dashboardAvailable && status !== BILLING.CONNECT_STATUS_UNAVAILABLE;

  return (
    <Panel className="border-border-subtle">
      <PanelHeader>
        <PanelTitle className="text-base font-medium">{UI.CONNECT.TITLE}</PanelTitle>
        <PanelDescription>{UI.CONNECT.DESCRIPTION}</PanelDescription>
      </PanelHeader>
      <PanelContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Badge {...legacyBadge(statusVariant(status))}>{connectStatusLabel(status)}</Badge>
          <div className="flex flex-wrap gap-2">
            {showOnboard ? (
              <Button
                variant="secondary"
                disabled={onboarding}
                onClick={onOnboard}
              >
                {status === BILLING.CONNECT_STATUS_PENDING
                  ? UI.CONNECT.CONTINUE_CTA
                  : UI.CONNECT.ONBOARD_CTA}
              </Button>
            ) : null}
            {showDashboard ? (
              <Button
                variant="secondary"
                disabled={openingDashboard}
                onClick={onDashboard}
              >
                {UI.CONNECT.DASHBOARD_CTA}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-subtle">{UI.CONNECT.SKIP_NOTE}</p>
        {status === BILLING.CONNECT_STATUS_UNAVAILABLE ? (
          <p className="text-xs text-subtle">{UI.CONNECT.UNAVAILABLE}</p>
        ) : null}
      </PanelContent>
    </Panel>
  );
}

export function ConnectPayoutsPanel() {
  useConnectReturn();
  const { data, isError, isPending } = useConnectOverview();
  const onboard = useConnectOnboard();
  const dashboard = useConnectDashboard();

  const overview: ConnectOverview = data ?? {
    status: isPending ? BILLING.CONNECT_STATUS_NOT_STARTED : BILLING.CONNECT_STATUS_UNAVAILABLE,
    accountId: null,
    dashboardAvailable: false,
  };

  return (
    <div className="flex flex-col gap-2">
      <ConnectPayoutsCard
        overview={overview}
        onboarding={onboard.isPending}
        openingDashboard={dashboard.isPending}
        onOnboard={() => onboard.mutate()}
        onDashboard={() => dashboard.mutate()}
      />
      {isError ? (
        <p className="px-1 text-xs text-subtle">{UI.CONNECT.ERROR}</p>
      ) : null}
    </div>
  );
}
