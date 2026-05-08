import dynamic from "next/dynamic";

const CircuitLibraryClient = dynamic(
  () => import("@/features/ipfs/components/circuit-library-client").then((m) => m.CircuitLibraryClient),
  { ssr: false },
);

export default function VaultCircuitsPage() {
  return <CircuitLibraryClient />;
}
