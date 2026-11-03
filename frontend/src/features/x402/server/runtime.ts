import "server-only";

import { ExactAvmScheme } from "@x402/avm/exact/server";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { RouteConfig } from "@x402/core/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { withX402FromHTTPServer } from "@x402/next";
import { NextRequest, NextResponse } from "next/server";

import { API } from "@/constants";

import type { X402Resource } from "./backend";
import { fetchX402Job, submitX402Job } from "./backend";
import { loadX402Config } from "./config";
import type { PricedService, X402Config } from "./config";

type Environment = Readonly<Record<string, string | undefined>>;
type PaidHandler = (request: NextRequest) => Promise<NextResponse>;

type PaidRouteDefinition = {
  path: string;
  resource: X402Resource;
  buildRouteConfig: (config: X402Config) => RouteConfig;
};

const PAID_ROUTES: readonly PaidRouteDefinition[] = [
  {
    path: API.X402.OPTIONS_RUNS,
    resource: "options",
    buildRouteConfig: (config) => ({
      accepts: [
        {
          scheme: "exact",
          price: config.price,
          network: config.network,
          payTo: config.payTo,
          extra: { asset: config.asset, tag: "x402-global-challenge" },
        },
      ],
      description:
        "Run Quantum Amplitude Estimation (QAE) options pricing versus a classical Black-Scholes baseline",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        bodyType: "json",
        input: {
          option_type: "european_call_short",
          current_value: 100,
          strike_or_cost: 105,
          time_to_expiry: 0.5,
          volatility: 0.2,
          risk_free_rate: 0.03,
        },
        inputSchema: {
          type: "object",
          properties: {
            option_type: {
              type: "string",
              description:
                "One of european_call_short, european_call_long, expand, delay, abandon, patent, natural_resource, financial_flexibility",
            },
            current_value: { type: "number", description: "S0 - current asset or project value" },
            strike_or_cost: { type: "number", description: "K - strike price or investment cost" },
            time_to_expiry: { type: "number", description: "T in years" },
            volatility: { type: "number", description: "Annualised volatility" },
            risk_free_rate: { type: "number", description: "Annualised risk-free rate" },
          },
          required: [
            "option_type",
            "current_value",
            "strike_or_cost",
            "time_to_expiry",
            "volatility",
            "risk_free_rate",
          ],
        },
        output: {
          example: {
            job_id: "opt-8d0f5af2-fd36-40be-8d62-a9f48f8d3d6d",
            status: "queued",
          },
        },
      }),
    }),
  },
  paidServiceRoute({
    path: API.X402.RISK_RUNS,
    resource: "risk",
    description:
      "Quantum risk analysis: iterative amplitude estimation of VaR and CVaR for an equity or credit portfolio, against a Monte Carlo baseline",
    input: {
      risk_model: "equity",
      holdings: [
        { ticker: "AAPL", weight: 0.5 },
        { ticker: "MSFT", weight: 0.5 },
      ],
      lookback_days: 504,
    },
    inputSchema: {
      type: "object",
      properties: {
        risk_model: { type: "string", enum: ["equity", "credit"] },
        holdings: {
          type: "array",
          maxItems: 20,
          description:
            "Equity mode: stocks with a ticker and a weight. Oracle-priced holdings are not available over x402.",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              weight: { type: "number", description: "Relative weight, normalised to 1" },
            },
            required: ["ticker", "weight"],
          },
        },
        assets: {
          type: "array",
          maxItems: 15,
          description: "Credit mode: loans with principal, default_probability and recovery_rate",
          items: {
            type: "object",
            properties: {
              principal: { type: "number" },
              default_probability: { type: "number", description: "12-month PD, 0 to 1" },
              recovery_rate: { type: "number", description: "0 to 1" },
            },
            required: ["principal", "default_probability", "recovery_rate"],
          },
        },
        lookback_days: { type: "integer", description: "Trading days of history, 60 to 2520" },
      },
      required: ["risk_model"],
    },
    output: {
      job_id: "risk-8d0f5af2-fd36-40be-8d62-a9f48f8d3d6d",
      status: "queued",
      risk_model: "equity",
      portfolio_size: 2,
    },
  }),
  paidServiceRoute({
    path: API.X402.FINANCE_RUNS,
    resource: "finance",
    description:
      "Quantum portfolio optimisation (QAOA) over allowlisted tokenized stocks for a date range. Analysis only, it never trades.",
    input: {
      symbols: ["AAPL", "MSFT", "NVDA"],
      start_date: "2025-01-01",
      end_date: "2025-06-30",
      risk_aversion: 0.5,
    },
    inputSchema: {
      type: "object",
      properties: {
        symbols: {
          type: "array",
          minItems: 2,
          maxItems: 20,
          items: { type: "string" },
          description: "Allowlisted tickers: AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, SPY, QQQ",
        },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
        budget: { type: "integer", description: "Number of assets to select, at least 1" },
        risk_aversion: { type: "number", description: "0 to 10, default 0.5" },
      },
      required: ["symbols", "start_date", "end_date"],
    },
    output: {
      job_id: "fin-8d0f5af2-fd36-40be-8d62-a9f48f8d3d6d",
      status: "queued",
      problem_type: "portfolio",
    },
  }),
  paidServiceRoute({
    path: API.X402.PHARMA_RUNS,
    resource: "pharma",
    description:
      "Quantum-assisted drug discovery: dock and score candidate ligands against a protein target (PDB id)",
    input: {
      mode: "discovery",
      target_pdb_id: "1HSG",
      max_iterations: 3,
      candidate_count: 50,
    },
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["optimization", "discovery"] },
        target_pdb_id: { type: "string", description: "Protein Data Bank id, 3 to 10 characters" },
        initial_ligand_smiles: {
          type: "string",
          maxLength: 500,
          description: "Starting molecule in SMILES notation (optimization mode)",
        },
        max_iterations: { type: "integer", minimum: 1, maximum: 5 },
        candidate_count: { type: "integer", minimum: 10, maximum: 100 },
      },
      required: ["mode", "target_pdb_id"],
    },
    output: {
      job_id: "pharma_8d0f5af2fd36",
      status: "queued",
      submitted_at: "2026-01-01T00:00:00+00:00",
    },
  }),
];

