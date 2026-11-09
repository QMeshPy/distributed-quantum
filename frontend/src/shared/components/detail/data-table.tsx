import { cn } from "@/lib/utils";

export interface DataTableColumn<T = Record<string, unknown>> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** When true, renders in feature accent color */
  accent?: boolean;
  accentClass?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T = Record<string, unknown>> {
  rows: T[];
  columns: DataTableColumn<T>[];
  accentClass?: string;
  getRowKey?: (row: T, i: number) => string;
}

export function DataTable<T = Record<string, unknown>>({
  rows,
  columns,
  accentClass = "text-amber-300",
  getRowKey,
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/6">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "pb-2 text-[11px] font-medium",
                  col.align === "right" ? "text-right" : "text-left",
                  col.accent ? (col.accentClass ?? accentClass).replace("text-", "text-") + "/60" : "text-white/35",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={getRowKey ? getRowKey(row, i) : i} className="border-b border-white/4 last:border-0">
              {columns.map((col) => {
                const rawVal = (row as Record<string, unknown>)[col.key];
                const cell = col.render ? col.render(row) : String(rawVal ?? "—");
                return (
                  <td
                    key={col.key}
                    className={cn(
                      "py-2.5 tabular-nums",
                      col.align === "right" ? "text-right" : "",
                      col.accent ? (col.accentClass ?? accentClass) : "text-white/50",
                    )}
                  >
                    {cell}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
