"use client";

import Link from "next/link";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { useMyNodes } from "../hooks/use-my-nodes";
import { MyNodePanel } from "./my-node-panel";

export function MyNodesButton() {
  const { data, isLoading } = useMyNodes();
  const nodes = data?.nodes ?? [];

  if (isLoading || nodes.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="border-border text-foreground hover:text-foreground">
          My Nodes · {nodes.length}
        </Button>
      </DialogTrigger>
      <DialogContent title="My Registered Nodes">
        
        <div className="flex flex-col gap-3 py-2">
          {nodes.map((node) => (
            <MyNodePanel key={node.peerId} node={node} />
          ))}
        </div>
        <div className="border-t border-border pt-3">
          <Link
            href="/network/nodes/join"
            className="text-xs text-subtle hover:text-foreground transition-colors"
          >
            Add another node →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
