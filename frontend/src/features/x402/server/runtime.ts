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
import type { X402Config } from "./config";

type Environment = Readonly<Record<string, string | undefined>>;
type PaidHandler = (request: NextRequest) => Promise<NextResponse>;

type PaidRouteDefinition = {
  path: string;
  resource: X402Resource;
  buildRouteConfig: (config: X402Config) => RouteConfig;
};

const PAID_ROUTES: readonly PaidRouteDefinition[] = [
  {
    path: API.X402.QUANTUM_RUNS,
    resource: "circuits",
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
      description: "Submit an OpenQASM circuit to the distributed quantum mesh",
      mimeType: "application/json",
      extensions: declareDiscoveryExtension({
        bodyType: "json",
        input: {
          circuit: "OPENQASM 2.0; include \"qelib1.inc\"; qreg q[1]; h q[0];",
        },
        inputSchema: {
          type: "object",
          properties: {
            circuit: {
              type: "string",
              description: "Quantum circuit in OpenQASM format",
            },
          },
          required: ["circuit"],
        },
        output: {
          example: {
            job_id: "job-8d0f5af2-fd36-40be-8d62-a9f48f8d3d6d",
            status: "queued",
          },
        },
      }),
    }),
  },
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
];

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
