import { afterEach, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let backendCalls = [];
let backendResponse = () => Response.json({ job_id: "fin-rh", status: "ingesting" }, { status: 201 });
mock.module("server-only", () => ({}));
mock.module("../src/shared/server/finance-backend-fetch", () => ({
  financeBackendFetch: async (url, init = {}) => {
    backendCalls.push({ url, init });
    return backendResponse();
  },
}));
const { createTokenizedPortfolioSchema } = await import(
  "../src/features/finance/schemas/tokenized-portfolio.schema"
);
const { TokenizedMarketData } = await import(
  "../src/features/finance/components/tokenized-market-data"
);
const portfolioRoute = await import("../src/app/api/finance/tokenized-portfolio/route");
const assetsRoute = await import("../src/app/api/finance/tokenized-assets/route");

afterEach(() => {
  backendCalls = [];
  backendResponse = () => Response.json({ job_id: "fin-rh", status: "ingesting" }, { status: 201 });
});

const schema = createTokenizedPortfolioSchema({
  today: "2026-10-28",
  maxHistoryDays: 366,
  minWeekdays: 60,
});
const valid = { symbols: ["SPY", "QQQ"], startDate: "2026-06-01", endDate: "2026-10-28" };

describe("tokenized portfolio form", () => {
  test("accepts a supported selection and range", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  test.each([
    [{ symbols: ["SPY"] }, "Select at least two assets."],
    [{ startDate: "2026-10-28", endDate: "2026-06-01" }, "on or after the start date"],
    [{ startDate: "2025-01-01" }, "at most 366 days"],
    [{ endDate: "2026-10-29" }, "cannot be in the future"],
    [{ endDate: "" }, "Choose a date."],
    [{ startDate: "2026-09-01", endDate: "2026-10-01" }, "at least 60 weekdays"],
  ])("rejects %j", (change, message) => {
    const parsed = schema.safeParse({ ...valid, ...change });
    expect(parsed.success).toBe(false);
    expect(parsed.error.issues.map((issue) => issue.message).join(" ")).toContain(message);
  });
});

const observations = Array.from({ length: 180 }, (_, index) => ({
  provider: "chainlink",
  feed: "eip155:4663/0x319724394D3A0e3669269846abE664Cd621f9f6A",
  round_id: String(18446744073709551625n + BigInt(index)),
  value: "772.94062777",
  observed_at: "2026-10-28T12:23:49Z",
}));

const result = {
  disclaimer: "Analysis only, not investment advice. No wallet, signature or transaction is involved.",
  market_data: {
    source: "Chainlink tokenized-equity price feeds on Robinhood Chain (eip155:4663)",
    chain_id: "eip155:4663",
    block_number: 100355076,
    block_hash: "0xd00e04738fcdbb01cee74cbdd636553d2ef67976a1b5896f45e5bbbcd3613515",
    block_timestamp: "2026-10-28T19:15:41+00:00",
    price_unit: "token_usd",
    sampling: "last valid Chainlink round per UTC day",
    requested_start: "2026-06-01",
    requested_end: "2026-10-28",
    first_date: "2026-06-23",
    last_date: "2026-10-28",
    aligned_days: 90,
    assets: [
      {
        symbol: "SPY",
        name: "SPDR S&P 500 ETF",
        isin: "US78462F1030",
        token_address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
        feed_address: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
        feed_description: "RHSPY / USD",
        feed_decimals: 8,
        rounds_read: 179,
        days_available: 90,
        first_round_id: "18446744073709551625",
        last_round_id: "18446744073709551802",
      },
    ],
  },
  allocation_weights: {
    classical: [{ symbol: "SPY", weight: 0.5 }, { symbol: "QQQ", weight: 0.5 }],
    quantum: [{ symbol: "SPY", weight: 1 }],
  },
  provenance: {
    bundle_hash: "recorded-hash",
    bundle: {
      workflow_run_id: "fin-0e9c2f4b-robinhood",
      workflow_definition_id: "portfolio-optimization",
      oracle_refs: observations,
    },
  },
};

describe("tokenized market data", () => {
  test("shows the disclaimer, source, time, weights and addresses", () => {
    const html = renderToStaticMarkup(<TokenizedMarketData result={result} />);
    expect(html).toContain("Analysis only, not investment advice.");
    expect(html).toContain("Chainlink tokenized-equity price feeds on Robinhood Chain");
    expect(html).toContain("2026-10-28T19:15:41+00:00 (block 100355076)");
    expect(html).toContain("90 daily token prices, 2026-06-23 to 2026-10-28");
    expect(html).toContain("50.0%");
    expect(html).toContain("100.0%");
    expect(html).toContain("0x117cc2133c37B721F49dE2A7a74833232B3B4C0C");
    expect(html).toContain("0x319724394D3A0e3669269846abE664Cd621f9f6A");
    expect(html).toContain("18446744073709551802");
  });

  test("summarizes provenance instead of listing every observation", () => {
    const html = renderToStaticMarkup(<TokenizedMarketData result={result} />);
    expect(html).toContain("(180 observations)");
    expect(html).toContain("/api/finance/fin-0e9c2f4b-robinhood?download=provenance");
    expect(html).toContain("recorded-hash");
    expect(html).not.toContain("18446744073709551700");
  });

  test("renders nothing for ordinary finance results", () => {
    expect(renderToStaticMarkup(<TokenizedMarketData result={{}} />)).toBe("");
  });
});

describe("tokenized proxy routes", () => {
  test("submissions forward JSON through the signed finance fetch", async () => {
    const body = { symbols: ["SPY", "QQQ"], start_date: "2026-06-01", end_date: "2026-10-28" };
    const response = await portfolioRoute.POST(
      new Request("http://local/api/finance/tokenized-portfolio", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ job_id: "fin-rh", status: "ingesting" });
    const [call] = backendCalls;
    expect(call.url).toEndWith("/api/v1/finance/tokenized-portfolio");
    expect(call.init.method).toBe("POST");
    expect(new Headers(call.init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(call.init.body)).toEqual(body);
  });

  test("invalid JSON never reaches the backend", async () => {
    const response = await portfolioRoute.POST(
      new Request("http://local/api/finance/tokenized-portfolio", { method: "POST", body: "{" }),
    );
    expect(response.status).toBe(400);
    expect(backendCalls).toEqual([]);
  });

  test("backend errors keep their status", async () => {
    backendResponse = () => Response.json({ detail: "unsupported asset" }, { status: 422 });
    const response = await portfolioRoute.POST(
      new Request("http://local/api/finance/tokenized-portfolio", {
        method: "POST",
        body: JSON.stringify({ symbols: ["SPY", "DOGE"] }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ detail: "unsupported asset" });
  });

  test("the asset list is read through the signed finance fetch", async () => {
    backendResponse = () => Response.json({ assets: [] }, { status: 200 });
    const response = await assetsRoute.GET();
    expect(response.status).toBe(200);
    expect(backendCalls[0].url).toEndWith("/api/v1/finance/tokenized-assets");
  });

  test("an unreachable backend is a 502", async () => {
    backendResponse = () => {
      throw new Error("connect ECONNREFUSED");
    };
    expect((await assetsRoute.GET()).status).toBe(502);
  });
});
