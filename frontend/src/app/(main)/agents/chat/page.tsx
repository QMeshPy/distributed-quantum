"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/shared/components/layout/page-header";
import {
  Send, DollarSign, Store, BarChart3, Search,
  MessageSquare, Bot, PenLine, FlaskConical,
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
  { label: "My Proposals",       prompt: "Show me all my research proposals",                                icon: Search,       iconClass: "text-violet-400",  hoverGradient: "from-violet-500/20 via-violet-600/8 to-transparent" },
  { label: "Browse Marketplace", prompt: "What agents are available in the marketplace?",                    icon: Store,        iconClass: "text-cyan-400",    hoverGradient: "from-cyan-500/20 via-cyan-600/8 to-transparent" },
  { label: "Check my balance",   prompt: "What is my current wallet balance?",                               icon: BarChart3,    iconClass: "text-emerald-400", hoverGradient: "from-emerald-500/20 via-emerald-600/8 to-transparent" },
  { label: "Analyze Proposals",  prompt: "Analyze my proposals and tell me which I should fund",             icon: DollarSign,   iconClass: "text-amber-400",   hoverGradient: "from-amber-500/20 via-amber-600/8 to-transparent" },
  { label: "Draft Proposal",     prompt: "Help me draft a new research proposal",                            icon: PenLine,      iconClass: "text-rose-400",    hoverGradient: "from-rose-500/20 via-rose-600/8 to-transparent" },
  { label: "Run Research",       prompt: "Run a drug discovery research simulation",                         icon: FlaskConical, iconClass: "text-teal-400",    hoverGradient: "from-teal-500/20 via-teal-600/8 to-transparent" },
];

