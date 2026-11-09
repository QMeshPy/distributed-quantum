"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentSession } from "../hooks/use-agent-session";
import { useAgentStream } from "../hooks/use-agent-stream";
import { useAgentStore } from "../stores/agent-store";
import { AttestationBadge, MessageItem } from "./message-item";
import { ApprovalCard } from "./approval-card";
import { ChatInput } from "./chat-input";
import { useEffect, useRef } from "react";

interface ConversationPanelProps {
  sessionId: string | null;
}

export function ConversationPanel({ sessionId }: ConversationPanelProps) {
  const { data: session } = useAgentSession(sessionId);
  const pendingApproval = useAgentStore((s) => s.pendingApproval);
  const scrollRef = useRef<HTMLDivElement>(null);

  // WebSocket streaming
  useAgentStream(sessionId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages.length]);

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">No Session Selected</h3>
          <p className="text-sm text-white/60">
            Create a new session or select an existing one to start
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        <div className="space-y-6 max-w-3xl mx-auto">
          {session?.messages.length === 0 && (
            <div className="text-center py-12">
              <h3 className="text-lg font-semibold mb-2">
                Welcome to Agent Mode
              </h3>
              <p className="text-sm text-white/60 max-w-md mx-auto">
                Describe your experiment goals in natural language. The agent will
                understand your intent and orchestrate the necessary tools automatically.
              </p>
            </div>
          )}

          {session?.messages.map((message) => (
            <MessageItem key={message.id} message={message} />
          ))}

          {/* Pending Approval */}
          {pendingApproval && pendingApproval.sessionId === sessionId && (
            <div className="mt-6">
              <ApprovalCard
                approval={pendingApproval.data}
                sessionId={sessionId}
              />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <ChatInput sessionId={sessionId} />
    </div>
  );
}

export { AttestationBadge };

