"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const CircuitDetailClient = dynamic(
  () => import("@/features/ipfs/components/circuit-detail-client").then((m) => m.CircuitDetailClient),
  { ssr: false },
);

export default function CircuitDetailPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { cid } = use(params);
  return <CircuitDetailClient cid={cid} />;
}
