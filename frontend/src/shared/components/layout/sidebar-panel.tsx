"use client";

import type { RailItem } from "@/constants";
import { SidebarContent, SidebarProvider } from "@/components/ui/sidebar";
import { StaticSidebar } from "./static-sidebar";
import { DynamicSidebar } from "./dynamic-sidebar";
import { NavUser } from "./nav-user";

interface SidebarPanelProps {
  activeRailItem: RailItem | null;
}

export function SidebarPanel({ activeRailItem }: SidebarPanelProps) {
  if (!activeRailItem || !activeRailItem.hasSidebar || !activeRailItem.sidebar) {
    return null;
  }

  const { sidebar } = activeRailItem;

  return (
    <SidebarProvider defaultOpen className="!w-auto !min-h-0 flex-none">
      <aside className="flex w-[220px] flex-col border-r border-hairline">
        <SidebarContent className="flex-1">
          {sidebar.type === "static" ? (
            <StaticSidebar groups={sidebar.groups} />
          ) : (
            <DynamicSidebar tools={sidebar.tools} />
          )}
        </SidebarContent>
        {sidebar.type === "dynamic" && (
          <div className="shrink-0 border-t border-hairline p-3">
            <NavUser />
          </div>
        )}
      </aside>
    </SidebarProvider>
  );
}
