"use client";

import { Panel, PanelContent, PanelHeader, PanelTitle, PanelFooter } from "@/shared/components/panel/panel";
import { Button } from "@/components/arc/button/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/collapsible";
import { AlertCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useApproveAction } from "../hooks/use-approve-action";
import type { ApprovalData } from "../types";

interface ApprovalCardProps {
  approval: ApprovalData;
  sessionId: string;
}

export function ApprovalCard({ approval, sessionId }: ApprovalCardProps) {
  const approveAction = useApproveAction(sessionId);
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <Panel className="border-warning/30 bg-warning/5">
      <PanelHeader>
        <PanelTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-warning" />
          Approval Required
        </PanelTitle>
      </PanelHeader>

      <PanelContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-subtle text-xs mb-1">Duration</div>
            <div className="font-medium">{approval.time_minutes} minutes</div>
          </div>
          <div>
            <div className="text-subtle text-xs mb-1">Estimated Cost</div>
            <div className="font-medium">${approval.cost.toFixed(2)}</div>
          </div>
        </div>

        {approval.description && (
          <p className="text-sm text-subtle">{approval.description}</p>
        )}

        {/* Technical Details (collapsible) */}
        {approval.technical && (
          <Collapsible open={showTechnical} onOpenChange={setShowTechnical}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full">
                {showTechnical ? "Hide" : "Show"} Technical Details
                <ChevronDown className={cn(
                  "ml-2 h-4 w-4 transition-transform",
                  showTechnical && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              <div className="space-y-2 text-xs text-subtle">
                {approval.technical.nodes && (
                  <div>Nodes: {approval.technical.nodes.join(", ")}</div>
                )}
                {approval.technical.qubits && (
                  <div>Qubits: {approval.technical.qubits}</div>
                )}
                {approval.technical.circuit_depth && (
                  <div>Circuit depth: {approval.technical.circuit_depth}</div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </PanelContent>

      <PanelFooter className="gap-2">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => approveAction.mutate(true)}
          disabled={approveAction.isPending}
        >
          Approve & Run
        </Button>
        <Button
          variant="secondary"
          onClick={() => approveAction.mutate(false)}
          disabled={approveAction.isPending}
        >
          Reject
        </Button>
      </PanelFooter>
    </Panel>
  );
}
