"use client";

import { AgentLlmProviderProvider } from "@/features/agentkit/llm-provider/agent-llm-provider-context";

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <AgentLlmProviderProvider>{children}</AgentLlmProviderProvider>;
}
