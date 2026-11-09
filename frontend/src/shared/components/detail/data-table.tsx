import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";

export interface DataTableColumn<T = Record<string, unknown>> {
  key: string;
  header: string;
  align?: "left" | "right";
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T = Record<string, unknown>> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey?: (row: T, i: number) => string;
}

/** Thin adapter so detail screens keep their column definitions while Arc's table does the rendering. */
export function DataTable<T = Record<string, unknown>>({ rows, columns, getRowKey }: DataTableProps<T>) {
  const indexed = rows.map((row, i) => ({ ...(row as Record<string, unknown>), __row: row, __i: i }));
  return (
    <SortableDataTable
      caption="Details"
      rows={indexed}
      rowKey={(r) => (getRowKey ? getRowKey(r.__row as T, r.__i) : String(r.__i))}
      columns={columns.map((col) => ({
        key: col.key,
        label: col.header,
        numeric: col.align === "right",
        render: (value, r) => (col.render ? col.render(r.__row as T) : String(value ?? "-")),
      }))}
    />
  );
}
