"use client";

import { useCallback, useEffect, useState } from "react";
import type { RichContent } from "@/features/agentkit/components/rich-message-renderer";

export type ChatMessage = {
  role: "user" | "agent";
  content: string;
  richContent?: RichContent;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  agentId?: string;
};

function toLocalSession(raw: {
  session_id: string;
  title: string;
  messages: Array<{ role: string; content: string; richContent?: RichContent }>;
  agent_id: string;
  created_at: string;
  updated_at: string;
}): ChatSession {
  return {
    id: raw.session_id,
    title: raw.title,
    agentId: raw.agent_id,
    messages: raw.messages.map((m) => ({
      role: m.role === "user" ? "user" : "agent",
      content: m.content,
      richContent: m.richContent,
    })),
    createdAt: new Date(raw.created_at).getTime(),
    updatedAt: new Date(raw.updated_at).getTime(),
  };
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // Load all sessions from backend on mount
  useEffect(() => {
    fetch("/api/agentkit/chat-sessions")
      .then((r) => r.json())
      .then((data: unknown[]) => {
        if (!Array.isArray(data)) return;
        setSessions(
          data
            .map((d) => toLocalSession(d as Parameters<typeof toLocalSession>[0]))
            .sort((a, b) => b.updatedAt - a.updatedAt)
        );
      })
      .catch(() => {/* backend down - graceful degradation */});
  }, []);

  const createSession = useCallback(
    async (firstMessage: string, agentId: string = ""): Promise<ChatSession> => {
      const title =
        firstMessage.replace(/[*_`#]/g, "").slice(0, 42).trim() +
        (firstMessage.length > 42 ? "…" : "");

      try {
        const res = await fetch("/api/agentkit/chat-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: agentId, title }),
        });
        const raw = await res.json();
        const session = toLocalSession(raw);
        setSessions((prev) => [session, ...prev]);
        return session;
      } catch {
        // Fallback: local-only session (not persisted)
        const session: ChatSession = {
          id: crypto.randomUUID(),
          title,
          agentId,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setSessions((prev) => [session, ...prev]);
        return session;
      }
    },
    []
  );

  const appendMessage = useCallback(
    async (sessionId: string, message: ChatMessage) => {
      // Update local state immediately
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, message], updatedAt: Date.now() }
            : s
        )
      );

      // Persist to backend
      try {
        await fetch(`/api/agentkit/chat-sessions/${sessionId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              role: message.role,
              content: message.content,
              rich_content: message.richContent ?? null,
            },
          }),
        });
      } catch {
        // Silently ignore — message is already in local state
      }
    },
    []
  );

  const loadSession = useCallback(async (sessionId: string): Promise<ChatSession | null> => {
    try {
      const res = await fetch(`/api/agentkit/chat-sessions/${sessionId}`);
      if (!res.ok) return null;
      const raw = await res.json();
      const session = toLocalSession(raw);
      setSessions((prev) => {
        const exists = prev.some((s) => s.id === sessionId);
        if (exists) return prev.map((s) => (s.id === sessionId ? session : s));
        return [session, ...prev];
      });
      return session;
    } catch {
      return null;
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    try {
      await fetch(`/api/agentkit/chat-sessions/${sessionId}`, { method: "DELETE" });
    } catch {/* ignore */}
  }, []);

  const getSession = useCallback(
    (sessionId: string) => sessions.find((s) => s.id === sessionId),
    [sessions]
  );

  return { sessions, createSession, appendMessage, loadSession, deleteSession, getSession };
}
