"use client";

import type { NavToolConfig } from "@/constants";
import { LabToolGroup } from "./lab-tool-group";

interface DynamicSidebarProps {
  tools: NavToolConfig[];
}

export function DynamicSidebar({ tools }: DynamicSidebarProps) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      {tools.map((tool, index) => (
        <LabToolGroup
          key={tool.tool}
          tool={tool}
          defaultOpen={index === 0}
        />
      ))}
    </div>
  );
}
