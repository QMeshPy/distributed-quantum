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
};

const STORAGE_KEY = "agentkit_chat_sessions";
const MAX_SESSIONS = 50;

function load(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  useEffect(() => {
    setSessions(load());
  }, []);

  const createSession = useCallback((firstMessage: string): ChatSession => {
    const title = firstMessage.replace(/[*_`#]/g, "").slice(0, 42).trim() + (firstMessage.length > 42 ? "…" : "");
    const session: ChatSession = {
      id: crypto.randomUUID(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions((prev) => {
      const next = [session, ...prev];
      save(next);
      return next;
    });
    return session;
  }, []);

  const appendMessage = useCallback((sessionId: string, message: ChatMessage) => {
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === sessionId
          ? { ...s, messages: [...s.messages, message], updatedAt: Date.now() }
          : s
      );
      save(next);
      return next;
    });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);
      save(next);
      return next;
    });
  }, []);

  const getSession = useCallback(
    (sessionId: string) => sessions.find((s) => s.id === sessionId),
    [sessions]
  );

  return { sessions, createSession, appendMessage, deleteSession, getSession };
}
