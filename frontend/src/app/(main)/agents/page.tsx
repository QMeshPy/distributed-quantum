"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Star, DollarSign, MessageSquare, Settings, ArrowUpRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/shared/components/layout/page-header";
import { useAgents, useCreateAgent, type AgentItem } from "@/features/agentkit";
import { OpenSessionDialog } from "@/features/starknet/open-session-dialog";
import { TestSpendDialog } from "@/features/starknet/test-spend-dialog";
import { StarknetSessionPanel } from "@/features/starknet/session-panel";
import { collapseDuplicatePersonalAgents, humanSpan, humanWhen, shortAddress } from "@/features/agentkit/hooks/use-agents";
import { WalletAddressCopy } from "@/features/agentkit/components/wallet-address-copy";
import { useChatSessions, type ChatSession } from "@/features/agentkit/hooks/use-chat-sessions";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, animate } from "motion/react";
import { toast } from "sonner";
import { AgentLlmProviderSelect } from "@/features/agentkit/components/agent-llm-provider-select";

function asDecimal(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function readConfig(config: Record<string, unknown>) {
  const interests = Array.isArray(config.research_interests)
    ? config.research_interests.filter((item): item is string => typeof item === "string")
    : [];
  return {
    autoFund: typeof config.auto_fund === "boolean" ? config.auto_fund : null,
    maxPerProposal: asDecimal(config.max_per_proposal),
    dailyBudget: asDecimal(config.daily_budget),
    interests,
    minReputationThreshold: asNumber(config.min_reputation_threshold),
  };
}

function usdc(value: string | null | undefined) {
  return value ? `${value} USDC` : "—";
}

function sessionsFor(agentId: string, sessions: ChatSession[], soleAgent: boolean) {
  return sessions.filter((session) => session.agentId === agentId || (soleAgent && !session.agentId));
}

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

type StatCardProps = {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  icon: ReactNode;
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

function AgentCard({
  agent,
  index,
  selected,
  sessionCount,
  messageCount,
  onSelect,
  onOpenSession,
  onTestSpend,
}: {
  agent: AgentItem;
  index: number;
  selected: boolean;
  sessionCount: number | null;
  messageCount: number | null;
  onSelect: (agentId: string) => void;
  onOpenSession: (agentId: string) => void;
  onTestSpend: (agentId: string) => void;
}) {
  const config = readConfig(agent.config);
  const created = humanWhen(agent.created_at);
  const updated = humanWhen(agent.updated_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.4, delay: 0.05 * index, ease: "easeOut" }}
      whileHover={{ scale: 1.015 }}
      onClick={() => onSelect(agent.agent_id)}
      className={`group relative cursor-pointer overflow-hidden rounded-2xl p-5 ring-1 transition-shadow duration-300 hover:shadow-[0_0_32px_rgba(99,102,241,0.15)] ${selected ? "ring-amber-400/40" : "ring-white/10"}`}
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-transparent ring-1 ring-white/10">
            <Bot size={20} className="text-white/80" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-white/90">{agent.agent_name}</p>
            <p className="mt-1 truncate text-[11px] text-white/50">
              <span className="text-white/35">Wallet:</span>{" "}
              <span className="font-mono">{shortAddress(agent.wallet_address) || "—"}</span>
            </p>
            <p className="mt-0.5 truncate text-[10px] text-white/35">
              <span className="text-white/25">ID:</span>{" "}
              <span className="font-mono" title={agent.agent_id}>
                {agent.agent_id.slice(0, 8)}...{agent.agent_id.slice(-4)}
              </span>
            </p>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 border-emerald-400/30 text-[10px] text-emerald-400">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Active
        </Badge>
      </div>

      {config.interests.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {config.interests.slice(0, 3).map((interest) => (
            <span
              key={interest}
              className="rounded-full bg-white/6 px-2.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/8"
            >
              {interest}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] text-white/30">Sessions</p>
          <p className="text-sm font-semibold text-white/80">{sessionCount ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/30">Messages</p>
          <p className="text-sm font-semibold text-white/80">{messageCount ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/30">Spent</p>
          <p className="text-sm font-semibold text-white/80">{usdc(agent.total_spent)}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          asChild
          size="sm"
          className="h-8 flex-1 bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/25 hover:bg-amber-500/25 hover:text-amber-200"
        >
          <Link href={`/agents/chat?agentId=${encodeURIComponent(agent.agent_id)}`}>
            <MessageSquare size={13} className="mr-1.5" />
            Chat
          </Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 flex-1 text-white/40 ring-1 ring-white/10 hover:bg-white/6 hover:text-white/70"
          onClick={(event) => {
            event.stopPropagation();
            toast.info("Coming soon", { description: "Agent configuration is on the way." });
          }}
        >
          <Settings size={13} className="mr-1.5" />
          Configure
        </Button>
      </div>
      {!agent.starknet_session && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 h-8 w-full text-purple-200/70 ring-1 ring-purple-500/20 hover:bg-purple-500/10 hover:text-purple-200"
          onClick={(event) => {
            event.stopPropagation();
            onOpenSession(agent.agent_id);
          }}
        >
          Open Starknet Session
        </Button>
      )}
      {agent.starknet_session && (
        <StarknetSessionPanel
          agentId={agent.agent_id}
          session={agent.starknet_session}
          variant="card"
          onTestSpend={onTestSpend}
          onOpenSession={onOpenSession}
        />
      )}
    </motion.div>
  );
}

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
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 flex-1 rounded-lg bg-white/5" />
        <Skeleton className="h-8 flex-1 rounded-lg bg-white/5" />
      </div>
    </div>
  );
}

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

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
      <h3 className="text-lg font-semibold text-white/80">Could not load agents</h3>
      <p className="text-sm text-white/35">The agent list did not respond. Refresh to try again.</p>
    </div>
  );
}

