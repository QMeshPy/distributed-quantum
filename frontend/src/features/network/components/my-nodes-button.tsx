"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useMyNodes } from "../hooks/use-my-nodes";
import { MyNodePanel } from "./my-node-panel";

export function MyNodesButton() {
  const { data, isLoading } = useMyNodes();
  const nodes = data?.nodes ?? [];

  if (isLoading || nodes.length === 0) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-white/10 text-white/70 hover:text-white/90">
          My Nodes · {nodes.length}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-[#0d0d0f] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white/90">My Registered Nodes</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {nodes.map((node) => (
            <MyNodePanel key={node.peerId} node={node} />
          ))}
        </div>
        <div className="border-t border-white/8 pt-3">
          <Link
            href="/network/nodes/join"
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Add another node →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
