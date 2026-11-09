"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
    <div
      className="relative flex h-screen overflow-hidden"
      style={{ background: "#0d0f14" }}
    >
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{
            background: "radial-gradient(circle, #6366f1 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute top-1/2 right-0 h-80 w-80 rounded-full opacity-15 blur-3xl"
          style={{
            background: "radial-gradient(circle, #22d3ee 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full opacity-10 blur-3xl"
          style={{
            background: "radial-gradient(circle, #a78bfa 0%, transparent 70%)",
          }}
        />
        <div className="absolute inset-0 dot-grid opacity-40" />
      </div>

      <div className="hidden md:flex">
        <IconRail />
      </div>

      <div
        className="relative min-w-0 md:ml-1.5 flex flex-1 overflow-hidden ring-1 ring-white/6"
        style={{
          background: "rgba(255,255,255,0.025)",
          backdropFilter: "blur(2px)",
        }}
      >
        <div className="hidden md:flex">
          <SidebarPanel activeRailItem={activeRailItem} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="md:hidden">
            <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" className="m-2">
                  Open navigation
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(340px,90vw)] gap-0">
                <SheetTitle className="p-4">Navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  Choose a workspace, tool, or recent analysis.
                </SheetDescription>
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
              </SheetContent>
            </Sheet>
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
