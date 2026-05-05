import { Suspense } from "react";
import { DashboardKpiCards } from "@/features/dashboard/components/dashboard-kpi-cards";
import { DashboardQuickActions } from "@/features/dashboard/components/dashboard-quick-actions";
import { DashboardActivityFeed } from "@/features/dashboard/components/dashboard-activity-feed";
import { DashboardStatusBar } from "@/features/dashboard/components/dashboard-status-bar";

export default function DashboardPage() {
  return (
    <div className="relative flex flex-col gap-6 p-6">

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

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col gap-6">

        {/* Page header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
            <p className="mt-0.5 text-sm text-white/40">System pulse — current network and job status.</p>
          </div>
          <DashboardStatusBar />
        </div>

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
