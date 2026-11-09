"use client";

export function WorkspaceSwitcher() {
  return (
    <button
      type="button"
      className="relative flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden transition-all duration-200 hover:scale-105"
      style={{ background: "var(--surface-muted)" }}
      aria-label="Switch workspace"
    >
      <span className="relative z-10 text-xs font-medium text-foreground">QG</span>
    </button>
  );
}
