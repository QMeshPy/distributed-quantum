"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function Scalar({ value }: { value: unknown }) {
  const str = String(value ?? "—");
  const isLong = str.length > 60;
  const [expanded, setExpanded] = useState(false);
  if (!isLong) return <span className="text-sm tabular-nums text-white/70">{str}</span>;
  return (
    <span>
      <span className="text-sm tabular-nums text-white/70 break-all">
        {expanded ? str : str.slice(0, 60) + "…"}
      </span>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="ml-1.5 text-[10px] text-white/30 hover:text-white/60 underline transition-colors"
      >
        {expanded ? "less" : "more"}
      </button>
    </span>
  );
}

function ObjectBlock({ data, depth = 0 }: { data: Record<string, unknown> | unknown[]; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const entries: [string, unknown][] = Array.isArray(data)
    ? data.map((v, i) => [String(i), v])
    : Object.entries(data);

  if (entries.length === 0) return <span className="text-[11px] text-white/30">empty</span>;

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/60 transition-colors mb-1"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        {Array.isArray(data) ? `Array[${entries.length}]` : `Object{${entries.length}}`}
      </button>
      {open && (
        <div className="ml-4 flex flex-col gap-1 border-l border-white/6 pl-3">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-start gap-2">
              <span className="shrink-0 text-[11px] text-white/30 mt-0.5">
                {Array.isArray(data) ? `[${k}]` : k.replace(/_/g, " ")}
              </span>
              <div className="flex-1 text-right">
                {isPlainObject(v) || Array.isArray(v) ? (
                  <ObjectBlock data={v as Record<string, unknown>} depth={depth + 1} />
                ) : (
                  <Scalar value={v} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Intelligently renders an opaque backend result object.
 *
 * - Scalar string/number/boolean values → shown inline
 * - Nested objects/arrays → collapsible tree
 *
 * Scalars and objects are separated into two sections for clarity.
 */
export function ResultValue({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  const scalars = entries.filter(([, v]) => !isPlainObject(v) && !Array.isArray(v));
  const nested = entries.filter(([, v]) => isPlainObject(v) || Array.isArray(v));

  return (
    <div className="flex flex-col gap-0">
      {scalars.map(([k, v]) => (
        <div
          key={k}
          className="flex items-start justify-between gap-4 border-b border-white/4 py-2.5 last:border-0 last:pb-0"
        >
          <span className="shrink-0 text-[11px] capitalize text-white/35">{k.replace(/_/g, " ")}</span>
          <Scalar value={v} />
        </div>
      ))}
      {nested.map(([k, v]) => (
        <div key={k} className="border-b border-white/4 py-2.5 last:border-0 last:pb-0">
          <p className="text-[11px] capitalize text-white/35 mb-1">{k.replace(/_/g, " ")}</p>
          <ObjectBlock data={v as Record<string, unknown>} depth={0} />
        </div>
      ))}
    </div>
  );
}
