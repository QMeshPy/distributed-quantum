import { createHash } from "node:crypto";

export type RunKind = "pharma" | "finance" | "circuit";
export type SheetSeed = { name: string; save: string; source: boolean };
type Cell = string | number | boolean | null;

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\b")
    .replace(/:/g, "\\c")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

export function nativeSheet(rows: Cell[][]): string {
  if (rows.length > 10000 || rows.some((row) => row.length > 20))
    throw new Error("Sheet exceeds import limit");
  const cells: string[] = ["version:1.5"];
  rows.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === null) return;
      const coord = `${String.fromCharCode(65 + x)}${y + 1}`;
      cells.push(
        typeof value === "number" && Number.isFinite(value)
          ? `cell:${coord}:v:${value}`
          : `cell:${coord}:t:${escapeText(String(value))}`,
      );
    }),
  );
  cells.push(
    `sheet:c:${Math.max(1, ...rows.map((row) => row.length))}:r:${Math.max(1, rows.length)}`,
  );
  return cells.join("\n") + "\n";
}

export function workbookKey(
  owner: string,
  kind: RunKind,
  runId: string,
  version: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify([owner, kind, runId, version]))
    .digest("hex");
}

/** Exact JSON remains the authority; long values point back to that immutable source. */
export function mapRun(
  kind: RunKind,
  run: Record<string, unknown>,
): SheetSeed[] {
  if (String(run.status).toLowerCase() !== "completed" || !run.result)
    throw new Error("Run must be completed");
  const rows: Cell[][] = [
    ["JSON path (units retained in field names)", "Value"],
  ];
  function visit(value: unknown, path: string, depth: number) {
    if (rows.length >= 9500 || depth > 12)
      throw new Error("Result exceeds spreadsheet import limit");
    if (value && typeof value === "object") {
      if (Array.isArray(value) && value.length > 500) {
        rows.push([
          path,
          `See original JSON: ${path} (${value.length} values)`,
        ]);
      } else
        for (const [key, child] of Object.entries(value))
          visit(
            child,
            `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
            depth + 1,
          );
    } else {
      const cell =
        typeof value === "string" && value.length > 2000
          ? `See original JSON: ${path}`
          : value;
      rows.push([path, (cell ?? null) as Cell]);
    }
  }
  visit(run, "", 0);
  const sheets = [
    { name: `${kind} source`, save: nativeSheet(rows), source: true },
  ];
  if (kind === "circuit") {
    const result = run.result as Record<string, unknown>;
    const quantum = (result.quantum_result ?? result) as Record<
      string,
      unknown
    >;
    const counts = quantum.counts as Record<string, number> | undefined;
    if (counts) {
      const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
      sheets.push({
        name: "Measurements",
        source: true,
        save: nativeSheet([
          ["Bitstring", "Count", "Probability"],
          ...Object.entries(counts).map(([bits, n]): Cell[] => [
            bits,
            n,
            total ? n / total : 0,
          ]),
        ]),
      });
    }
  }
  return sheets;
}
