import { cn } from "@/lib/utils";

export interface MetricItem {
  label: string;
  value: React.ReactNode;
  /** When true, renders value in the feature's accent color (use text-[color]-300 on parent) */
  accent?: boolean;
  /** Override per-cell accent class. Falls back to feature-level prop. */
  accentClass?: string;
}

interface MetricGridProps {
  metrics: MetricItem[];
  /** Tailwind text class for accented values, e.g. "text-amber-300" */
  accentClass?: string;
  cols?: 2 | 3 | 4;
}

export function MetricGrid({ metrics, accentClass = "text-amber-300", cols = 4 }: MetricGridProps) {
  const colClass = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" }[cols];
  return (
    <div className={cn("grid grid-cols-2 gap-5", colClass)}>
      {metrics.map((m) => (
        <div key={m.label} className="flex flex-col gap-1">
          <p className="text-[11px] text-white/35">{m.label}</p>
          <p className={cn("text-2xl font-semibold tabular-nums", m.accent ? (m.accentClass ?? accentClass) : "text-white/90")}>
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}
