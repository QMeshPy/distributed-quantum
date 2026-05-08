"use client";

import { usePathname } from "next/navigation";
import { NAV_CONFIG } from "@/constants";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { RailItem } from "./rail-item";

export function IconRail() {
  const pathname = usePathname();

  return (
    <nav className="flex w-[68px] flex-col items-center bg-transparent py-3">
      <WorkspaceSwitcher />
      <div className="mt-4 flex flex-col items-center gap-1">
        {NAV_CONFIG.map((item) => {
          const isActive = item.matchPrefixes.some((prefix) =>
            pathname.startsWith(prefix)
          );
          return (
            <RailItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              href={item.href}
              isActive={isActive}
            />
          );
        })}
      </div>
    </nav>
  );
}
