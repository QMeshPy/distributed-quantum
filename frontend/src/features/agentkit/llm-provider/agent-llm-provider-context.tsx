"use client";

import { createContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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

function readStoredProvider(): AgentLlmProvider | null {
  const stored = localStorage.getItem(LLM_PROVIDER_STORAGE_KEY);
  return stored === "groq" || stored === "openrouter" || stored === "near" ? stored : null;
}

function subscribeToProvider(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function AgentLlmProviderProvider({ children }: { children: ReactNode }) {
  const storedProvider = useSyncExternalStore(subscribeToProvider, readStoredProvider, () => null);
  const [selectedProvider, setProviderState] = useState<AgentLlmProvider | null>(null);
  const provider = selectedProvider ?? storedProvider ?? "groq";
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Hydrate from backend on mount
  useEffect(() => {
    let cancelled = false;

    const stored = readStoredProvider();

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
