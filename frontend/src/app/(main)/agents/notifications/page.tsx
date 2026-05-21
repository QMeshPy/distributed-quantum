"use client";

import { useState, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, DollarSign, FileText, Users, Zap, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  proposal_funded: "bg-emerald-400",
  fragment_claimed: "bg-amber-400",
  payment_received: "bg-emerald-400",
  new_proposal: "bg-violet-400",
};

const TYPE_ICON_COLOR: Record<Notification["type"], string> = {
  proposal_funded: "text-emerald-400",
  fragment_claimed: "text-amber-400",
  payment_received: "text-emerald-400",
  new_proposal: "text-violet-400",
};

const TYPE_LABEL_COLOR: Record<Notification["type"], string> = {
  proposal_funded: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/25",
  fragment_claimed: "text-amber-400 bg-amber-400/10 ring-amber-400/25",
  payment_received: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/25",
  new_proposal: "text-violet-400 bg-violet-400/10 ring-violet-400/25",
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
  const accent = TYPE_ACCENT[notif.type] ?? "bg-sky-400";
  const iconColor = TYPE_ICON_COLOR[notif.type] ?? "text-sky-400";
  const labelStyle = TYPE_LABEL_COLOR[notif.type] ?? "text-sky-400 bg-sky-400/10 ring-sky-400/25";
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
          ? "bg-white/[0.025] ring-white/6 hover:ring-white/12"
          : "bg-white/[0.05] ring-white/10 hover:ring-white/20"
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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/8">
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm font-semibold leading-snug ${
                    notif.read ? "text-white/50" : "text-white/90"
                  }`}
                >
                  {notif.title}
                </p>
                {!notif.read && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                )}
              </div>
              <p
                className={`mt-1 text-sm leading-relaxed ${
                  notif.read ? "text-white/30" : "text-white/50"
                } line-clamp-2`}
              >
                {notif.message}
              </p>
            </div>

            {/* Type badge */}
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${labelStyle}`}
            >
              {label}
            </span>
          </div>

          {/* Timestamp */}
          <p className="mt-2 text-[11px] text-white/25">
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
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: 320 }}>
        <div
          className="absolute h-[280px] w-[320px] rounded-full opacity-20 blur-[90px]"
          style={{
            left: "10%",
            top: "-60px",
            background:
              "radial-gradient(circle, rgba(251,191,36,0.55) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute h-[240px] w-[280px] rounded-full opacity-15 blur-[80px]"
          style={{
            right: "10%",
            top: "-40px",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Page header */}
      <PageHeader
        icon={Bell}
        label="AgentKit"
        title="Notifications"
        description="Activity and alerts from your agents, proposals, and wallet."
        glow="amber"
      >
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            className="gap-1.5 text-xs text-white/50 hover:text-white"
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
          <TabsList className="h-8 bg-white/[0.04] ring-1 ring-white/8">
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
                className="h-6 px-3 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white"
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
                className="flex flex-col items-center justify-center gap-3 rounded-2xl py-20 ring-1 ring-white/6"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/8">
                  <Bell className="h-6 w-6 text-white/20" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white/40">All caught up</p>
                  <p className="mt-0.5 text-xs text-white/20">No notifications yet</p>
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
