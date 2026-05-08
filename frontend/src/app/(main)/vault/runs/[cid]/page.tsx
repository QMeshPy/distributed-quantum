import dynamic from "next/dynamic";

const VaultRunDetailClient = dynamic(
  () => import("@/features/ipfs/components/vault-run-detail-client").then((m) => m.VaultRunDetailClient),
  { ssr: false },
);

export default async function VaultRunDetailPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { cid } = await params;
  return <VaultRunDetailClient cid={cid} />;
}
