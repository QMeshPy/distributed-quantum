"use client";

import { useNotifications, useMarkNotificationRead } from "../hooks/use-notifications";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, DollarSign, FileText, Users } from "lucide-react";

const NOTIF_ICONS = {
  proposal_funded: DollarSign,
  fragment_claimed: FileText,
  payment_received: DollarSign,
  new_proposal: Users,
} as const;

type NotificationsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NotificationsDrawer({ open, onOpenChange }: NotificationsDrawerProps) {
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();

  const handleMarkAllRead = () => {
    notifications
      .filter((n) => !n.read)
      .forEach((n) => markRead.mutate(n.notification_id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] border-white/10 bg-background">
        <SheetHeader className="flex flex-row items-center justify-between">
          <SheetTitle className="text-white">Notifications</SheetTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            className="text-white/60"
          >
            Mark all read
          </Button>
        </SheetHeader>

        <ScrollArea className="mt-4 h-[calc(100vh-100px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/40">
              <Bell className="mb-2 h-8 w-8" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((notif) => {
                const Icon = NOTIF_ICONS[notif.type] || Bell;
                return (
                  <div
                    key={notif.notification_id}
                    className={`flex gap-3 rounded-lg p-3 ${
                      notif.read ? "opacity-60" : "bg-white/[0.03]"
                    }`}
                    onClick={() => {
                      if (!notif.read) markRead.mutate(notif.notification_id);
                    }}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {notif.title}
                        </span>
                        {!notif.read && (
                          <Badge className="h-2 w-2 rounded-full bg-amber-400 p-0" />
                        )}
                      </div>
                      <p className="text-sm text-white/60">{notif.message}</p>
                      <span className="text-xs text-white/40">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