function AgentsChatInner() {
  const searchParams = useSearchParams();
  const urlAgentId      = searchParams.get("agentId");
  const urlAgentName    = searchParams.get("name");
  const urlSpecialty    = searchParams.get("specialty");
  const urlSessionId    = searchParams.get("sessionId");
  const urlNew          = searchParams.get("new");
  const urlCapabilities = searchParams.get("capabilities")?.split(",").filter(Boolean) ?? [];

  const [messages, setMessages]               = useState<ChatMessage[]>([]);
  const [input, setInput]                     = useState("");
  const [loading, setLoading]                 = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [introShown, setIntroShown]           = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: agents = [], isLoading: agentsLoading } = useAgents();
  const createAgent = useCreateAgent();
  const { createSession, appendMessage, loadSession } = useChatSessions();

  // Auto-create agent if user has none
  useEffect(() => {
    if (!agentsLoading && agents.length === 0 && !createAgent.isPending && !createAgent.isSuccess) {
      createAgent.mutate(undefined);
    }
  }, [agentsLoading, agents.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to blank chat when ?new= param changes (New Chat button)
  useEffect(() => {
    if (!urlNew) return;
    setMessages([]);
    setActiveSessionId(null);
    setIntroShown(false);
    setInput("");
  }, [urlNew]);

  // Restore an existing session when navigating from history
  useEffect(() => {
    if (!urlSessionId) return;
    loadSession(urlSessionId).then((session) => {
      if (!session) return;
      setActiveSessionId(session.id);
      setMessages(session.messages);
    });
  }, [urlSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show persona intro once when arriving from marketplace
  useEffect(() => {
    if (introShown || !urlAgentName || urlSessionId) return;
    if (agentsLoading) return;
    setIntroShown(true);
    const activeAgent = urlAgentId
      ? (agents.find((a) => a.agent_id === urlAgentId) ?? agents[0])
      : agents[0];
    createSession(`Chat with ${urlAgentName}`, activeAgent?.agent_id ?? "").then((session) => {
      setActiveSessionId(session.id);
      const caps = urlCapabilities.length > 0
        ? `My expertise includes: **${urlCapabilities.join(", ")}**.`
        : "";
      const specialty = urlSpecialty ? ` I specialise in **${urlSpecialty}**.` : "";
      const intro: ChatMessage = {
        role: "agent",
        content:
          `Hi! I'm **${urlAgentName}**.${specialty} ${caps}\n\n` +
          `I can help you manage research proposals, check your wallet, browse the marketplace, and more. What would you like to do?`,
      };
      setMessages([intro]);
      appendMessage(session.id, intro);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentsLoading, urlAgentName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const activeAgent = urlAgentId
    ? (agents.find((a) => a.agent_id === urlAgentId) ?? agents[0])
    : agents[0];

  const pushMessage = useCallback((msg: ChatMessage, sessionId: string) => {
    setMessages((prev) => [...prev, msg]);
    appendMessage(sessionId, msg);
  }, [appendMessage]);

  const buildHistory = (msgs: ChatMessage[]) =>
    msgs
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      const agentId = activeAgent?.agent_id ?? "";
      const session = await createSession(text, agentId);
      sessionId = session.id;
      setActiveSessionId(session.id);
    }

    pushMessage({ role: "user", content: text }, sessionId);
    setInput("");
    setLoading(true);

    try {
      if (!activeAgent) {
        pushMessage({ role: "agent", content: "Your personal agent is still being set up — please wait a moment and try again!" }, sessionId);
        return;
      }

      const agentId = activeAgent.agent_id;
      const historyMsgs = buildHistory(messages);

      const res = await fetch(`/api/agentkit/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyMsgs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error ?? "AI request failed");
      pushMessage({ role: "agent", content: data.reply as string }, sessionId);
    } catch (err) {
      pushMessage({ role: "agent", content: `Error: ${err instanceof Error ? err.message : "Unknown error"}` }, sessionId!);
    } finally {
      setLoading(false);
    }
  };

  const displayName = urlAgentName ?? activeAgent?.agent_name;

  return (
    <div className="relative flex flex-col">
      {/* Ambient glows */}
      <div className="pointer-events-none absolute inset-x-6 top-0 overflow-hidden" style={{ height: "300px" }}>
        <div className="absolute h-[260px] w-[260px] rounded-full opacity-20 blur-[80px]" style={{ left: "10%", top: "-40px", background: "radial-gradient(circle, rgba(245,158,11,0.65) 0%, transparent 70%)" }} />
        <div className="absolute h-[220px] w-[220px] rounded-full opacity-15 blur-[70px]" style={{ right: "10%", top: "-30px", background: "radial-gradient(circle, rgba(167,139,250,0.6) 0%, transparent 70%)" }} />
      </div>

      <PageHeader icon={MessageSquare} label="AgentKit" title="Chat" description="Natural language interface with your AI agent." glow="amber">
        {displayName ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-400/30 text-emerald-400">
              <Bot className="mr-1 h-3 w-3" />{displayName}
            </Badge>
            {urlSpecialty && (
              <Badge variant="outline" className="border-cyan-400/30 text-cyan-400 text-[10px]">
                {urlSpecialty}
              </Badge>
            )}
            {urlCapabilities.slice(0, 2).map((cap) => (
              <Badge key={cap} variant="outline" className="border-white/20 text-white/50 text-[10px]">
                {cap}
              </Badge>
            ))}
          </div>
        ) : createAgent.isPending || agentsLoading ? (
          <Badge variant="outline" className="border-white/20 text-white/40">Setting up agent…</Badge>
        ) : null}
      </PageHeader>

      <div className="relative z-10 flex flex-col gap-4 p-6" style={{ height: "calc(100vh - 280px)" }}>
        <ScrollArea
          className="flex-1 rounded-2xl p-4 ring-1 ring-white/8"
          style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)" }}
        >
          <AnimatePresence initial={false}>
            {messages.length === 0 ? (
              <motion.div
                key="starters"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex h-full flex-col items-center justify-center gap-6 py-8"
              >
                <p className="text-[13px] text-white/30">What would you like to do?</p>
                <div className="grid w-full max-w-lg grid-cols-2 gap-3">
                  {STARTERS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => send(s.prompt)}
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
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6, x: 12 }}
                      animate={{ opacity: 1, y: 0, x: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="ml-auto max-w-[80%] rounded-2xl bg-indigo-500/20 px-4 py-3 text-white ring-1 ring-indigo-400/15"
                    >
                      <p className="whitespace-pre-wrap text-[13px]">{msg.content}</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6, x: -12 }}
                      animate={{ opacity: 1, y: 0, x: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="mr-auto max-w-[92%]"
                    >
                      <div className="rounded-2xl px-4 py-3 ring-1 ring-white/6" style={{ background: "rgba(255,255,255,0.05)" }}>
                        <RichMessageRenderer content={msg.content} richContent={msg.richContent} />
                      </div>
                    </motion.div>
                  )
                )}
                {loading && (
                  <motion.div
                    key="typing"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mr-auto max-w-[92%] rounded-2xl px-4 py-3 ring-1 ring-white/6"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    <div className="flex gap-1.5 py-0.5">
                      {[0, 0.15, 0.3].map((delay, k) => (
                        <motion.span
                          key={k}
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
            placeholder="Ask your agent anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            className="min-h-[44px] resize-none border-white/10 bg-white/[0.025] text-white"
            rows={1}
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 bg-amber-600 hover:bg-amber-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AgentsChatPage() {
  return (
    <Suspense>
      <AgentsChatInner />
    </Suspense>
  );
}
