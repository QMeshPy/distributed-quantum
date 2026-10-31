import "server-only";
import { createHmac } from "node:crypto";

export async function engineRequest(
  room: string,
  method = "GET",
  save?: string,
) {
  const base = process.env.ETHERCALC_INTERNAL_URL;
  const key = process.env.ETHERCALC_KEY;
  if (!base || !key || key.length < 32)
    throw new Error("EtherCalc service is not configured");
  if (!/^ec_[a-z0-9]+$/.test(room)) throw new Error("Invalid room");
  const auth = createHmac("sha256", key).update(room).digest("hex");
  const response = await fetch(`${base}/_/${room}?auth=${auth}`, {
    method,
    headers: { "Content-Type": "text/x-socialcalc" },
    body: save,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`EtherCalc returned ${response.status}`);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error("Sheet exceeds snapshot limit");
  return text;
}