type PaidServiceRoute = {
  path: string;
  resource: PricedService;
  description: string;
  input: Record<string, unknown>;
  inputSchema: Record<string, unknown>;
  output: Record<string, unknown>;
};

function paidServiceRoute(service: PaidServiceRoute): PaidRouteDefinition {
  return {
    path: service.path,
    resource: service.resource,
    buildRouteConfig: (config) => ({
      accepts: [
        {
          scheme: "exact",
          price: config.servicePrices[service.resource],
          network: config.network,
          payTo: config.payTo,
          extra: { asset: config.asset, tag: "x402-global-challenge" },
        },
      ],
      description: service.description,
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        bodyType: "json",
        input: service.input,
        inputSchema: service.inputSchema,
        output: { example: service.output },
      }),
    }),
  };
}

const PAID_ROUTES_BY_PATH = new Map(PAID_ROUTES.map((route) => [route.path, route]));

let paidHandler: PaidHandler | undefined;

export async function postConfiguredX402Run(
  request: Request,
  environment: Environment,
): Promise<Response> {
  const config = loadRequiredConfig(environment);
  paidHandler ??= buildPaidHandler(config);
  const nextRequest =
    request instanceof NextRequest ? request : new NextRequest(request);
  return paidHandler(nextRequest);
}

export async function getConfiguredX402Job(
  resource: X402Resource,
  jobId: string,
  environment: Environment,
): Promise<Response> {
  return fetchX402Job(jobId, loadRequiredConfig(environment), resource);
}

function buildPaidHandler(config: X402Config): PaidHandler {
  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactAvmScheme(),
  );
  resourceServer.registerExtension(bazaarResourceServerExtension);

  const routeConfigsByKey = Object.fromEntries(
    PAID_ROUTES.map((route) => [`POST ${route.path}`, route.buildRouteConfig(config)]),
  );
  const httpServer = new x402HTTPResourceServer(resourceServer, routeConfigsByKey);

  return withX402FromHTTPServer(async (request) => {
    const route = PAID_ROUTES_BY_PATH.get(request.nextUrl.pathname);
    if (route === undefined) {
      return NextResponse.json({ error: "Unknown x402 route." }, { status: 404 });
    }
    try {
      return toNextResponse(await submitX402Job(request, config, route.resource));
    } catch (error) {
      console.error(`Unable to submit x402 ${route.resource} job:`, error);
      return NextResponse.json(
        { error: "Backend unreachable." },
        { status: 502 },
      );
    }
  }, httpServer);
}

function loadRequiredConfig(environment: Environment): X402Config {
  const config = loadX402Config(environment);
  if (config === null) {
    throw new Error("Algorand x402 is disabled.");
  }
  return config;
}

function toNextResponse(response: Response): NextResponse {
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
