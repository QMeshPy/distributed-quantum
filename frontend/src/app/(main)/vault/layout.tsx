import dynamic from "next/dynamic";

const HeliaProvider = dynamic(
  () => import("@/features/ipfs").then((m) => m.HeliaProvider),
  { ssr: false },
);

const PinningProvider = dynamic(
  () => import("@/features/vault-pinning").then((m) => m.PinningProvider),
  { ssr: false },
);

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <HeliaProvider>
      <PinningProvider>
        {children}
      </PinningProvider>
    </HeliaProvider>
  );
}
