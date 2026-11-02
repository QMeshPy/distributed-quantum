"use client";

import { useContext } from "react";
import { AgentLlmProviderContext } from "./agent-llm-provider-context";

export function useAgentLlmProvider() {
  const context = useContext(AgentLlmProviderContext);
  if (!context) {
    throw new Error("useAgentLlmProvider must be used within AgentLlmProviderProvider");
  }
  return context;
}