function DetailRow({ label, value, title, mono }: { label: string; value: ReactNode; title?: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <span className="shrink-0 text-xs uppercase tracking-wider text-white/40">{label}</span>
      <span title={title} className={`text-sm text-white/80 sm:text-right ${mono ? "font-mono tracking-wide" : "break-all"}`}>{value}</span>
    </div>
  );
}

function whenLabel(value: string | undefined) {
  const when = humanWhen(value);
  if (!when) return { text: "—", title: undefined };
  return { text: `${when.relative} · ${when.exact}`, title: when.exact };
}

function AgentDetails({ agent }: { agent: AgentItem }) {
  const config = readConfig(agent.config);
  const created = whenLabel(agent.created_at);
  const updated = whenLabel(agent.updated_at);
  return (
    <div
      className="space-y-4 rounded-2xl p-4 ring-1 ring-white/8"
      style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
    >
      <DetailRow label="Name" value={agent.agent_name} />
      <DetailRow label="Status" value="Active" />
      <DetailRow label="Agent ID" value={agent.agent_id} />
      <DetailRow label="Wallet" value={<WalletAddressCopy address={agent.wallet_address} className="text-sm" />} />
      <DetailRow label="Owner" value={agent.owner_id} />
      <DetailRow label="Created" value={created.text} title={created.title} />
      <DetailRow label="Updated" value={updated.text} title={updated.title} />
      <DetailRow label="Total spent" value={usdc(agent.total_spent)} />
      <DetailRow label="Auto-fund" value={config.autoFund === null ? "—" : config.autoFund ? "On" : "Off"} />
      <DetailRow label="Max per proposal" value={usdc(config.maxPerProposal)} />
      <DetailRow label="Daily budget" value={usdc(config.dailyBudget)} />
      <DetailRow
        label="Min. reputation threshold"
        value={config.minReputationThreshold === null ? "—" : String(config.minReputationThreshold)}
      />
      {config.interests.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">Research interests</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {config.interests.map((interest) => (
              <span
                key={interest}
                className="rounded-full bg-white/6 px-2.5 py-0.5 text-[10px] font-medium text-white/50 ring-1 ring-white/8"
              >
                {interest}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SessionList({
  sessions,
  ready,
}: {
  sessions: ChatSession[];
  ready: boolean;
}) {
  if (!ready) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <div
        className="rounded-2xl px-4 py-12 text-center ring-1 ring-white/8"
        style={{ background: "rgba(255,255,255,0.04)" }}
      >
        <p className="text-sm text-white/35">No chat sessions stored for this agent.</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {sessions.map((session) => {
        const span = humanSpan(session.createdAt, session.updatedAt);
        return (
        <Link
          key={session.id}
          href={`/agents/chat?sessionId=${encodeURIComponent(session.id)}`}
          className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ring-1 ring-white/8 transition-colors hover:bg-white/5"
          style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white/85">{session.title || "Untitled session"}</p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-white/35">{session.id}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-white/50">{session.messages.length} messages</p>
            {span && (
              <p className="text-[11px] text-white/30" title={span.title}>
                {span.text}
              </p>
            )}
          </div>
        </Link>
        );
      })}
    </div>
  );
}

export default function AgentsOverviewPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useAgents();
  const createAgent = useCreateAgent();
  const { sessions, sessionsReady } = useChatSessions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openSessionAgentId, setOpenSessionAgentId] = useState<string | null>(null);
  const [testSpendAgentId, setTestSpendAgentId] = useState<string | null>(null);
  const owned = data ?? [];
  const agents = collapseDuplicatePersonalAgents(owned, sessions);
  const selected = agents.find((agent) => agent.agent_id === selectedId) ?? agents[0] ?? null;
  const soleAgent = agents.length === 1;
  const agentSessions = selected ? sessionsFor(selected.agent_id, sessions, soleAgent) : [];
  const sessionTotal = agents.reduce(
    (sum, agent) => sum + sessionsFor(agent.agent_id, sessions, soleAgent).length,
    0,
  );

  return (
    <div className="relative flex flex-col">
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
        description="Your agents, their configuration, and stored chat sessions."
        glow="amber"
      >
        <div className="flex items-center gap-2">
          <AgentLlmProviderSelect variant="header" />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-white/75 ring-1 ring-white/10 hover:bg-white/6 hover:text-white"
            disabled={createAgent.isPending}
            onClick={() => {
              const taken = new Set(agents.map((agent) => agent.agent_name));
              let name = "Research Assistant";
              for (let n = 2; taken.has(name); n += 1) name = `Research Assistant ${n}`;
              createAgent.mutate(
                {
                  agent_name: name,
                  config: {
                    auto_fund: false,
                    max_per_proposal: "50",
                    daily_budget: "200",
                    research_interests: ["quantum computing", "error correction", "variational algorithms"],
                    min_reputation_threshold: 40,
                  },
                },
                {
                  onSuccess: (agent) => {
                    setSelectedId(agent.agent_id);
                    toast.success("Agent created", { description: agent.agent_name });
                  },
                  onError: (error: Error) => toast.error(error.message),
                },
              );
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {createAgent.isPending ? "Creating…" : "Create new agent"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/25 hover:bg-amber-500/25 hover:text-amber-100"
            onClick={() => {
              const params = new URLSearchParams({ new: String(Date.now()) });
              if (selected?.agent_id) params.set("agentId", selected.agent_id);
              router.push(`/agents/chat?${params.toString()}`);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Chat
          </Button>
        </div>
      </PageHeader>

      <div className="relative z-10 flex flex-col gap-6 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Active Agents"
            value={agents.length}
            icon={<Bot size={17} />}
            accentClass="text-amber-400"
            delay={0}
          />
          <StatCard
            label="Chat Sessions"
            value={sessionsReady ? sessionTotal : 0}
            icon={<MessageSquare size={17} />}
            accentClass="text-cyan-400"
            delay={0.06}
          />
          <StatCard
            label="Avg Reputation"
            value={0}
            decimals={1}
            suffix="/100"
            icon={<Star size={17} />}
            accentClass="text-violet-400"
            delay={0.12}
          />
          <StatCard
            label="Total Earned"
            value={0}
            decimals={2}
            prefix="$"
            icon={<DollarSign size={17} />}
            accentClass="text-emerald-400"
            delay={0.18}
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : isError && agents.length === 0 ? (
          <ErrorState />
        ) : agents.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((agent, i) => {
                  const rows = sessionsFor(agent.agent_id, sessions, soleAgent);
                  return (
                    <AgentCard
                      key={agent.agent_id}
                      agent={agent}
                      index={i}
                      selected={selected?.agent_id === agent.agent_id}
                      sessionCount={sessionsReady ? rows.length : null}
                      messageCount={sessionsReady ? rows.reduce((sum, row) => sum + row.messages.length, 0) : null}
                      onSelect={setSelectedId}
                      onOpenSession={setOpenSessionAgentId}
                      onTestSpend={setTestSpendAgentId}
                    />
                  );
                })}
              </div>
            </AnimatePresence>

            {selected && (
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="h-8 bg-white/[0.04] ring-1 ring-white/8">
                  <TabsTrigger value="details" className="h-6 px-3 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="sessions" className="h-6 px-3 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">
                    Sessions{sessionsReady ? ` (${agentSessions.length})` : ""}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="mt-4">
                  <AgentDetails agent={selected} />
                </TabsContent>
                <TabsContent value="sessions" className="mt-4">
                  <SessionList sessions={agentSessions} ready={sessionsReady} />
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </div>

      {openSessionAgentId && (
        <OpenSessionDialog
          agentId={openSessionAgentId}
          open={!!openSessionAgentId}
          onOpenChange={(open) => !open && setOpenSessionAgentId(null)}
        />
      )}

      {testSpendAgentId && (
        <TestSpendDialog
          agentId={testSpendAgentId}
          session={agents.find((agent) => agent.agent_id === testSpendAgentId)?.starknet_session}
          open={!!testSpendAgentId}
          onOpenChange={(open) => !open && setTestSpendAgentId(null)}
        />
      )}
    </div>
  );
}
