"use client";

import { Panel, PanelContent } from "@/shared/components/panel/panel";
import { Button } from "@/components/arc/button/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface ThinkingBlockProps {
  thinking: string;
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          <ChevronDown className={cn(
            "h-3 w-3 mr-1 transition-transform",
            isOpen && "rotate-180"
          )} />
          {isOpen ? "Hide" : "Show"} reasoning
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Panel className="mt-2 bg-surface-muted">
          <PanelContent className="p-3 text-xs text-subtle whitespace-pre-wrap">
            {thinking}
          </PanelContent>
        </Panel>
      </CollapsibleContent>
    </Collapsible>
  );
}
