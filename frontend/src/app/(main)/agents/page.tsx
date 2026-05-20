"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bot, CheckSquare, Star, DollarSign, MessageSquare, Settings, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useMarketplace } from "@/features/agentkit";
import type { MarketplaceAgent } from "@/features/agentkit";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, animate } from "motion/react";
import { toast } from "sonner";

// ─── helpers ────────────────────────────────────────────────────────────────

function statusColors(status: MarketplaceAgent["status"]) {
  switch (status) {
    case "active":
    case "available":
      return { dot: "bg-emerald-400", badge: "text-emerald-400 border-emerald-400/30", glowFrom: "from-emerald-500/25" };
    case "busy":
      return { dot: "bg-amber-400", badge: "text-amber-400 border-amber-400/30", glowFrom: "from-amber-500/25" };
    case "offline":
      return { dot: "bg-red-400", badge: "text-red-400 border-red-400/30", glowFrom: "from-red-500/25" };
  }
}

function statusLabel(status: MarketplaceAgent["status"]) {
  switch (status) {
    case "active":    return "Active";
    case "available": return "Available";
    case "busy":      return "Busy";
    case "offline":   return "Offline";
  }
}

// ─── animated counter ────────────────────────────────────────────────────────

function AnimatedCounter({
  target,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  target: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const mv = useMotionValue(0);
  const springMv = useSpring(mv, { stiffness: 60, damping: 18 });
  const display = useTransform(springMv, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);

  useEffect(() => {
    const ctrl = animate(mv, target, { duration: 1.4, ease: "easeOut" });
    return ctrl.stop;
  }, [mv, target]);

  return <motion.span>{display}</motion.span>;
}

// ─── stat card ───────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon: React.ReactNode;
  accentClass: string;
  delay: number;
};

function StatCard({ label, value, decimals, prefix, suffix, icon, accentClass, delay }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: "easeOut" }}
      className="relative overflow-hidden rounded-2xl p-5 ring-1 ring-white/10"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-white/6 ${accentClass}`}>
        {icon}
      </div>
      <p className="text-[11px] font-medium uppercase tracking-widest text-white/30">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white/90">
        <AnimatedCounter target={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </p>
    </motion.div>
  );
}

// ─── animated reputation bar ─────────────────────────────────────────────────

function ReputationBar({ value, delay }: { value: number; delay: number }) {
  const mv = useMotionValue(0);
  const springMv = useSpring(mv, { stiffness: 55, damping: 18 });
  const barWidth = useTransform(springMv, (v) => `${v}%`);

  useEffect(() => {
    const timer = setTimeout(() => {
      const ctrl = animate(mv, value, { duration: 0.6, ease: "easeOut" });
      return ctrl.stop;
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [mv, value, delay]);

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-violet-500"
        style={{ width: barWidth }}
      />
    </div>
  );
}

// ─── agent card ──────────────────────────────────────────────────────────────

function AgentCard({ agent, index }: { agent: MarketplaceAgent; index: number }) {
  const colors = statusColors(agent.status);
  const reputationPct = Math.min(100, Math.max(0, agent.reputation_score));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.4, delay: 0.05 * index, ease: "easeOut" }}
      whileHover={{ scale: 1.015 }}
      className="group relative overflow-hidden rounded-2xl p-5 ring-1 ring-white/10 transition-shadow duration-300 hover:shadow-[0_0_32px_rgba(99,102,241,0.15)]"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      {/* top-edge glow on hover */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${colors.glowFrom} via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />

      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${colors.glowFrom} to-transparent ring-1 ring-white/10`}
          >
            <Bot size={20} className="text-white/80" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/90 leading-tight">{agent.agent_name}</p>
            {agent.specialty && (
              <p className="mt-0.5 text-[11px] text-white/35">{agent.specialty}</p>
            )}
          </div>
        </div>
        <Badge variant="outline" className={`shrink-0 text-[10px] ${colors.badge}`}>
          <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {statusLabel(agent.status)}
        </Badge>
      </div>

      {/* capability chips */}
      {agent.capabilities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {agent.capabilities.slice(0, 3).map((cap) => (
            <span
              key={cap}
              className="rounded-full bg-white/6 px-2.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/8"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {/* metrics */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] text-white/30">Tasks</p>
          <p className="text-sm font-semibold text-white/80">{agent.total_tasks}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/30">Reputation</p>
          <p className="text-sm font-semibold text-white/80">{agent.reputation_score}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/30">Rate</p>
          <p className="text-sm font-semibold text-white/80">{agent.pricing_per_task} USDC</p>
        </div>
      </div>

      {/* reputation bar */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] text-white/25">Reputation</span>
          <span className="text-[10px] text-white/40">{reputationPct}/100</span>
        </div>
        <ReputationBar value={reputationPct} delay={0.08 * index + 0.3} />
      </div>

      {/* actions */}
      <div className="mt-4 flex gap-2">
        <Button
          asChild
          size="sm"
          className="h-8 flex-1 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25 hover:bg-amber-500/25 hover:text-amber-200"
        >
          <Link href="/agents/chat">
            <MessageSquare size={13} className="mr-1.5" />
            Chat
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 flex-1 text-white/40 ring-1 ring-white/10 hover:bg-white/6 hover:text-white/70"
          onClick={() => toast.info("Coming soon", { description: "Agent configuration is on the way." })}
        >
          <Settings size={13} className="mr-1.5" />
          Configure
        </Button>
      </div>
    </motion.div>
  );
}

// ─── skeleton ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-5 ring-1 ring-white/8"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-xl bg-white/6" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-3/4 rounded bg-white/6" />
          <Skeleton className="h-2.5 w-1/2 rounded bg-white/4" />
        </div>
      </div>
      <div className="mt-3 flex gap-1.5">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-5 w-16 rounded-full bg-white/5" />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 rounded-lg bg-white/5" />
        ))}
      </div>
      <Skeleton className="mt-3 h-1.5 w-full rounded-full bg-white/5" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-lg bg-white/5" />
        <Skeleton className="h-8 flex-1 rounded-lg bg-white/5" />
      </div>
    </div>
  );
}

