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
    iconClass: "text-indigo-400",
    hoverGradient: "from-indigo-500/20 via-indigo-600/8 to-transparent",
  },
  {
    label: "Price Options",
    href: ROUTES.OPTIONS,
    icon: TrendingUp,
    description: "Quantum Monte Carlo pricing",
    iconClass: "text-orange-400",
    hoverGradient: "from-orange-500/20 via-orange-600/8 to-transparent",
  },
  {
    label: "Risk Analysis",
    href: ROUTES.RISK,
    icon: BarChart3,
    description: "VaR / CVaR on portfolio",
    iconClass: "text-violet-400",
    hoverGradient: "from-violet-500/20 via-violet-600/8 to-transparent",
  },
  {
    label: "Network",
    href: ROUTES.NETWORK_MESH,
    icon: Globe,
    description: "View network topology",
    iconClass: "text-cyan-400",
    hoverGradient: "from-cyan-500/20 via-cyan-600/8 to-transparent",
  },
] as const;

export function DashboardQuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {ACTIONS.map((action) => (
        <Link key={action.href} href={action.href} className="group">
          <div
            className="relative overflow-hidden rounded-2xl p-4 ring-1 ring-white/8 transition-all duration-200 hover:ring-white/20 hover:scale-[1.02]"
            style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
          >
            {/* Hover gradient overlay — matches icon color */}
            <div
              className={`absolute inset-0 bg-gradient-to-br ${action.hoverGradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
            />

            <div className="relative z-10">
              <div className="mb-3 flex items-start justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/6 transition-transform duration-200 group-hover:scale-110 ${action.iconClass}`}>
                  <action.icon size={18} />
                </div>
                <ArrowUpRight className="h-4 w-4 text-white/20 transition-all duration-200 group-hover:text-white/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
              <p className="text-sm font-semibold text-white/80 transition-colors group-hover:text-white">{action.label}</p>
              <p className="mt-0.5 text-xs text-white/30">{action.description}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
