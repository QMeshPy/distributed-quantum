"use client";

import dynamic from "next/dynamic";
import { DashboardShell } from "@/shared/components/layout/dashboard-shell";

const HeliaProvider = dynamic(
  () => import("@/features/ipfs").then((m) => m.HeliaProvider),
  { ssr: false },
);

const PinningProvider = dynamic(
  () => import("@/features/vault-pinning").then((m) => m.PinningProvider),
  { ssr: false },
);

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeliaProvider>
      <PinningProvider>
        <DashboardShell>{children}</DashboardShell>
      </PinningProvider>
    </HeliaProvider>
  );
}
