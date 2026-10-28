if (process.env.SPREADSHEETS_ENABLED !== "true")
  throw new Error("Spreadsheet preview is disabled");
import { createHmac } from "node:crypto";
import {
  enginePath,
  forwardFrame,
  outboundFrame,
} from "../src/shared/spreadsheets/access.ts";

const app = process.env.SPREADSHEET_APP_INTERNAL_URL || "http://127.0.0.1:3000";
const origin = new URL(process.env.BETTER_AUTH_URL || app).origin;
const engine = process.env.ETHERCALC_INTERNAL_URL;
const secret = process.env.ETHERCALC_KEY;
if (!engine || !secret || secret.length < 32)
  throw new Error(
    "Configure ETHERCALC_INTERNAL_URL and ETHERCALC_KEY (32+ characters)",
  );
const assets =
  /^\/sheets-engine\/(?:static|images|l10n)\/[a-zA-Z0-9_./-]+\.(?:js|css|png|gif|svg|woff2?|json)$/;
const authFor = (room) =>
  createHmac("sha256", secret).update(room).digest("hex");
async function permission(cookie, room) {
  const response = await fetch(`${app}/api/spreadsheets/room/${room}`, {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Permission denied");
  const result = await response.json();
  if (!result.userId) throw new Error("Permission denied");
  return result;
}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.SPREADSHEET_GATEWAY_PORT || 8002),
  async fetch(req, server) {
    try {
      const url = new URL(req.url);
      if (req.method !== "GET")
        return new Response("Method not allowed", { status: 405 });
      if (url.pathname.includes("..") || url.pathname.includes("%"))
        return new Response("Not found", { status: 404 });
      const route = enginePath(url.pathname);
      if (!route && !assets.test(url.pathname))
        return new Response("Not found", { status: 404 });
      const cookie = req.headers.get("cookie") || "";
      const permitted = route ? await permission(cookie, route.room) : null;
      if (route?.kind === "ws") {
        if (req.headers.get("origin") !== origin)
          return new Response("Forbidden", { status: 403 });
        const upstreamUrl = new URL(`${engine}/_ws/${route.room}`);
        upstreamUrl.protocol =
          upstreamUrl.protocol === "https:" ? "wss:" : "ws:";
        upstreamUrl.searchParams.set("user", permitted.userId);
        upstreamUrl.searchParams.set(
          "auth",
          permitted.write ? authFor(route.room) : "0",
        );
        const upstream = new WebSocket(upstreamUrl);
        await new Promise((resolve, reject) => {
          upstream.onopen = resolve;
          upstream.onerror = reject;
          setTimeout(() => reject(new Error("Connection timeout")), 10000);
        });
        if (
          server.upgrade(req, {
            data: {
              upstream,
              cookie,
              room: route.room,
              queue: Promise.resolve(),
              timer: null,
            },
          })
        )
          return;
        upstream.close();
        return new Response("Upgrade failed", { status: 400 });
      }
      const target = new URL(
        `${engine}${url.pathname.replace("/sheets-engine", "")}`,
      );
      if (route) {
        target.searchParams.set("auth", "0");
        if (!permitted.write) target.searchParams.set("view", "1");
      }
      const upstream = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      if (upstream.status >= 300 && upstream.status < 400)
        return new Response("Unexpected engine redirect", { status: 502 });
      const headers = new Headers({
        "Content-Type":
          upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; form-action 'none'; object-src 'none'",
      );
      // The browser never receives the engine's write HMAC; the gateway attaches it to authorized frames.
      let body = upstream.body;
      if (route) {
        let html = await upstream.text();
        html = html.replace(
          "</head>",
          `<script>history.replaceState(null,'',location.pathname+'?auth=${permitted.write ? "gateway" : "0"}${permitted.write ? "" : "&view=1"}');</script></head>`,
        );
        return new Response(html, { status: upstream.status, headers });
      }
      return new Response(body, { status: upstream.status, headers });
    } catch {
      return new Response("Spreadsheet unavailable or access denied", {
        status: 403,
      });
    }
  },
  websocket: {
    maxPayloadLength: 65536,
    open(ws) {
      const { upstream, cookie, room } = ws.data;
      upstream.onmessage = (event) => {
        try {
          ws.send(outboundFrame(String(event.data)));
        } catch {
          ws.close(1011);
        }
      };
      upstream.onclose = () => ws.close();
      upstream.onerror = () => ws.close(1011);
      ws.data.timer = setInterval(
        () =>
          permission(cookie, room).catch(() =>
            ws.close(1008, "Session expired"),
          ),
        15000,
      );
    },
    message(ws, message) {
      ws.data.queue = ws.data.queue
        .then(async () => {
          const p = await permission(ws.data.cookie, ws.data.room);
          ws.data.upstream.send(
            forwardFrame(
              String(message),
              ws.data.room,
              p.userId,
              p.write,
              authFor(ws.data.room),
              p.readableRooms,
            ),
          );
        })
        .catch(() => ws.close(1008, "Permission denied or invalid frame"));
    },
    close(ws) {
      clearInterval(ws.data.timer);
      ws.data.upstream.close();
    },
  },
});
console.log(
  `Spreadsheet gateway listening on ${server.hostname}:${server.port}`,
);
