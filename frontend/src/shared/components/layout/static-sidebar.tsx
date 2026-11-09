"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroupConfig } from "@/constants";
import { cn } from "@/lib/utils";
import { NavUser } from "./nav-user";

interface StaticSidebarProps {
  groups: NavGroupConfig[];
}

export function StaticSidebar({ groups }: StaticSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {groups.map((group) => (
        <div key={group.heading} className="flex w-full min-w-0 flex-col p-2">
          <div className="px-3 py-1.5 text-xs text-faint">
            {group.heading}
          </div>
          <div>
            <ul className="flex flex-col">
              {group.links.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex h-8 items-center rounded-lg px-3 text-sm transition-all duration-150",
                        isActive
                          ? "bg-accent-subtle font-medium text-foreground"
                          : "text-subtle hover:bg-surface-muted hover:text-foreground"
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ))}
      <div className="mt-auto p-3" style={{ borderTop: "1px solid color-mix(in oklab, var(--foreground) 6%, transparent)" }}>
        <NavUser />
      </div>
    </>
  );
}
