"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { BREADCRUMB_LABELS, RAIL_LABEL_FOR_PREFIX } from "@/constants";

function getRailLabel(segments: string[]): string | undefined {
  if (segments.length === 0) return undefined;
  for (let len = segments.length; len > 0; len--) {
    const prefix = "/" + segments.slice(0, len).join("/");
    const label = RAIL_LABEL_FOR_PREFIX[prefix];
    if (label) return label;
  }
  return undefined;
}

function formatSegment(segment: string): { label: string; isMono: boolean } {
  const known = BREADCRUMB_LABELS[segment];
  if (known) return { label: known, isMono: false };

  return { label: segment, isMono: true };
}

export function AutoBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const railLabel = getRailLabel(segments);
  type CrumbEntry = { label: string; href: string; isMono: boolean };
  const crumbs: CrumbEntry[] = [];

  if (railLabel) {
    crumbs.push({ label: railLabel, href: "/" + segments[0], isMono: false });
  }
  for (let i = 0; i < segments.length; i++) {
    const { label, isMono } = formatSegment(segments[i]);
    const href = "/" + segments.slice(0, i + 1).join("/");
    if (crumbs.length > 0 && crumbs[0].href === href) continue;
    crumbs.push({ label, href, isMono });
  }

  return (
    <nav className="flex items-center gap-1.5">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <React.Fragment key={crumb.href}>
            {index > 0 && (
              <ChevronRight className="h-3 w-3 text-white/20" />
            )}
            {isLast ? (
              <span className={`text-sm font-medium text-white/70 ${crumb.isMono ? "font-mono text-xs" : ""}`}>
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className={`text-sm text-white/30 transition-colors hover:text-white/60 ${crumb.isMono ? "font-mono text-xs" : ""}`}
              >
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
