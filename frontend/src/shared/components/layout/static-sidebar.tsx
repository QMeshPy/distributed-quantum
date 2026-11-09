"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavGroupConfig } from "@/constants";
import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";

interface StaticSidebarProps {
  groups: NavGroupConfig[];
}

export function StaticSidebar({ groups }: StaticSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.heading}>
          <SidebarGroupLabel className="text-white/30 text-[10px] uppercase tracking-widest">
            {group.heading}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.links.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <SidebarMenuItem key={link.href}>
                    <Link
                      href={link.href}
                      className={cn(
                        "flex h-8 items-center rounded-lg px-3 text-sm transition-all duration-150",
                        isActive
                          ? "bg-indigo-500/15 font-medium text-indigo-300 ring-1 ring-indigo-500/25"
                          : "text-white/40 hover:bg-white/6 hover:text-white/80"
                      )}
                    >
                      {link.label}
                    </Link>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
      <div className="mt-auto p-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <NavUser />
      </div>
    </>
  );
}
