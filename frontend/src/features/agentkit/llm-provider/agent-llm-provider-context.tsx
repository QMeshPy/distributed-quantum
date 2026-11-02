"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import { LLM_PROVIDER_STORAGE_KEY, type AgentLlmProvider } from "./constants";
import {
  FALLBACK_LLM_PROVIDERS,
  parseLlmProvidersPayload,
  type ProviderInfo,
} from "./parse-providers";

type AgentLlmProviderContextValue = {
  provider: AgentLlmProvider;
  setProvider: (provider: AgentLlmProvider) => void;
  providers: ProviderInfo[];
  loading: boolean;
};

export const AgentLlmProviderContext = createContext<AgentLlmProviderContextValue | null>(null);

export function AgentLlmProviderProvider({ children }: { children: ReactNode }) {
  const [provider, setProviderState] = useState<AgentLlmProvider>("groq");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Hydrate from backend on mount
  useEffect(() => {
    let cancelled = false;

    // First, try to read from localStorage
    const stored = localStorage.getItem(LLM_PROVIDER_STORAGE_KEY);
    if (stored && (stored === "groq" || stored === "openrouter" || stored === "near")) {
      setProviderState(stored);
    }

    // Then fetch from backend to get default and provider list
    fetch("/api/agentkit/agents/llm-providers")
      .then(async (res) => {
        const data: unknown = await res.json().catch(() => null);
        return parseLlmProvidersPayload(res.status, data);
      })
      .then((parsed) => {
        if (cancelled) return;
        if (!parsed) {
          setProviders(FALLBACK_LLM_PROVIDERS);
          setLoading(false);
          return;
        }

        setProviders(parsed.providers);

        if (!stored && (parsed.defaultProvider === "groq" || parsed.defaultProvider === "openrouter" || parsed.defaultProvider === "near")) {
          setProviderState(parsed.defaultProvider);
          localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, parsed.defaultProvider);
        }

        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setProviders(FALLBACK_LLM_PROVIDERS);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setProvider = (newProvider: AgentLlmProvider) => {
    setProviderState(newProvider);
    localStorage.setItem(LLM_PROVIDER_STORAGE_KEY, newProvider);
  };

  return (
    <AgentLlmProviderContext.Provider value={{ provider, setProvider, providers, loading }}>
      {children}
    </AgentLlmProviderContext.Provider>
  );
}
