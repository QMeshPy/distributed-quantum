"use client";

import { useState } from "react";
import { Bell, DollarSign, FileText, Users, Zap, CheckCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
  proposal_funded:  "bg-emerald-400",
  fragment_claimed: "bg-amber-400",
  payment_received: "bg-emerald-400",
  new_proposal:     "bg-violet-400",
};

const TYPE_ICON_COLOR: Record<Notification["type"], string> = {
  proposal_funded:  "text-emerald-400",
  fragment_claimed: "text-amber-400",
  payment_received: "text-emerald-400",
  new_proposal:     "text-violet-400",
};

const TYPE_LABEL_COLOR: Record<Notification["type"], string> = {
  proposal_funded:  "text-emerald-400 bg-emerald-400/10 ring-emerald-400/25",
  fragment_claimed: "text-amber-400  bg-amber-400/10  ring-amber-400/25",
  payment_received: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/25",
  new_proposal:     "text-violet-400  bg-violet-400/10  ring-violet-400/25",
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
  const accent     = TYPE_ACCENT[notif.type]    ?? "bg-sky-400";
  const iconColor  = TYPE_ICON_COLOR[notif.type] ?? "text-sky-400";
  const labelStyle = TYPE_LABEL_COLOR[notif.type] ?? "text-sky-400 bg-sky-400/10 ring-sky-400/25";
  const label      = TYPE_LABEL[notif.type]     ?? "System";

  return (
    <button
      className={`group relative flex w-full cursor-pointer overflow-hidden rounded-2xl ring-1 text-left transition-all duration-150 ${
        notif.read
          ? "bg-white/[0.02] ring-white/6 hover:ring-white/12"
          : "bg-white/[0.05] ring-white/10 hover:ring-white/20"
      }`}
      onClick={() => { if (!notif.read) onMarkRead(notif.notification_id); }}
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 self-stretch rounded-l-2xl ${accent} opacity-70`} />

      <div className="flex flex-1 gap-3 px-4 py-3.5">
        {/* Icon */}
        <div className="mt-0.5 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/8">
            <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          </div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`text-sm font-semibold leading-snug truncate ${notif.read ? "text-white/45" : "text-white/90"}`}>
                  {notif.title}
                </p>
                {!notif.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
              </div>
              <p className={`mt-0.5 text-xs leading-relaxed line-clamp-2 ${notif.read ? "text-white/25" : "text-white/50"}`}>
                {notif.message}
              </p>
            </div>
            {/* Type badge */}
            <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ${labelStyle}`}>
              {label}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] text-white/25">{relativeTime(notif.created_at)}</p>
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
        size="icon"
        className="relative h-8 w-8 text-white/60 hover:text-white"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 p-0 text-[10px] font-bold text-black">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Sidebar sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-[400px] flex-col gap-0 border-l border-white/8 bg-[#0b0c0f] p-0 shadow-2xl sm:w-[420px]"
        >
          <SheetTitle className="sr-only">Notifications</SheetTitle>

          {/* Header */}
          <div
            className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4"
            style={{ background: "linear-gradient(to bottom, rgba(251,191,36,0.04) 0%, transparent 100%)" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 ring-1 ring-amber-400/25">
                <Zap className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white/90">Notifications</p>
                {unreadCount > 0 ? (
                  <p className="text-[11px] text-amber-400/70">{unreadCount} unread</p>
                ) : (
                  <p className="text-[11px] text-white/30">All caught up</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllRead}
                  className="h-7 gap-1.5 px-2 text-[11px] text-white/40 hover:text-white/80"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-7 w-7 text-white/30 hover:text-white/70"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* List */}
          <ScrollArea className="flex-1 min-h-0">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/30">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/8">
                  <Bell className="h-6 w-6 text-white/20" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white/40">All caught up</p>
                  <p className="mt-0.5 text-xs text-white/20">No notifications yet</p>
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
          <div className="shrink-0 border-t border-white/8 px-5 py-3">
            <p className="text-center text-[11px] text-white/20">
              {notifications.length} notification{notifications.length !== 1 ? "s" : ""} total
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
