"use client";

import Link from "next/link";
import { NodeTable } from "@/features/network/components/node-table";
import { MyNodePanel } from "./my-node-panel";
import { MyNodesButton } from "./my-nodes-button";
import { useMyNodes } from "@/features/network/hooks/use-my-nodes";

export function NodesPageClient() {
  const { data, isLoading } = useMyNodes();
  const nodes = data?.nodes ?? [];

  if (isLoading) {
    return <NodeTable />;
  }

  if (nodes.length === 0) {
    return (
      <>
        <div className="flex justify-end mb-4">
          <Link
            href="/network/nodes/join"
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Join the network →
          </Link>
        </div>
        <NodeTable />
      </>
    );
  }

  if (nodes.length === 1) {
    return (
      <>
        <div className="mb-4">
          <MyNodePanel node={nodes[0]} />
          <div className="flex justify-end mt-2">
            <Link
              href="/network/nodes/join"
              className="text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              Add more nodes →
            </Link>
          </div>
        </div>
        <NodeTable />
      </>
    );
  }

  return (
    <>
      <div className="mb-4">
        <MyNodesButton />
      </div>
      <NodeTable />
    </>
  );
}
