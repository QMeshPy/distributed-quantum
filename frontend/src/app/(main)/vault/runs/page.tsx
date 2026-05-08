import dynamic from "next/dynamic";

const VaultRunsClient = dynamic(
  () => import("@/features/ipfs/components/vault-runs-client").then((m) => m.VaultRunsClient),
  { ssr: false },
);

export default function VaultRunsPage() {
  return <VaultRunsClient />;
}
