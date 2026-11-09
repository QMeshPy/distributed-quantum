"use client";

import type { RailItem } from "@/constants";
import { useTrialEnabled } from "@/features/auth";
import { StaticSidebar } from "./static-sidebar";
import { DynamicSidebar } from "./dynamic-sidebar";
import { NavUser } from "./nav-user";

interface SidebarPanelProps {
  activeRailItem: RailItem | null;
}

export function SidebarPanel({ activeRailItem }: SidebarPanelProps) {
  const trialEnabled = useTrialEnabled();

  if (!activeRailItem || !activeRailItem.hasSidebar || !activeRailItem.sidebar) {
    return null;
  }

  const { sidebar } = activeRailItem;

  return (
    <div className={`flex-none${!trialEnabled ?" pointer-events-none blur-sm select-none" : ""}`}>
      <aside className="flex w-[220px] flex-col border-r border-border-subtle">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {sidebar.type === "static" ? (
            <StaticSidebar groups={sidebar.groups} />
          ) : (
            <DynamicSidebar tools={sidebar.tools} />
          )}
        </div>
        {sidebar.type === "dynamic" && (
          <div className="shrink-0 border-t border-border-subtle p-3">
            <NavUser />
          </div>
        )}
      </aside>
    </div>
  );
}
