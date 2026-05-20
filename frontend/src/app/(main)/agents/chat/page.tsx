"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, DollarSign, Store, BarChart3, Search, AlertCircle } from "lucide-react";
import Link from "next/link";

const STARTERS = [
  { label: "Fund a Proposal", prompt: "I want to fund a research proposal", icon: DollarSign, color: "text-violet-400" },
  { label: "Browse Marketplace", prompt: "Show me available agents in the marketplace", icon: Store, color: "text-cyan-400" },
  { label: "Check my balance", prompt: "What is my current wallet balance and transaction history?", icon: BarChart3, color: "text-emerald-400" },
  { label: "Analyze a proposal", prompt: "Analyze the top funded active proposal and tell me if I should fund it", icon: Search, color: "text-amber-400" },
] as const;

type Message = {
  role: "user" | "agent";
  content: string;
  metadata?: { should_fund?: boolean; confidence?: number; funding_amount?: string };
};

type AgentItem = { agent_id: string; agent_name: string; config: Record<string, unknown> };

export default function AgentsChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: agentsData } = useQuery<{ agents: AgentItem[] }>({
    queryKey: ["agentkit", "agents"],
    queryFn: async () => {
      const res = await fetch("/api/agentkit/agents");
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });

  const { data: proposalsData } = useQuery<unknown[]>({
    queryKey: ["agentkit", "proposals"],
    queryFn: async () => {
      const res = await fetch("/api/agentkit/proposals");
      if (!res.ok) throw new Error("Failed to fetch proposals");
      return res.json();
    },
  });

  const activeAgent = agentsData?.agents?.[0];

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Route intent to the right backend endpoint
      const lower = text.toLowerCase();

      if ((lower.includes("analyz") || lower.includes("fund")) && lower.includes("proposal")) {
        if (!activeAgent) {
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: "No agent found. Create one first via the Marketplace page." },
          ]);
          return;
        }

        // Pick first active proposal
        const proposals = proposalsData as Array<{ proposal_id: string; title: string; status: string }> ?? [];
        const target = proposals.find((p) => p.status === "active") ?? proposals[0];

        if (!target) {
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: "No proposals found to analyze. Create one first." },
          ]);
          return;
        }

        const res = await fetch(`/api/agentkit/agents/${activeAgent.agent_id}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposal_id: target.proposal_id }),
        });
        const result = await res.json();

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: `Error: ${result.detail ?? result.error ?? "Analysis failed"}` },
          ]);
          return;
        }

        const decision = result.should_fund ? "✅ Recommends funding" : "❌ Does not recommend funding";
        const reply = `**Analysis of "${target.title}"**\n\n${decision}\nFunding amount: ${result.funding_amount} USDC\nConfidence: ${result.confidence}%\n\n${result.reasoning}`;
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: reply, metadata: { should_fund: result.should_fund, confidence: result.confidence, funding_amount: result.funding_amount } },
        ]);

      } else if (lower.includes("balance") || lower.includes("wallet")) {
        const res = await fetch("/api/agentkit/wallet");
        const result = await res.json();

        if (!res.ok || result.error) {
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: "No wallet found. Create one via the Wallet page." },
          ]);
          return;
        }

        setMessages((prev) => [
          ...prev,
          { role: "agent", content: `Your wallet **${result.usdc ?? result.wallet_address ?? "—"}**\n\nUSDC Balance: ${result.usdc ?? "0.00"}\nETH Balance: ${result.eth ?? "0.000"}` },
        ]);

      } else if (lower.includes("marketplace") || lower.includes("agent")) {
        const res = await fetch("/api/agentkit/marketplace");
        const result = await res.json();
        const agents = Array.isArray(result) ? result : result.agents ?? [];
        const names = agents.slice(0, 5).map((a: { agent_name: string }) => `• ${a.agent_name}`).join("\n");
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: `Found ${agents.length} agent(s) in the marketplace:\n\n${names || "None yet"}` },
        ]);

      } else {
        // Generic: list proposals
        const proposals = proposalsData as Array<{ title: string; budget_raised: string; budget_required: string }> ?? [];
        const list = proposals.slice(0, 3).map((p) => `• ${p.title} — ${p.budget_raised}/${p.budget_required} USDC`).join("\n");
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: `Here's what I found:\n\n${list || "No data available yet. Try creating a proposal or connecting a wallet."}\n\nYou can ask me to: analyze proposals, check balance, or browse marketplace.` },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: `Network error: ${err instanceof Error ? err.message : "Unknown error"}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Chat</h1>
        {activeAgent ? (
          <Badge variant="outline" className="text-emerald-400">
            Agent: {activeAgent.agent_name}
          </Badge>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4" />
            <span>No agent — </span>
            <Link href="/agents/marketplace" className="underline">create one</Link>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 rounded-lg border border-white/10 bg-white/[0.015] p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 py-12">
            <p className="text-white/40">What would you like to do?</p>
            <div className="grid grid-cols-2 gap-3">
              {STARTERS.map((s) => (
                <Card
                  key={s.label}
                  className="cursor-pointer border-white/10 bg-white/[0.025] transition-colors hover:bg-white/[0.05]"
                  onClick={() => send(s.prompt)}
                >
                  <CardHeader className="flex flex-row items-center gap-2 p-3">
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                    <CardTitle className="text-sm text-white">{s.label}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "ml-auto max-w-[80%] bg-indigo-500/20 text-white"
                    : "mr-auto max-w-[90%] bg-white/[0.05] text-white/90"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                {msg.metadata && (
                  <div className="mt-2 flex gap-2">
                    <Badge className={msg.metadata.should_fund ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>
                      {msg.metadata.should_fund ? "Fund" : "Skip"}
                    </Badge>
                    <Badge variant="outline" className="text-white/60">
                      {msg.metadata.confidence}% confidence
                    </Badge>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-auto max-w-[90%] rounded-lg bg-white/[0.05] px-4 py-3">
                <div className="flex gap-1">
                  <span className="animate-bounce text-white/40">●</span>
                  <span className="animate-bounce text-white/40 [animation-delay:0.1s]">●</span>
                  <span className="animate-bounce text-white/40 [animation-delay:0.2s]">●</span>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="mt-4 flex gap-2">
        <Textarea
          placeholder="Ask your agent anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          className="min-h-[44px] resize-none border-white/10 bg-white/[0.025] text-white"
          rows={1}
        />
        <Button onClick={() => send(input)} disabled={loading} size="icon" className="shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
