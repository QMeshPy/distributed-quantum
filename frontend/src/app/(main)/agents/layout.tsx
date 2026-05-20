"use client";

import { useState } from "react";
import { WalletStrip } from "@/features/agentkit/components/wallet-strip";
import { NotificationsDrawer } from "@/features/agentkit/components/notifications-drawer";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <WalletStrip onNotificationsClick={() => setNotifOpen(true)} />
      {children}
      <NotificationsDrawer open={notifOpen} onOpenChange={setNotifOpen} />
    </div>
  );
}
