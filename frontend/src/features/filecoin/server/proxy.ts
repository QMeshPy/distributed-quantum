import { BACKEND } from "@/constants/backend";

const IDENTIFIER = "[a-zA-Z0-9_-]{1,128}";
const READ = [
  /^accounts$/,
  /^artifacts$/,
  new RegExp(`^agents/${IDENTIFIER}/balance$`),
  new RegExp(`^agents/${IDENTIFIER}/operations/${IDENTIFIER}$`),
  new RegExp(`^tasks/${IDENTIFIER}$`),
];
const WRITE = [
  /^(artifacts|retrieve|status|verify|payments|finance-submit)$/,
  new RegExp(`^runs/${IDENTIFIER}/archive$`),
  new RegExp(`^tasks/${IDENTIFIER}/run$`),
];
const MAX_BODY = Math.ceil((16 * 1024 * 1024) / 3) * 4 + 16384;

export async function proxyFilecoin(
  request: Request,
  segments: string[],
  send: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<Response> {
  const path = segments.join("/");
  const allowed =
    request.method === "GET" ? READ : request.method === "POST" ? WRITE : [];
  if (!allowed.some((pattern) => pattern.test(path)))
    return Response.json(
      { error: "Unknown Filecoin operation." },
      { status: 404 },
    );
  if (
    request.method === "POST" &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return Response.json(
      { error: "Use the signed-in application to submit this operation." },
      { status: 403 },
    );
  if (
    request.method === "POST" &&
    !request.headers.get("content-type")?.startsWith("application/json")
  )
    return Response.json({ error: "JSON is required." }, { status: 415 });
  let body: string | undefined;
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length")) > MAX_BODY)
      return Response.json({ error: "File exceeds 16 MiB." }, { status: 413 });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BODY) {
          await reader.cancel();
          return Response.json(
            { error: "File exceeds 16 MiB." },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    body = new TextDecoder().decode(bytes);
    try {
      JSON.parse(body);
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }
  }
  try {
    const endpoint =
      path === "finance-submit"
        ? "finance/filecoin-submit"
        : `filecoin/${path}`;
    const upstream = await send(`${BACKEND.BASE_URL}/api/v1/${endpoint}`, {
      method: request.method,
      ...(body === undefined
        ? {}
        : { body, headers: { "Content-Type": "application/json" } }),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Filecoin service unavailable. Check the operation before submitting another write.",
      },
      { status: 502 },
    );
  }
}
