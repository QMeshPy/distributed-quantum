"use client";

import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { Drawer, DrawerTrigger, DrawerContent } from "@/components/arc/drawer/drawer";
import { usePathname } from "next/navigation";
import { NAV_CONFIG } from "@/constants";
import { IconRail } from "./icon-rail";
import { SidebarPanel } from "./sidebar-panel";
import { SiteHeader } from "./site-header";
import { TrialGate } from "./trial-gate";

interface DashboardShellProps {
  children: React.ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname();
  const [navigationOpen, setNavigationOpen] = useState(false);

  const activeRailItem =
    NAV_CONFIG.find((item) =>
      item.matchPrefixes.some((prefix) => pathname.startsWith(prefix)),
    ) ?? null;

  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div className="hidden md:flex">
        <IconRail />
      </div>

      <div className="relative min-w-0 md:ml-1.5 flex flex-1 overflow-hidden bg-surface ring-1 ring-border">
        <div className="hidden md:flex">
          <SidebarPanel activeRailItem={activeRailItem} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="md:hidden">
            <Drawer open={navigationOpen} onOpenChange={setNavigationOpen}>
              <DrawerTrigger asChild>
                <Button variant="ghost" className="m-2">
                  Open navigation
                </Button>
              </DrawerTrigger>
              <DrawerContent title="Navigation" description="Choose a workspace, tool, or recent analysis." side="left">
<div
                  className="flex min-h-0 flex-1"
                  onClick={(event) => {
                    if (
                      event.target instanceof Element &&
                      event.target.closest("a[href]")
                    ) {
                      setNavigationOpen(false);
                    }
                  }}
                >
                  <IconRail />
                  <SidebarPanel activeRailItem={activeRailItem} />
                </div>
              </DrawerContent>
            </Drawer>
          </div>
          <SiteHeader />
          <TrialGate>
            <main className="flex-1 flex flex-col overflow-y-auto">
              {children}
            </main>
          </TrialGate>
        </div>
      </div>
    </div>
  );
}
