"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const VaultRunDetailClient = dynamic(
  () => import("@/features/ipfs/components/vault-run-detail-client").then((m) => m.VaultRunDetailClient),
  { ssr: false },
);

export default function VaultRunDetailPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { cid } = use(params);
  return <VaultRunDetailClient cid={cid} />;
}
