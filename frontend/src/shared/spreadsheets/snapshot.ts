import { z } from "zod";
const sheet = z.object({
  name: z.string().max(200),
  room: z.string().regex(/^ec_[a-z0-9]{64}$/),
  source: z.boolean(),
  save: z.string().max(5_000_000),
});
const run = z.object({
  kind: z.enum(["pharma", "finance", "circuit"]),
  runId: z.string().max(160),
  version: z.string().max(64),
  ownerId: z.string().max(200),
  json: z.string().max(5_000_000),
});
const schema = z.object({
  schema: z.literal(1),
  engine: z.literal("11d8a49540634249094b2c92c3ee1a3aa3d3b4ca"),
  createdAt: z.iso.datetime(),
  sheets: z.array(sheet).min(1).max(30),
  runs: z.array(run).max(30),
});
export type Snapshot = z.infer<typeof schema>;
export function validateSnapshot(text: string): Snapshot {
  if (text.length > 15_000_000) throw new Error("Snapshot exceeds limit");
  const result = schema.parse(JSON.parse(text));
  if (new Set(result.sheets.map((s) => s.room)).size !== result.sheets.length)
    throw new Error("Duplicate sheet");
  if (new Set(result.sheets.map((s) => s.room.slice(0, 35))).size !== 1)
    throw new Error("Mixed workbook rooms");
  for (const source of result.runs) JSON.parse(source.json);
  return result;
}
export function parseRange(value: string) {
  const match = /^([A-Z]{1,2})([1-9]\d{0,3}):([A-Z]{1,2})([1-9]\d{0,3})$/.exec(
    value,
  );
  if (!match) throw new Error("Use a range such as A1:B10");
  const col = (s: string) =>
    [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const [startCol, startRow, endCol, endRow] = [
    col(match[1]),
    Number(match[2]),
    col(match[3]),
    Number(match[4]),
  ];
  if (
    endCol < startCol ||
    endRow < startRow ||
    (endCol - startCol + 1) * (endRow - startRow + 1) > 200
  )
    throw new Error("Select at most 200 cells");
  return { startCol, startRow, endCol, endRow };
}
export async function pinSnapshot(
  bytes: string,
  base: string,
  transport: typeof fetch = fetch,
): Promise<string> {
  const body = new FormData();
  body.set(
    "file",
    new Blob([bytes], { type: "application/json" }),
    "workbook.json",
  );
  const response = await transport(
    `${base}/api/v0/add?pin=true&cid-version=1`,
    { method: "POST", body, signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) throw new Error("IPFS upload failed");
  const result = await response.json();
  if (
    typeof result.Hash !== "string" ||
    !/^[a-zA-Z0-9]{10,120}$/.test(result.Hash)
  )
    throw new Error("IPFS returned no CID");
  const retrieved = await transport(
    `${base}/api/v0/cat?arg=${encodeURIComponent(result.Hash)}`,
    { method: "POST", signal: AbortSignal.timeout(30000) },
  );
  if (!retrieved.ok || (await retrieved.text()) !== bytes)
    throw new Error("IPFS retrieval verification failed");
  return result.Hash;
}

export function remapSheetReferences(
  save: string,
  mapping: Map<string, string>,
): string {
  return save
    .split("\n")
    .map((line) => {
      const parts = line.split(":");
      if (parts[0] !== "cell" || parts[2] !== "vtf" || !parts[5]) return line;
      parts[5] = parts[5].replace(
        /(?:"([^"\n]+)"|'([^'\n]+)'|([A-Za-z_][A-Za-z0-9_.-]*))!/g,
        (match, doubleQuoted, singleQuoted, bare) => {
          const old = doubleQuoted ?? singleQuoted ?? bare;
          const replacement = mapping.get(old);
          return replacement ? match.replace(old, replacement) : match;
        },
      );
      return parts.join(":");
    })
    .join("\n");
}
