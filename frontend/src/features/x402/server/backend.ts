import "server-only";

import type { X402Config } from "./config";

const GATEWAY_HEADER = "X-X402-Gateway-Secret";

export type X402Resource = "circuits" | "options";

const RESOURCE_PATHS: Record<
  X402Resource,
  { submit: string; job: (jobId: string) => string }
> = {
  circuits: {
    submit: "/api/v1/internal/x402/circuits/submit",
    job: (jobId) => `/api/v1/internal/x402/circuits/jobs/${encodeURIComponent(jobId)}`,
  },
  options: {
    submit: "/api/v1/options/internal/x402/submit",
    job: (jobId) => `/api/v1/options/internal/x402/jobs/${encodeURIComponent(jobId)}`,
  },
};

export async function submitX402Job(
  request: Request,
  config: X402Config,
  resource: X402Resource,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return forward(
    `${config.backendBaseUrl}${RESOURCE_PATHS[resource].submit}`,
    {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("Content-Type") ?? "application/json",
        [GATEWAY_HEADER]: config.gatewaySecret,
      },
      body: await request.text(),
      cache: "no-store",
      signal: request.signal,
    },
    fetcher,
  );
}

export async function fetchX402Job(
  jobId: string,
  config: X402Config,
  resource: X402Resource,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return forward(
    `${config.backendBaseUrl}${RESOURCE_PATHS[resource].job(jobId)}`,
    {
      headers: { [GATEWAY_HEADER]: config.gatewaySecret },
      cache: "no-store",
    },
    fetcher,
  );
}

async function forward(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Response> {
  const response = await fetcher(url, init);
  const contentType = response.headers.get("Content-Type");
  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });
}
