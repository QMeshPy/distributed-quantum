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

      {/* ── Page header ── */}
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description="System pulse, current network and job status."
      >
        <DashboardStatusBar />
      </PageHeader>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col gap-6 p-6">

        {/* KPI strip */}
        <DashboardKpiCards />

        {/* Quick actions */}
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium text-faint">Quick Actions</p>
          <DashboardQuickActions />
        </section>

        {/* Activity */}
        <Suspense fallback={
          <div className="h-40 animate-pulse rounded-2xl ring-1 ring-border"
            style={{ background: "color-mix(in oklab, var(--foreground) 3%, transparent)" }} />
        }>
          <DashboardActivityFeed />
        </Suspense>

      </div>
    </div>
  );
}
