import "server-only";

import type Stripe from "stripe";
import { BILLING, UI } from "@/constants";
import { getSession } from "@/features/auth/server/session";
import { getDatabase } from "@/shared/lib/mongodb";
import { connectEnabled, connectStatusFromAccount } from "../lib/connect";
import type { ConnectOverview, ConnectPayoutStatus } from "../types";
import { getStripeClient } from "./stripe";

interface ConnectConfig {
  stripe: Stripe;
  defaultCountry: string;
}

interface ConnectUser {
  id: string;
  email: string;
  stripeConnectedAccountId?: string | null;
  stripeConnectPayoutsEnabled?: boolean | null;
}

export function getConnectConfig(
  env: NodeJS.ProcessEnv = process.env,
): ConnectConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!connectEnabled(secretKey, env.STRIPE_CONNECT_ENABLED)) return null;
  const country =
    env.STRIPE_CONNECT_DEFAULT_COUNTRY?.trim().toUpperCase() ||
    BILLING.CONNECT_DEFAULT_COUNTRY;
  return {
    stripe: getStripeClient(secretKey!),
    defaultCountry: country,
  };
}

async function persistConnectState(
  userId: string,
  accountId: string,
  payoutsEnabled: boolean,
): Promise<void> {
  const db = await getDatabase();
  await db.collection("user").updateOne(
    { id: userId },
    {
      $set: {
        stripeConnectedAccountId: accountId,
        stripeConnectPayoutsEnabled: payoutsEnabled,
      },
    },
  );
}

async function ensureConnectedAccount(
  config: ConnectConfig,
  user: ConnectUser,
): Promise<string> {
  if (user.stripeConnectedAccountId) return user.stripeConnectedAccountId;

  const account = await config.stripe.accounts.create({
    type: "express",
    country: config.defaultCountry,
    email: user.email,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { platformUserId: user.id },
  });

  await persistConnectState(user.id, account.id, Boolean(account.payouts_enabled));
  return account.id;
}

async function syncAccount(
  config: ConnectConfig,
  user: ConnectUser,
  accountId: string,
): Promise<ConnectOverview> {
  const account = await config.stripe.accounts.retrieve(accountId);
  const status = connectStatusFromAccount(account);
  const payoutsEnabled = status === BILLING.CONNECT_STATUS_READY;
  await persistConnectState(user.id, accountId, payoutsEnabled);
  return {
    status,
    accountId,
    dashboardAvailable: payoutsEnabled || Boolean(account.details_submitted),
  };
}

function unavailable(): ConnectOverview {
  return {
    status: BILLING.CONNECT_STATUS_UNAVAILABLE,
    accountId: null,
    dashboardAvailable: false,
  };
}

function notStarted(): ConnectOverview {
  return {
    status: BILLING.CONNECT_STATUS_NOT_STARTED,
    accountId: null,
    dashboardAvailable: false,
  };
}

export async function getConnectOverview(user: ConnectUser): Promise<ConnectOverview> {
  const config = getConnectConfig();
  if (!config) return unavailable();
  if (!user.stripeConnectedAccountId) return notStarted();
  return syncAccount(config, user, user.stripeConnectedAccountId);
}

export async function createConnectOnboardingLink(
  user: ConnectUser,
  origin: string,
): Promise<string | null> {
  const config = getConnectConfig();
  if (!config) return null;
  const accountId = await ensureConnectedAccount(config, user);
  const link = await config.stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}${BILLING.CONNECT_REFRESH_PATH}`,
    return_url: `${origin}${BILLING.CONNECT_RETURN_PATH}`,
    type: "account_onboarding",
  });
  return link.url;
}

export async function createConnectDashboardLink(
  user: ConnectUser,
): Promise<string | null> {
  const config = getConnectConfig();
  if (!config || !user.stripeConnectedAccountId) return null;
  const login = await config.stripe.accounts.createLoginLink(user.stripeConnectedAccountId);
  return login.url;
}

export async function connectOverviewResponse(): Promise<Response> {
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: UI.CONNECT.ERROR }, { status: 401 });
  }
  try {
    return Response.json(await getConnectOverview(session.user as ConnectUser));
  } catch {
    return Response.json({ error: UI.CONNECT.ERROR }, { status: 502 });
  }
}

export async function connectOnboardResponse(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: UI.CONNECT.ERROR }, { status: 401 });
  }
  try {
    const url = await createConnectOnboardingLink(
      session.user as ConnectUser,
      new URL(request.url).origin,
    );
    if (!url) return Response.json({ error: UI.CONNECT.UNAVAILABLE }, { status: 400 });
    return Response.json({ url });
  } catch {
    return Response.json({ error: UI.CONNECT.ERROR }, { status: 502 });
  }
}

export async function connectDashboardResponse(): Promise<Response> {
  const session = await getSession();
  if (!session?.user) {
    return Response.json({ error: UI.CONNECT.ERROR }, { status: 401 });
  }
  try {
    const url = await createConnectDashboardLink(session.user as ConnectUser);
    if (!url) return Response.json({ error: UI.CONNECT.UNAVAILABLE }, { status: 400 });
    return Response.json({ url });
  } catch {
    return Response.json({ error: UI.CONNECT.ERROR }, { status: 502 });
  }
}

/** Exported for tests that assert status labels without hitting Stripe. */
export function overviewFromStored(
  status: ConnectPayoutStatus,
  accountId: string | null,
): ConnectOverview {
  return {
    status,
    accountId,
    dashboardAvailable:
      status === BILLING.CONNECT_STATUS_READY || status === BILLING.CONNECT_STATUS_PENDING,
  };
}
