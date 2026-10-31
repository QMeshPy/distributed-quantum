"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const VaultCidClient = dynamic(
  () =>
    import("@/features/ipfs/components/vault-cid-client").then(
      (m) => m.VaultCidClient,
    ),
  { ssr: false },
);

export default function VaultCidPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { cid } = use(params);
  return <VaultCidClient cid={decodeURIComponent(cid)} />;
}
