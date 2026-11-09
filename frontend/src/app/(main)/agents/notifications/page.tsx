"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, DollarSign, FileText, Users, CheckCheck } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { PageHeader } from "@/shared/components/layout/page-header";
import {
  useNotifications,
  useMarkNotificationRead,
} from "@/features/agentkit/hooks/use-notifications";
import type { Notification } from "@/features/agentkit/types";

// ─── helpers ────────────────────────────────────────────────────────────────

const NOTIF_ICONS: Record<Notification["type"], React.ElementType> = {
  proposal_funded: DollarSign,
  fragment_claimed: FileText,
  payment_received: DollarSign,
  new_proposal: Users,
};

const TYPE_LABEL: Record<Notification["type"], string> = {
  proposal_funded: "Payment",
  fragment_claimed: "Agent",
  payment_received: "Payment",
  new_proposal: "Proposal",
};

const TYPE_ACCENT: Record<Notification["type"], string> = {
  proposal_funded: "bg-success",
  fragment_claimed: "bg-warning",
  payment_received: "bg-success",
  new_proposal: "bg-accent",
};

const TYPE_ICON_COLOR: Record<Notification["type"], string> = {
  proposal_funded: "text-success",
  fragment_claimed: "text-warning",
  payment_received: "text-success",
  new_proposal: "text-accent",
};

const TYPE_LABEL_COLOR: Record<Notification["type"], string> = {
  proposal_funded: "text-success bg-success/10 ring-success/25",
  fragment_claimed: "text-warning bg-warning/10 ring-warning/25",
  payment_received: "text-success bg-success/10 ring-success/25",
  new_proposal: "text-accent bg-accent/10 ring-accent/25",
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

type TabFilter = "all" | "unread" | "agent" | "payment" | "proposal";

function matchesFilter(n: Notification, filter: TabFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unread") return !n.read;
  if (filter === "agent") return n.type === "fragment_claimed";
  if (filter === "payment")
    return n.type === "proposal_funded" || n.type === "payment_received";
  if (filter === "proposal") return n.type === "new_proposal";
  return true;
}

// ─── card ───────────────────────────────────────────────────────────────────

function NotificationCard({
  notif,
  index,
  onMarkRead,
}: {
  notif: Notification;
  index: number;
  onMarkRead: (id: string) => void;
}) {
  const Icon = NOTIF_ICONS[notif.type] ?? Bell;
  const accent = TYPE_ACCENT[notif.type] ?? "bg-info";
  const iconColor = TYPE_ICON_COLOR[notif.type] ?? "text-info";
  const labelStyle = TYPE_LABEL_COLOR[notif.type] ?? "text-info bg-info/10 ring-info/25";
  const label = TYPE_LABEL[notif.type] ?? "System";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      whileHover={{ scale: 1.005 }}
      className={`group relative flex cursor-pointer overflow-hidden rounded-2xl ring-1 transition-all duration-150 ${
        notif.read
          ?"bg-surface-muted ring-border hover:ring-border"
          : "bg-surface-muted ring-border hover:ring-border-strong"
      }`}
      onClick={() => {
        if (!notif.read) onMarkRead(notif.notification_id);
      }}
    >
      {/* Left accent bar */}
      <div className={`w-1 shrink-0 self-stretch rounded-l-2xl ${accent} opacity-70`} />

      <div className="flex flex-1 gap-4 px-5 py-4">
        {/* Icon */}
        <div className="mt-0.5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted ring-1 ring-border">
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm font-medium leading-snug ${
                    notif.read ?"text-subtle" : "text-foreground"
                  }`}
                >
                  {notif.title}
                </p>
                {!notif.read && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-warning" />
                )}
              </div>
              <p
                className={`mt-1 text-sm leading-relaxed ${
                  notif.read ?"text-faint" : "text-subtle"
                } line-clamp-2`}
              >
                {notif.message}
              </p>
            </div>

            {/* Type badge */}
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${labelStyle}`}
            >
              {label}
            </span>
          </div>

          {/* Timestamp */}
          <p className="mt-2 text-xs text-faint">
            {relativeTime(notif.created_at)}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const [tab, setTab] = useState<TabFilter>("all");

  const filtered = useMemo(
    () => notifications.filter((n) => matchesFilter(n, tab)),
    [notifications, tab],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    notifications
      .filter((n) => !n.read)
      .forEach((n) => markRead.mutate(n.notification_id));
  };

  return (
    <div className="relative flex flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: 320 }}>
        
        
      </div>

      {/* Page header */}
      <PageHeader
        icon={Bell}
        title="Notifications"
        description="Activity and alerts from your agents, proposals, and wallet."
      >
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            className="gap-1.5 text-xs text-subtle hover:text-foreground"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </PageHeader>

      {/* Content */}
      <div className="relative z-10 flex flex-col gap-4 p-6">
        {/* Filter tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
          <TabsList className="h-8 bg-surface-muted ring-1 ring-border">
            {(
              [
                { value: "all", label: "All" },
                { value: "unread", label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` },
                { value: "agent", label: "Agent" },
                { value: "payment", label: "Payment" },
                { value: "proposal", label: "Proposal" },
              ] as const
            ).map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="h-6 px-3 text-xs data-[state=active]:bg-surface-raised data-[state=active]:text-foreground"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* List */}
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl py-20 ring-1 ring-border"
                style={{ background: "color-mix(in oklab, var(--foreground) 2%, transparent)" }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted ring-1 ring-border">
                  <Bell className="h-6 w-6 text-faint" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-subtle">All caught up</p>
                  <p className="mt-0.5 text-xs text-faint">No notifications yet</p>
                </div>
              </motion.div>
            ) : (
              filtered.map((notif, i) => (
                <NotificationCard
                  key={notif.notification_id}
                  notif={notif}
                  index={i}
                  onMarkRead={(id) => markRead.mutate(id)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
