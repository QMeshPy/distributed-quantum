import Link from "next/link";
import { FlaskConical, TrendingUp, BarChart3, Globe, ArrowUpRight } from "lucide-react";
import { ROUTES } from "@/constants";
import type { LucideIcon } from "lucide-react";

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  iconClass: string;
  hoverGradient: string;
};

const ACTIONS: readonly QuickAction[] = [
  {
    label: "New Run",
    href: ROUTES.RUNS_NEW,
    icon: FlaskConical,
    description: "Execute a quantum circuit",
    iconClass: "text-accent",
    hoverGradient: "",
  },
  {
    label: "Price Options",
    href: ROUTES.OPTIONS,
    icon: TrendingUp,
    description: "Quantum Monte Carlo pricing",
    iconClass: "text-warning",
    hoverGradient: "",
  },
  {
    label: "Risk Analysis",
    href: ROUTES.RISK,
    icon: BarChart3,
    description: "VaR / CVaR on portfolio",
    iconClass: "text-accent",
    hoverGradient: "",
  },
  {
    label: "Network",
    href: ROUTES.NETWORK_MESH,
    icon: Globe,
    description: "View network topology",
    iconClass: "text-info",
    hoverGradient: "",
  },
] as const;

export function DashboardQuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {ACTIONS.map((action) => (
        <Link key={action.href} href={action.href} className="group">
          <div
            className="relative overflow-hidden rounded-2xl p-4 ring-1 ring-border transition-all duration-200 hover:ring-border-strong hover:scale-[1.02]"
            style={{ background: "color-mix(in oklab, var(--foreground) 4%, transparent)" }}
          >
            <div
              className={`absolute inset-0 ${action.hoverGradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
            />

            <div className="relative z-10">
              <div className="mb-3 flex items-start justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted transition-transform duration-200 group-hover:scale-110 ${action.iconClass}`}>
                  <action.icon size={18} />
                </div>
                <ArrowUpRight className="h-4 w-4 text-faint transition-all duration-200 group-hover:text-subtle group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <p className="text-sm font-medium text-foreground transition-colors group-hover:text-foreground">{action.label}</p>
              <p className="mt-0.5 text-xs text-faint">{action.description}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
