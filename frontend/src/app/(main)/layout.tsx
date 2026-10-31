"use client";

import dynamic from "next/dynamic";
import { DashboardShell } from "@/shared/components/layout/dashboard-shell";
import { PinningProvider } from "@/features/vault-pinning/provider";

const HeliaProvider = dynamic(
  () => import("@/features/ipfs/provider").then((module) => module.HeliaProvider),
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
