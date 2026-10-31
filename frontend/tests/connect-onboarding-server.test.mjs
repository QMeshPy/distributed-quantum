import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const users = new Map();
const createdAccounts = [];
const createdLinks = [];
const createdLoginLinks = [];

let sessionUser = null;
let envSnapshot = {};

mock.module("../src/shared/lib/mongodb", () => ({
  getDatabase: async () => ({
    collection: () => ({
      updateOne: async (filter, update) => {
        const current = users.get(filter.id) ?? {};
        users.set(filter.id, { ...current, ...update.$set });
        return { matchedCount: 1 };
      },
    }),
  }),
}));

mock.module("../src/features/auth/server/session", () => ({
  getSession: async () => (sessionUser ? { user: sessionUser } : null),
}));

mock.module("../src/features/billing/server/stripe", () => ({
  getStripeClient: () => ({
    accounts: {
      create: async (params) => {
        const account = {
          id: `acct_${createdAccounts.length + 1}`,
          payouts_enabled: false,
          details_submitted: false,
          ...params,
        };
        createdAccounts.push(account);
        return account;
      },
      retrieve: async (id) => {
        const found = createdAccounts.find((account) => account.id === id);
        if (!found) throw new Error(`missing ${id}`);
        return found;
      },
      createLoginLink: async (id) => {
        const url = `https://connect.stripe.com/express/${id}`;
        createdLoginLinks.push(url);
        return { url };
      },
    },
    accountLinks: {
      create: async (params) => {
        createdLinks.push(params);
        return { url: `https://connect.stripe.com/setup/${params.account}` };
      },
    },
  }),
}));

const connect = await import("../src/features/billing/server/connect.ts");

afterEach(() => {
  users.clear();
  createdAccounts.length = 0;
  createdLinks.length = 0;
  createdLoginLinks.length = 0;
  sessionUser = null;
  for (const key of Object.keys(envSnapshot)) {
    if (envSnapshot[key] === undefined) delete process.env[key];
    else process.env[key] = envSnapshot[key];
  }
  envSnapshot = {};
});

function setEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    envSnapshot[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("getConnectConfig", () => {
  test("is null until Connect is explicitly enabled with a test key", () => {
    setEnv({
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_CONNECT_ENABLED: "false",
    });
    expect(connect.getConnectConfig()).toBeNull();

    setEnv({ STRIPE_CONNECT_ENABLED: "true" });
    expect(connect.getConnectConfig()?.defaultCountry).toBe("US");
  });
});

describe("Connect onboarding flow", () => {
  test("creates an Express account, persists id, and returns an Account Link", async () => {
    setEnv({
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_CONNECT_ENABLED: "true",
    });
    const user = { id: "user_1", email: "worker@example.com" };

    const url = await connect.createConnectOnboardingLink(user, "http://localhost:3000");

    expect(url).toBe("https://connect.stripe.com/setup/acct_1");
    expect(createdAccounts).toHaveLength(1);
    expect(createdAccounts[0].type).toBe("express");
    expect(createdLinks[0]).toMatchObject({
      account: "acct_1",
      type: "account_onboarding",
      return_url: "http://localhost:3000/settings?connect=return",
      refresh_url: "http://localhost:3000/settings?connect=refresh",
    });
    expect(users.get("user_1").stripeConnectedAccountId).toBe("acct_1");
    expect(users.get("user_1").stripeConnectPayoutsEnabled).toBe(false);
  });

  test("reuses an existing connected account id", async () => {
    setEnv({
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_CONNECT_ENABLED: "true",
    });
    createdAccounts.push({
      id: "acct_existing",
      details_submitted: false,
      payouts_enabled: false,
    });
    const user = {
      id: "user_2",
      email: "worker@example.com",
      stripeConnectedAccountId: "acct_existing",
    };

    const url = await connect.createConnectOnboardingLink(user, "http://localhost:3000");

    expect(url).toContain("acct_existing");
    expect(createdAccounts.filter((account) => account.email)).toHaveLength(0);
  });

  test("overview reports ready after Stripe marks payouts enabled", async () => {
    setEnv({
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_CONNECT_ENABLED: "true",
    });
    createdAccounts.push({
      id: "acct_ready",
      details_submitted: true,
      payouts_enabled: true,
    });
    const overview = await connect.getConnectOverview({
      id: "user_3",
      email: "worker@example.com",
      stripeConnectedAccountId: "acct_ready",
    });

    expect(overview.status).toBe("ready");
    expect(users.get("user_3").stripeConnectPayoutsEnabled).toBe(true);
  });

  test("dashboard link requires a stored account", async () => {
    setEnv({
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_CONNECT_ENABLED: "true",
    });
    expect(await connect.createConnectDashboardLink({ id: "u", email: "a@b.c" })).toBeNull();

    const url = await connect.createConnectDashboardLink({
      id: "u",
      email: "a@b.c",
      stripeConnectedAccountId: "acct_1",
    });
    expect(url).toBe("https://connect.stripe.com/express/acct_1");
  });
});

describe("Connect route responses", () => {
  test("returns 401 when signed out", async () => {
    sessionUser = null;
    const response = await connect.connectOverviewResponse();
    expect(response.status).toBe(401);
  });

  test("returns unavailable when Connect is off", async () => {
    setEnv({
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_CONNECT_ENABLED: "false",
    });
    sessionUser = { id: "user_4", email: "worker@example.com" };
    const response = await connect.connectOverviewResponse();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "unavailable",
      accountId: null,
    });
  });
});
