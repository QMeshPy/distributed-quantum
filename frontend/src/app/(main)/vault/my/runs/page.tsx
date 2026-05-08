import dynamic from "next/dynamic";

const MyVaultClient = dynamic(
  () => import("@/features/ipfs/components/my-vault-client").then((m) => m.MyVaultClient),
  { ssr: false },
);

export default function MyRunsPage() {
  return <MyVaultClient type="run" />;
}
