import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import {
  connectEnabled,
  connectStatusFromAccount,
  connectStatusLabel,
} from "../src/features/billing/lib/connect.ts";
import { ConnectPayoutsCard } from "../src/features/billing/components/connect-payouts-panel.tsx";
import { BILLING } from "../src/constants/billing.ts";

describe("connectEnabled", () => {
  test("requires a test-mode secret and explicit flag", () => {
    expect(connectEnabled("sk_test_abc", "true")).toBe(true);
    expect(connectEnabled("sk_test_abc", "false")).toBe(false);
    expect(connectEnabled("sk_test_abc", undefined)).toBe(false);
    expect(connectEnabled("sk_live_abc", "true")).toBe(false);
    expect(connectEnabled("", "true")).toBe(false);
    expect(connectEnabled(undefined, "true")).toBe(false);
  });
});

describe("connectStatusFromAccount", () => {
  test("marks payout-ready only when submitted and payouts enabled", () => {
    expect(
      connectStatusFromAccount({ details_submitted: true, payouts_enabled: true }),
    ).toBe(BILLING.CONNECT_STATUS_READY);
    expect(
      connectStatusFromAccount({ details_submitted: true, payouts_enabled: false }),
    ).toBe(BILLING.CONNECT_STATUS_PENDING);
    expect(
      connectStatusFromAccount({ details_submitted: false, payouts_enabled: false }),
    ).toBe(BILLING.CONNECT_STATUS_PENDING);
  });
});

describe("connectStatusLabel", () => {
  test("matches the settings badges", () => {
    expect(connectStatusLabel(BILLING.CONNECT_STATUS_READY)).toBe("Payout ready");
    expect(connectStatusLabel(BILLING.CONNECT_STATUS_PENDING)).toBe("Pending");
    expect(connectStatusLabel(BILLING.CONNECT_STATUS_NOT_STARTED)).toBe("Not set up");
    expect(connectStatusLabel(BILLING.CONNECT_STATUS_UNAVAILABLE)).toBe("Unavailable");
  });
});

describe("ConnectPayoutsCard", () => {
  test("not started shows onboard CTA and skip note", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectPayoutsCard, {
        overview: {
          status: BILLING.CONNECT_STATUS_NOT_STARTED,
          accountId: null,
          dashboardAvailable: false,
        },
      }),
    );
    expect(html).toContain("Not set up");
    expect(html).toContain("Set up Connect payouts");
    expect(html).toContain("on-chain worker earnings");
  });

  test("pending shows continue CTA", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectPayoutsCard, {
        overview: {
          status: BILLING.CONNECT_STATUS_PENDING,
          accountId: "acct_123",
          dashboardAvailable: true,
        },
      }),
    );
    expect(html).toContain("Pending");
    expect(html).toContain("Continue onboarding");
    expect(html).toContain("Open Express Dashboard");
  });

  test("ready shows payout ready and dashboard", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectPayoutsCard, {
        overview: {
          status: BILLING.CONNECT_STATUS_READY,
          accountId: "acct_123",
          dashboardAvailable: true,
        },
      }),
    );
    expect(html).toContain("Payout ready");
    expect(html).toContain("Open Express Dashboard");
    expect(html).not.toContain("Set up Connect payouts");
  });

  test("unavailable disables onboarding", () => {
    const html = renderToStaticMarkup(
      createElement(ConnectPayoutsCard, {
        overview: {
          status: BILLING.CONNECT_STATUS_UNAVAILABLE,
          accountId: null,
          dashboardAvailable: false,
        },
      }),
    );
    expect(html).toContain("Unavailable");
    expect(html).toContain("not available in this environment");
  });
});

describe("Connect Account Link paths", () => {
  test("return and refresh land on settings", () => {
    expect(BILLING.CONNECT_RETURN_PATH).toBe("/settings?connect=return");
    expect(BILLING.CONNECT_REFRESH_PATH).toBe("/settings?connect=refresh");
  });
});
