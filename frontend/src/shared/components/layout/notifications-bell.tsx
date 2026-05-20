"use client";

import Link from "next/link";
import { Bell, DollarSign, FileText, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, useMarkNotificationRead } from "@/features/agentkit/hooks/use-notifications";
import type { Notification } from "@/features/agentkit/types";

const NOTIF_ICONS: Record<Notification["type"], React.ElementType> = {
  proposal_funded: DollarSign,
  fragment_claimed: FileText,
  payment_received: DollarSign,
  new_proposal: Users,
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

export function NotificationsBell() {
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();

  const unreadCount = notifications.filter((n) => !n.read).length;
  const preview = notifications.slice(0, 5);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-white/60 hover:text-white"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 p-0 text-[10px] font-bold text-black">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] p-0 border-white/10 bg-[#0d0d0f]/95 backdrop-blur-xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">
              Notifications
            </span>
          </div>
          {unreadCount > 0 && (
            <Badge className="rounded-full bg-amber-400/15 px-2 py-0 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-400/30">
              {unreadCount} unread
            </Badge>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[360px]">
          {preview.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-white/30">
              <Bell className="h-7 w-7" />
              <p className="text-sm">All caught up</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {preview.map((notif) => {
                const Icon = NOTIF_ICONS[notif.type] ?? Bell;
                const truncated =
                  notif.message.length > 60
                    ? notif.message.slice(0, 60) + "\u2026"
                    : notif.message;
                return (
                  <button
                    key={notif.notification_id}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] ${
                      !notif.read ? "bg-white/[0.02]" : ""
                    }`}
                    onClick={() => {
                      if (!notif.read) markRead.mutate(notif.notification_id);
                    }}
                  >
                    {/* Unread dot */}
                    <div className="mt-1.5 flex w-5 shrink-0 justify-center">
                      {!notif.read ? (
                        <span className="h-2 w-2 rounded-full bg-amber-400" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-white/10" />
                      )}
                    </div>

                    {/* Icon */}
                    <div className="mt-0.5 shrink-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/8">
                        <Icon className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm font-medium leading-snug ${
                          notif.read ? "text-white/50" : "text-white/90"
                        }`}
                      >
                        {notif.title}
                      </p>
                      <p className="mt-0.5 text-xs text-white/35">{truncated}</p>
                      <p className="mt-1 text-[10px] text-white/25">
                        {relativeTime(notif.created_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-white/8 px-4 py-2.5">
          <Link
            href="/agents/notifications"
            className="flex items-center justify-center gap-1.5 text-xs text-amber-400/80 transition-colors hover:text-amber-400"
          >
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
