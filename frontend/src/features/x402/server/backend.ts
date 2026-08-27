import "server-only";

import type { X402Config } from "./config";

const GATEWAY_HEADER = "X-X402-Gateway-Secret";

export async function submitX402Job(
  request: Request,
  config: X402Config,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return forward(
    `${config.backendBaseUrl}/api/v1/internal/x402/circuits/submit`,
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
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  return forward(
    `${config.backendBaseUrl}/api/v1/internal/x402/jobs/${encodeURIComponent(jobId)}`,
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
