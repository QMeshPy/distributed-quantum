import dynamic from "next/dynamic";

const CircuitDetailClient = dynamic(
  () => import("@/features/ipfs/components/circuit-detail-client").then((m) => m.CircuitDetailClient),
  { ssr: false },
);

export default async function CircuitDetailPage({
  params,
}: {
  params: Promise<{ cid: string }>;
}) {
  const { cid } = await params;
  return <CircuitDetailClient cid={cid} />;
}
