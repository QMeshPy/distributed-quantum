"use client";

import { useState } from "react";
import { Gauge } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { FidelityChart } from "@/features/network/components/fidelity-chart";
import { useNetworkNodes } from "@/features/network/hooks/use-network-nodes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function FidelityPage() {
  const { data: nodes } = useNetworkNodes();
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const activeNodeId = selectedNodeId || nodes?.[0]?.peerId || "";

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        icon={Gauge}
        label="Network"
        title="Fidelity" glow="rose"
        description="Per-node fidelity metrics and trends."
      />
      <div className="flex-1 overflow-y-auto p-6">
        {nodes && nodes.length > 0 && (
          <div className="mb-6 max-w-sm">
            <Select value={activeNodeId} onValueChange={setSelectedNodeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a node" />
              </SelectTrigger>
              <SelectContent>
                {nodes.map((node) => (
                  <SelectItem key={node.peerId} value={node.peerId}>
                    {node.peerId.slice(0, 28)}…
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {activeNodeId ? (
          <FidelityChart nodeId={activeNodeId} />
        ) : (
          <p className="text-sm text-muted-foreground">No nodes available.</p>
        )}
      </div>
    </div>
  );
}
