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

import { fetchX402Job, submitX402Job } from "./backend";
import { loadX402Config } from "./config";
import type { X402Config } from "./config";

type Environment = Readonly<Record<string, string | undefined>>;
type PaidHandler = (request: NextRequest) => Promise<NextResponse>;

let paidHandler: PaidHandler | undefined;

export async function postConfiguredQuantumRun(
  request: Request,
  environment: Environment,
): Promise<Response> {
  const config = loadRequiredConfig(environment);
  paidHandler ??= buildPaidHandler(config);
  const nextRequest =
    request instanceof NextRequest ? request : new NextRequest(request);
  return paidHandler(nextRequest);
}

export async function getConfiguredQuantumRun(
  jobId: string,
  environment: Environment,
): Promise<Response> {
  return fetchX402Job(jobId, loadRequiredConfig(environment));
}

function buildPaidHandler(config: X402Config): PaidHandler {
  const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactAvmScheme(),
  );
  resourceServer.registerExtension(bazaarResourceServerExtension);

  const routeConfig = {
    accepts: [
      {
        scheme: "exact",
        price: config.price,
        network: config.network,
        payTo: config.payTo,
        extra: { asset: config.asset },
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
  } satisfies RouteConfig;
  const httpServer = new x402HTTPResourceServer(resourceServer, {
    [`POST ${API.X402.QUANTUM_RUNS}`]: routeConfig,
  });

  return withX402FromHTTPServer(async (request) => {
    try {
      return toNextResponse(await submitX402Job(request, config));
    } catch (error) {
      console.error("Unable to submit x402 quantum job:", error);
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
