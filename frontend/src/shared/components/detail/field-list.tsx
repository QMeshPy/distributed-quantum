import { cn } from "@/lib/utils";

export interface FieldItem {
  key: string;
  label: string;
  value: React.ReactNode;
}

interface FieldListProps {
  fields: FieldItem[];
  className?: string;
}

export function FieldList({ fields, className }: FieldListProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {fields.map(({ key, label, value }) => (
        <div
          key={key}
          className="flex items-start justify-between gap-4 border-b border-white/4 py-2.5 last:border-0 last:pb-0"
        >
          <span className="shrink-0 text-[11px] capitalize text-white/35">{label}</span>
          <span className="text-right text-sm tabular-nums text-white/70 break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}