// ─── empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col items-center justify-center gap-4 py-20 text-center"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-2xl" />
        <div
          className="relative flex h-20 w-20 items-center justify-center rounded-full ring-1 ring-white/10"
          style={{ background: "rgba(255,255,255,0.05)" }}
        >
          <Bot size={36} className="text-amber-400/70" />
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white/80">No agents yet</h3>
        <p className="mt-1 text-sm text-white/35">Your personal agent is being set up…</p>
      </div>
      <Button
        asChild
        className="bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25 hover:bg-amber-500/25 hover:text-amber-200"
      >
        <Link href="/agents/chat">
          <ArrowUpRight size={15} className="mr-1.5" />
          Go to Chat
        </Link>
      </Button>
    </motion.div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AgentsOverviewPage() {
  const { data: agents, isLoading } = useMarketplace();

  const activeCount = agents?.filter((a) => a.status === "active" || a.status === "available").length ?? 0;
  const totalTasks  = agents?.reduce((s, a) => s + a.total_tasks, 0) ?? 0;
  const avgReputation =
    agents && agents.length > 0
      ? agents.reduce((s, a) => s + a.reputation_score, 0) / agents.length
      : 0;
  const totalEarned =
    agents?.reduce((s, a) => s + parseFloat(a.pricing_per_task ?? "0") * a.total_tasks, 0) ?? 0;

  return (
    <div className="relative flex flex-col">

      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "420px" }}>
        <div
          className="absolute h-[320px] w-[300px] rounded-full opacity-20 blur-[100px]"
          style={{ left: "-40px", top: "-60px", background: "radial-gradient(circle, rgba(245,158,11,0.6) 0%, transparent 70%)" }}
        />
        <div
          className="absolute h-[280px] w-[280px] rounded-full opacity-15 blur-[90px]"
          style={{ right: "-30px", top: "-50px", background: "radial-gradient(circle, rgba(139,92,246,0.6) 0%, transparent 70%)" }}
        />
      </div>

      <PageHeader
        icon={Bot}
        label="AgentKit"
        title="My Agents"
        description="Live dashboard for your active AI agents — reputation, tasks, and earnings."
        glow="amber"
      />

      <div className="relative z-10 flex flex-col gap-6 p-6">

        {/* Hero stat strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Active Agents"
            value={activeCount}
            icon={<Bot size={17} />}
            accentClass="text-amber-400"
            delay={0}
          />
          <StatCard
            label="Total Tasks"
            value={totalTasks}
            icon={<CheckSquare size={17} />}
            accentClass="text-cyan-400"
            delay={0.06}
          />
          <StatCard
            label="Avg Reputation"
            value={avgReputation}
            decimals={1}
            suffix="/100"
            icon={<Star size={17} />}
            accentClass="text-violet-400"
            delay={0.12}
          />
          <StatCard
            label="Total Earned"
            value={totalEarned}
            decimals={2}
            prefix="$"
            icon={<DollarSign size={17} />}
            accentClass="text-emerald-400"
            delay={0.18}
          />
        </div>

        {/* Agent grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : !agents || agents.length === 0 ? (
          <EmptyState />
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agents.map((agent, i) => (
                <AgentCard key={agent.agent_id} agent={agent} index={i} />
              ))}
            </div>
          </AnimatePresence>
        )}

      </div>
    </div>
  );
}
