"use client";

import { useState } from "react";
import { Bell, DollarSign, FileText, Users, Zap, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { ScrollArea } from "@/components/arc/scroll-area/scroll-area";
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer";
import { useNotifications, useMarkNotificationRead } from "@/features/agentkit/hooks/use-notifications";
import type { Notification } from "@/features/agentkit/types";

// ─── helpers ────────────────────────────────────────────────────────────────

const NOTIF_ICONS: Record<Notification["type"], React.ElementType> = {
  proposal_funded:  DollarSign,
  fragment_claimed: FileText,
  payment_received: DollarSign,
  new_proposal:     Users,
};

const TYPE_LABEL: Record<Notification["type"], string> = {
  proposal_funded:  "Funded",
  fragment_claimed: "Fragment",
  payment_received: "Payment",
  new_proposal:     "Proposal",
};

const TYPE_ACCENT: Record<Notification["type"], string> = {
  proposal_funded:  "bg-success",
  fragment_claimed: "bg-warning",
  payment_received: "bg-success",
  new_proposal:     "bg-accent",
};

const TYPE_ICON_COLOR: Record<Notification["type"], string> = {
  proposal_funded:  "text-success",
  fragment_claimed: "text-warning",
  payment_received: "text-success",
  new_proposal:     "text-accent",
};

const TYPE_LABEL_COLOR: Record<Notification["type"], string> = {
  proposal_funded:  "text-success bg-success/10 ring-success/25",
  fragment_claimed: "text-warning  bg-warning/10  ring-warning/25",
  payment_received: "text-success bg-success/10 ring-success/25",
  new_proposal:     "text-accent  bg-accent/10  ring-accent/25",
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── notification card ───────────────────────────────────────────────────────

function NotifCard({
  notif,
  onMarkRead,
}: {
  notif: Notification;
  onMarkRead: (id: string) => void;
}) {
  const Icon       = NOTIF_ICONS[notif.type]    ?? Bell;
  const accent     = TYPE_ACCENT[notif.type]    ?? "bg-info";
  const iconColor  = TYPE_ICON_COLOR[notif.type] ?? "text-info";
  const labelStyle = TYPE_LABEL_COLOR[notif.type] ?? "text-info bg-info/10 ring-info/25";
  const label      = TYPE_LABEL[notif.type]     ?? "System";

  return (
    <button
      className={`group relative flex w-full cursor-pointer overflow-hidden rounded-2xl ring-1 text-left transition-all duration-150 ${
        notif.read
          ?"bg-surface-muted ring-border hover:ring-border"
          : "bg-surface-muted ring-border hover:ring-border-strong"
      }`}
      onClick={() => { if (!notif.read) onMarkRead(notif.notification_id); }}
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 self-stretch rounded-l-2xl ${accent} opacity-70`} />

      <div className="flex flex-1 gap-3 px-4 py-3.5">
        {/* Icon */}
        <div className="mt-0.5 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-muted ring-1 ring-border">
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`text-sm font-medium leading-snug truncate ${notif.read ?"text-subtle" : "text-foreground"}`}>
                  {notif.title}
                </p>
                {!notif.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
              </div>
              <p className={`mt-0.5 text-xs leading-relaxed line-clamp-2 ${notif.read ?"text-faint" : "text-subtle"}`}>
                {notif.message}
              </p>
            </div>
            {/* Type badge */}
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ${labelStyle}`}>
              {label}
            </span>
          </div>
          <p className="mt-1.5 text-xs text-faint">{relativeTime(notif.created_at)}</p>
        </div>
      </div>
    </button>
  );
}

// ─── main export ─────────────────────────────────────────────────────────────

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    notifications
      .filter((n) => !n.read)
      .forEach((n) => markRead.mutate(n.notification_id));
  };

  return (
    <>
      {/* Bell trigger */}
      <Button
        variant="ghost"
       
        className="relative h-8 w-8 text-subtle hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning p-0 text-xs font-medium text-accent-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Sidebar sheet */}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent title="Notifications" side="right">
{/* Header */}
          <div
            className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4"
            style={{ background: "var(--surface-muted)" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 ring-1 ring-warning/25">
                <Zap className="h-3.5 w-3.5 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Notifications</p>
                {unreadCount > 0 ? (
                  <p className="text-xs text-warning">{unreadCount} unread</p>
                ) : (
                  <p className="text-xs text-faint">All caught up</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="h-7 gap-1.5 px-2 text-xs text-subtle hover:text-foreground"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
               
                onClick={() => setOpen(false)}
                className="h-7 w-7 text-faint hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* List */}
          <ScrollArea className="flex-1 min-h-0">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-faint">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted ring-1 ring-border">
                  <Bell className="h-6 w-6 text-faint" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-subtle">All caught up</p>
                  <p className="mt-0.5 text-xs text-faint">No notifications yet</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 p-3">
                {notifications.map((notif) => (
                  <NotifCard
                    key={notif.notification_id}
                    notif={notif}
                    onMarkRead={(id) => markRead.mutate(id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="shrink-0 border-t border-border px-5 py-3">
            <p className="text-center text-xs text-faint">
              {notifications.length} notification{notifications.length !== 1 ? "s" : ""} total
            </p>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
