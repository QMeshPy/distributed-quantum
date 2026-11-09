"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
        <Card className="mt-2 bg-white/5">
          <CardContent className="p-3 text-xs text-white/60 whitespace-pre-wrap">
            {thinking}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
