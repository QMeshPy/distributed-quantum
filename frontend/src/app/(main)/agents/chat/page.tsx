"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/shared/components/layout/page-header";
import {
  Send, DollarSign, Store, BarChart3, Search,
  MessageSquare, Bot, PenLine, FlaskConical,
  Plus, Trash2, ChevronLeft, ChevronRight, MessagesSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAgents, useCreateAgent } from "@/features/agentkit";
import {
  RichMessageRenderer,
  type RichContent,
} from "@/features/agentkit/components/rich-message-renderer";
import {
  useChatSessions,
  type ChatMessage,
} from "@/features/agentkit/hooks/use-chat-sessions";

const STARTERS: {
  label: string; prompt: string; icon: LucideIcon; iconClass: string; hoverGradient: string;
}[] = [
  { label: "Fund a Proposal",    prompt: "I want to fund a research proposal",                                       icon: DollarSign,   iconClass: "text-violet-400",  hoverGradient: "from-violet-500/20 via-violet-600/8 to-transparent" },
  { label: "Browse Marketplace", prompt: "Show me available agents in the marketplace",                              icon: Store,        iconClass: "text-cyan-400",    hoverGradient: "from-cyan-500/20 via-cyan-600/8 to-transparent" },
  { label: "Check my balance",   prompt: "What is my current wallet balance?",                                       icon: BarChart3,    iconClass: "text-emerald-400", hoverGradient: "from-emerald-500/20 via-emerald-600/8 to-transparent" },
  { label: "Analyze a proposal", prompt: "Analyze the top active proposal and tell me if I should fund it",         icon: Search,       iconClass: "text-amber-400",   hoverGradient: "from-amber-500/20 via-amber-600/8 to-transparent" },
  { label: "Draft Proposal",     prompt: "Help me draft a new research proposal",                                    icon: PenLine,      iconClass: "text-rose-400",    hoverGradient: "from-rose-500/20 via-rose-600/8 to-transparent" },
  { label: "Run Research",       prompt: "Run a drug discovery research job",                                        icon: FlaskConical, iconClass: "text-teal-400",    hoverGradient: "from-teal-500/20 via-teal-600/8 to-transparent" },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export default function AgentsChatPage() {
  const [messages, setMessages]             = useState<ChatMessage[]>([]);
  const [input, setInput]                   = useState("");
  const [loading, setLoading]               = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [pendingAction, setPendingAction]   = useState<"draft_proposal" | null>(null);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: agents = [], isLoading: agentsLoading } = useAgents();
  const createAgent = useCreateAgent();
  const { sessions, createSession, appendMessage, deleteSession } = useChatSessions();

  // Persist sidebar preference
  useEffect(() => {
    const stored = localStorage.getItem("agentkit_sidebar_open");
    if (stored !== null) setSidebarOpen(stored === "true");
  }, []);
  const toggleSidebar = () => setSidebarOpen((v) => {
    localStorage.setItem("agentkit_sidebar_open", String(!v));
    return !v;
  });

  useEffect(() => {
    if (!agentsLoading && agents.length === 0 && !createAgent.isPending && !createAgent.isSuccess) {
      createAgent.mutate(undefined);
    }
  }, [agentsLoading, agents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const activeAgent = agents[0];

  const loadSession = useCallback((sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setMessages(session.messages);
      setActiveSessionId(sessionId);
      setPendingAction(null);
    }
  }, [sessions]);

  const startNewChat = () => {
    setMessages([]);
    setActiveSessionId(null);
    setPendingAction(null);
    setInput("");
  };

  const pushMessage = useCallback((msg: ChatMessage, sessionId: string) => {
    setMessages((prev) => [...prev, msg]);
    appendMessage(sessionId, msg);
  }, [appendMessage]);

  // Build prior turns for AI context (text-only, no rich cards)
  const buildHistory = (msgs: ChatMessage[]) =>
    msgs
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

  const callAI = async (agentId: string, userText: string, contextPrefix?: string) => {
    const historyMsgs = buildHistory(messages);
    const messageToSend = contextPrefix ? `${contextPrefix}\n\nUser asked: ${userText}` : userText;
    const res = await fetch(`/api/agentkit/agents/${agentId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: messageToSend, history: historyMsgs }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail ?? data.error ?? "AI request failed");
    return data.reply as string;
  };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const session = createSession(text);
      sessionId = session.id;
      setActiveSessionId(session.id);
    }

    pushMessage({ role: "user", content: text }, sessionId);
    setInput("");
    setLoading(true);

    try {
      const lower = text.toLowerCase();

      // ── Draft proposal (multi-turn UX) ────────────────────────────────────
      if (pendingAction === "draft_proposal") {
        const titleMatch  = text.match(/title[:\s]+([^|,\n]+)/i);
        const descMatch   = text.match(/desc(?:ription)?[:\s]+([^|,\n]+)/i);
        const budgetMatch = text.match(/budget[:\s]+([\d.]+)/i);
        const title       = titleMatch?.[1]?.trim()  ?? text.slice(0, 40);
        const description = descMatch?.[1]?.trim()   ?? text;
        const budget      = budgetMatch?.[1]?.trim() ?? "100";

        const res = await fetch("/api/agentkit/proposals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, budget_required: budget }),
        });
        const result = await res.json();
        if (!res.ok) {
          pushMessage({ role: "agent", content: `Error: ${result.detail ?? result.error ?? "Failed to create proposal"}` }, sessionId);
        } else {
          pushMessage({ role: "agent", content: "", richContent: { type: "proposal_created", title, description, budget } as RichContent }, sessionId);
        }
        setPendingAction(null);
        return;
      }

      if ((lower.includes("draft") || lower.includes("write") || lower.includes("create")) && lower.includes("proposal")) {
        pushMessage({ role: "agent", content: "Sure! Tell me the details and I'll submit it.\n\nFormat: **Title:** … | **Description:** … | **Budget:** … USDC\n\nOr just describe it in plain text and I'll extract the details." }, sessionId);
        setPendingAction("draft_proposal");
        return;
      }

      // ── Research (animated card UX) ───────────────────────────────────────
      if (lower.includes("run research") || lower.includes("drug discovery") || lower.includes("quantum research") || lower.includes("finance analysis")) {
        const researchType: "drug_discovery" | "finance" | "quantum" =
          lower.includes("drug") || lower.includes("bio") || lower.includes("molecule") ? "drug_discovery"
          : lower.includes("finance") || lower.includes("portfolio") || lower.includes("risk") ? "finance"
          : "quantum";

        pushMessage({ role: "agent", content: "", richContent: { type: "research_progress", researchType, progress: 0 } as RichContent }, sessionId);
        await new Promise((r) => setTimeout(r, 3200));

        const resultMap: Record<string, Omit<Extract<RichContent, { type: "research_result" }>, "type">> = {
          drug_discovery: { researchType: "drug_discovery", compound: "ML-4872-B", target: "SARS-CoV-2 Mpro", binding_affinity: "-8.4 kcal/mol", selectivity: "94%", status: "Promising candidate" },
          finance:        { researchType: "finance",        portfolio: "DeFi-Mix-7",  var_95: "12.3%",        sharpe: "1.84",                     max_drawdown: "18.7%",     status: "Moderate risk" },
          quantum:        { researchType: "quantum",        circuit: "QFT-16q",       original_gates: 847,    optimized_gates: 312,               depth_reduction: "63%",    status: "Optimized" },
        };
        const resultMsg: ChatMessage = { role: "agent", content: "", richContent: { type: "research_result", ...resultMap[researchType] } as RichContent };
        setMessages((prev) => {
          const next = [...prev];
          const idx = next.findLastIndex((m) => m.richContent?.type === "research_progress");
          if (idx !== -1) next[idx] = resultMsg; else next.push(resultMsg);
          return next;
        });
        appendMessage(sessionId, resultMsg);
        return;
      }

      if (!activeAgent) {
        pushMessage({ role: "agent", content: "Your personal agent is still being set up — please wait a moment and try again!" }, sessionId);
        return;
      }

      const agentId = activeAgent.agent_id;

      // ── Proposal analysis — run structured analysis, show rich card ────────
      if ((lower.includes("analyz") || (lower.includes("fund") && lower.includes("proposal"))) && !lower.includes("draft")) {
        const proposalsRes = await fetch("/api/agentkit/proposals");
        const proposals: Array<{ proposal_id: string; title: string; status: string }> = await proposalsRes.json();
        const target = proposals.find((p) => p.status === "active") ?? proposals[0];
        if (!target) {
          const reply = await callAI(agentId, text, "There are currently no proposals in the system.");
          pushMessage({ role: "agent", content: reply }, sessionId);
          return;
        }
        const res = await fetch(`/api/agentkit/agents/${agentId}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposal_id: target.proposal_id }),
        });
        const result = await res.json();
        if (!res.ok) {
          const reply = await callAI(agentId, text, `Analysis failed: ${result.detail ?? result.error}`);
          pushMessage({ role: "agent", content: reply }, sessionId);
          return;
        }
        pushMessage({ role: "agent", content: "", richContent: { type: "proposal_analysis", title: target.title, should_fund: result.should_fund, confidence: result.confidence, funding_amount: result.funding_amount, reasoning: result.reasoning } }, sessionId);
        return;
      }

      // ── Wallet — fetch balance, show rich card ────────────────────────────
      if (lower.includes("balance") || lower.includes("wallet")) {
        const res = await fetch("/api/agentkit/wallet");
        const result = await res.json();
        if (!res.ok || result.error) {
          const reply = await callAI(agentId, text, "The user does not have a wallet set up yet.");
          pushMessage({ role: "agent", content: reply }, sessionId);
          return;
        }
        pushMessage({ role: "agent", content: "", richContent: { type: "wallet", address: result.address ?? result.wallet_address ?? "—", usdc: result.usdc ?? "0", eth: result.eth ?? "0" } }, sessionId);
        return;
      }

      // ── Marketplace — fetch agents, show rich card ────────────────────────
      if (lower.includes("marketplace") || lower.includes("available agents") || lower.includes("show me agents") || lower.includes("browse agent")) {
        const res = await fetch("/api/agentkit/marketplace");
        const workers = await res.json();
        const list: Array<{ agent_name: string; agent_id?: string }> = Array.isArray(workers) ? workers : [];
        if (list.length > 0) {
          pushMessage({ role: "agent", content: "", richContent: { type: "marketplace", total: list.length, agents: list.slice(0, 8) } }, sessionId);
        } else {
          const reply = await callAI(agentId, text, "The marketplace currently has no registered agents.");
          pushMessage({ role: "agent", content: reply }, sessionId);
        }
        return;
      }

      // ── Everything else — real Claude response ────────────────────────────
      const reply = await callAI(agentId, text);
      pushMessage({ role: "agent", content: reply }, sessionId);

    } catch (err) {
      pushMessage({ role: "agent", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` }, sessionId!);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        <div className="absolute h-[260px] w-[260px] rounded-full opacity-20 blur-[80px]" style={{ left: "10%", top: "-40px", background: "radial-gradient(circle, rgba(245,158,11,0.65) 0%, transparent 70%)" }} />
        <div className="absolute h-[220px] w-[220px] rounded-full opacity-15 blur-[70px]" style={{ right: "10%", top: "-30px", background: "radial-gradient(circle, rgba(167,139,250,0.6) 0%, transparent 70%)" }} />
      </div>

      <PageHeader icon={MessageSquare} label="AgentKit" title="Chat" description="Natural language interface with your AI agent." glow="amber">
        {activeAgent ? (
          <Badge variant="outline" className="border-emerald-400/30 text-emerald-400"><Bot className="mr-1 h-3 w-3" />{activeAgent.agent_name}</Badge>
        ) : createAgent.isPending || agentsLoading ? (
          <Badge variant="outline" className="border-white/20 text-white/40">Setting up agent…</Badge>
        ) : null}
      </PageHeader>

      <div className="relative z-10 flex gap-0 p-6" style={{ height: "calc(100vh - 280px)" }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <motion.div
          animate={{ width: sidebarOpen ? 220 : 44 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="flex shrink-0 flex-col overflow-hidden rounded-2xl ring-1 ring-white/8 mr-3"
          style={{ background: "rgba(255,255,255,0.025)" }}
        >
          <div className="flex h-10 shrink-0 items-center justify-between px-3 border-b border-white/6">
            <AnimatePresence>
              {sidebarOpen && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={startNewChat}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-400/80 transition hover:bg-amber-400/10 hover:text-amber-400"
                >
                  <Plus className="h-3.5 w-3.5" /> New Chat
                </motion.button>
              )}
            </AnimatePresence>
            <button
              onClick={toggleSidebar}
              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-white/30 transition hover:bg-white/8 hover:text-white/60"
            >
              {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>

          <ScrollArea className="flex-1">
            {sidebarOpen ? (
              <div className="space-y-0.5 p-2">
                {sessions.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <MessagesSquare className="h-5 w-5 text-white/15" />
                    <p className="text-[10px] text-white/25">No chats yet</p>
                  </div>
                ) : (
                  sessions.map((session, i) => (
                    <motion.div
                      key={session.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className={`group flex cursor-pointer items-start gap-1 rounded-xl px-2.5 py-2 transition-colors ${activeSessionId === session.id ? "bg-white/[0.07] border-l-2 border-amber-400" : "hover:bg-white/[0.04]"}`}
                      onClick={() => loadSession(session.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-white/80 leading-tight">{session.title}</p>
                        <p className="mt-0.5 text-[10px] text-white/30">{relativeTime(session.updatedAt)}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); if (activeSessionId === session.id) startNewChat(); }}
                        className="mt-0.5 shrink-0 rounded p-0.5 text-white/0 transition group-hover:text-white/25 hover:!text-white/60"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-3">
                {sessions.slice(0, 8).map((session) => (
                  <button
                    key={session.id}
                    onClick={() => { setSidebarOpen(true); loadSession(session.id); }}
                    title={session.title}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition hover:bg-white/8 ${activeSessionId === session.id ? "bg-amber-400/15 text-amber-400" : "text-white/30"}`}
                  >
                    <MessagesSquare className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </motion.div>

        {/* ── Main chat area ───────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-3 min-w-0">
          <ScrollArea
            className="flex-1 rounded-2xl p-4 ring-1 ring-white/8"
            style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)" }}
          >
            <AnimatePresence initial={false}>
              {messages.length === 0 ? (
                <motion.div key="starters" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex h-full flex-col items-center justify-center gap-6 py-8"
                >
                  <p className="text-[13px] text-white/30">What would you like to do?</p>
                  <div className="grid w-full max-w-lg grid-cols-2 gap-3">
                    {STARTERS.map((s) => (
                      <button key={s.label} onClick={() => send(s.prompt)}
                        className="group relative overflow-hidden rounded-2xl p-4 text-left ring-1 ring-white/8 transition-all duration-200 hover:scale-[1.02] hover:ring-white/20"
                        style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(12px)" }}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${s.hoverGradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                        <div className="relative z-10 flex items-center gap-2">
                          <s.icon className={`h-4 w-4 ${s.iconClass}`} />
                          <p className="text-sm font-semibold text-white/80 transition-colors group-hover:text-white">{s.label}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4 pb-2">
                  {messages.map((msg, i) =>
                    msg.role === "user" ? (
                      <motion.div key={i} initial={{ opacity: 0, y: 6, x: 12 }} animate={{ opacity: 1, y: 0, x: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
                        className="ml-auto max-w-[80%] rounded-2xl bg-indigo-500/20 px-4 py-3 text-white ring-1 ring-indigo-400/15"
                      >
                        <p className="whitespace-pre-wrap text-[13px]">{msg.content}</p>
                      </motion.div>
                    ) : (
                      <motion.div key={i} initial={{ opacity: 0, y: 6, x: -12 }} animate={{ opacity: 1, y: 0, x: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
                        className="mr-auto max-w-[92%]"
                      >
                        <div className="rounded-2xl px-4 py-3 ring-1 ring-white/6" style={{ background: "rgba(255,255,255,0.05)" }}>
                          <RichMessageRenderer content={msg.content} richContent={msg.richContent} />
                        </div>
                      </motion.div>
                    )
                  )}
                  {loading && (
                    <motion.div key="typing" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="mr-auto max-w-[92%] rounded-2xl px-4 py-3 ring-1 ring-white/6"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <div className="flex gap-1.5 py-0.5">
                        {[0, 0.15, 0.3].map((delay, k) => (
                          <motion.span key={k}
                            animate={{ opacity: [0.2, 0.8, 0.2], y: [0, -3, 0] }}
                            transition={{ repeat: Infinity, duration: 1, delay, ease: "easeInOut" }}
                            className="block h-1.5 w-1.5 rounded-full bg-white/40"
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </AnimatePresence>
          </ScrollArea>

          <div className="flex gap-2">
            <Textarea
              placeholder={pendingAction === "draft_proposal" ? "Describe your proposal… (Title: … | Description: … | Budget: … USDC)" : "Ask your agent anything…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              className="min-h-[44px] resize-none border-white/10 bg-white/[0.025] text-white"
              rows={1}
            />
            <Button onClick={() => send(input)} disabled={!input.trim() || loading} className="shrink-0 bg-amber-600 hover:bg-amber-700">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
