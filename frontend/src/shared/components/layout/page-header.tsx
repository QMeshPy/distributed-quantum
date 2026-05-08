import type { LucideIcon } from "lucide-react";

type PageHeaderProps = {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  glow?: "indigo" | "cyan" | "emerald" | "amber" | "rose" | "violet" | "blue" | "orange";
  children?: React.ReactNode;
};


const GLOW_PRESETS: Record<string, { left: string; right: string }> = {
  indigo: {
    left: "conic-gradient(from 180deg, var(--glow-indigo-1), var(--glow-indigo-2), var(--glow-indigo-3), var(--glow-indigo-1))",
    right: "radial-gradient(circle, var(--glow-indigo-1) 0%, transparent 70%)",
  },
  cyan: {
    left: "conic-gradient(from 200deg, var(--glow-cyan-1), var(--glow-cyan-2), var(--glow-cyan-3), var(--glow-cyan-1))",
    right: "radial-gradient(circle, var(--glow-cyan-2) 0%, transparent 70%)",
  },
  emerald: {
    left: "conic-gradient(from 160deg, var(--glow-emerald-1), var(--glow-emerald-2), var(--glow-emerald-3), var(--glow-emerald-1))",
    right: "radial-gradient(circle, var(--glow-emerald-2) 0%, transparent 70%)",
  },
  amber: {
    left: "conic-gradient(from 190deg, var(--glow-amber-1), var(--glow-amber-2), var(--glow-amber-3), var(--glow-amber-1))",
    right: "radial-gradient(circle, var(--glow-amber-2) 0%, transparent 70%)",
  },
  rose: {
    left: "conic-gradient(from 170deg, var(--glow-rose-1), var(--glow-rose-2), var(--glow-rose-3), var(--glow-rose-1))",
    right: "radial-gradient(circle, var(--glow-rose-2) 0%, transparent 70%)",
  },
  violet: {
    left: "conic-gradient(from 180deg, var(--glow-violet-1), var(--glow-violet-2), var(--glow-violet-3), var(--glow-violet-1))",
    right: "radial-gradient(circle, var(--glow-violet-2) 0%, transparent 70%)",
  },
  blue: {
    left: "conic-gradient(from 185deg, var(--glow-blue-1), var(--glow-blue-2), var(--glow-blue-3), var(--glow-blue-1))",
    right: "radial-gradient(circle, var(--glow-blue-2) 0%, transparent 70%)",
  },
  orange: {
    left: "conic-gradient(from 175deg, var(--glow-orange-1), var(--glow-orange-2), var(--glow-orange-3), var(--glow-orange-1))",
    right: "radial-gradient(circle, var(--glow-orange-2) 0%, transparent 70%)",
  },
};
export function PageHeader({
  icon: Icon,
  label,
  title,
  description,
  glow = "indigo",
  children,
}: PageHeaderProps) {
  const preset = GLOW_PRESETS[glow] ?? GLOW_PRESETS.indigo!;

  return (
    <header className="relative shrink-0 border-b border-white/6 px-6 pb-6 pt-6">
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -left-20 -top-20 h-[300px] w-[400px] rounded-full opacity-[0.07] blur-[100px]"
          style={{ background: preset.left }}
        />
        <div
          className="absolute -right-10 -top-10 h-[200px] w-[300px] rounded-full opacity-[0.05] blur-[80px]"
          style={{ background: preset.right }}
        />
      </div>
      <div className="relative flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-white/30">
            <Icon size={14} />
            <span className="text-[11px] font-medium uppercase tracking-wider">
              {label}
            </span>
          </div>
          <h1 className="mt-2 text-[28px] font-light tracking-tight text-white/90">
            {title}
          </h1>
          <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-white/35">
            {description}
          </p>
        </div>
        {children}
      </div>
    </header>
  );
}
