"use client";

export function WorkspaceSwitcher() {
  return (
    <button
      type="button"
      className="relative flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden transition-all duration-200 hover:scale-105"
      style={{ background: "linear-gradient(135deg, #6366f1 0%, #22d3ee 100%)" }}
      aria-label="Switch workspace"
    >
      <span className="relative z-10 text-xs font-bold text-white tracking-tight">QG</span>
    </button>
  );
}
