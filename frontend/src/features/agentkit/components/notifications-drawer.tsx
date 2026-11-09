"use client";

import { useNotifications, useMarkNotificationRead } from "../hooks/use-notifications";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { ScrollArea } from "@/components/arc/scroll-area/scroll-area";
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent title="Notifications">
        <div>
<Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            className="text-subtle"
          >
            Mark all read
          </Button>
        </div>

        <ScrollArea className="mt-4 h-[calc(100vh-100px)]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-subtle">
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
                      notif.read ?"opacity-60" : "bg-surface-muted"
                    }`}
                    onClick={() => {
                      if (!notif.read) markRead.mutate(notif.notification_id);
                    }}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {notif.title}
                        </span>
                        {!notif.read && (
                          <Badge className="h-2 w-2 rounded-full bg-warning p-0" />
                        )}
                      </div>
                      <p className="text-sm text-subtle">{notif.message}</p>
                      <span className="text-xs text-subtle">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
