import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { DashboardKpiCards } from "@/features/dashboard/components/dashboard-kpi-cards";
import { DashboardQuickActions } from "@/features/dashboard/components/dashboard-quick-actions";
import { DashboardActivityFeed } from "@/features/dashboard/components/dashboard-activity-feed";
import { DashboardStatusBar } from "@/features/dashboard/components/dashboard-status-bar";
import { PageHeader } from "@/shared/components/layout/page-header";

export default function DashboardPage() {
  return (
    <div className="relative flex flex-col">

      {/* ── Ambient glows — one per column, anchored to card positions ── */}
      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "420px" }}>
        {/* Col 1 — left edge — indigo */}
        <div
          className="absolute h-[320px] w-[280px] rounded-full opacity-25 blur-[90px]"
          style={{
            left: "0%",
            top: "-60px",
            background: "radial-gradient(circle, rgba(99,102,241,0.7) 0%, transparent 70%)",
          }}
        />
        {/* Col 2 — center-left — cyan */}
        <div
          className="absolute h-[280px] w-[260px] rounded-full opacity-20 blur-[80px]"
          style={{
            left: "25%",
            transform: "translateX(-50%)",
            top: "-40px",
            background: "radial-gradient(circle, rgba(34,211,238,0.65) 0%, transparent 70%)",
          }}
        />
        {/* Col 3 — center-right — violet */}
        <div
          className="absolute h-[280px] w-[260px] rounded-full opacity-20 blur-[80px]"
          style={{
            left: "65%",
            transform: "translateX(-50%)",
            top: "-40px",
            background: "radial-gradient(circle, rgba(167,139,250,0.65) 0%, transparent 70%)",
          }}
        />
        {/* Col 4 — right edge — emerald */}
        <div
          className="absolute h-[320px] w-[280px] rounded-full opacity-25 blur-[90px]"
          style={{
            right: "0%",
            top: "-60px",
            background: "radial-gradient(circle, rgba(52,211,153,0.7) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ── Page header ── */}
      <PageHeader
        icon={LayoutDashboard}
        label="Overview"
        title="Dashboard"
        description="System pulse — current network and job status."
        glow="indigo"
      >
        <DashboardStatusBar />
      </PageHeader>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col gap-6 p-6">

        {/* KPI strip */}
        <DashboardKpiCards />

        {/* Quick actions */}
        <section className="flex flex-col gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">Quick Actions</p>
          <DashboardQuickActions />
        </section>

        {/* Activity */}
        <Suspense fallback={
          <div className="h-40 animate-pulse rounded-2xl ring-1 ring-white/8"
            style={{ background: "rgba(255,255,255,0.03)" }} />
        }>
          <DashboardActivityFeed />
        </Suspense>

      </div>
    </div>
  );
}
