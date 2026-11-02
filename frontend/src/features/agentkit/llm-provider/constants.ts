export const LLM_PROVIDER_STORAGE_KEY = "quantum_agent_llm_provider";

export const LLM_PROVIDER_LABELS: Record<string, string> = {
  groq: "Groq",
  openrouter: "OpenRouter",
  near: "NEAR AI Cloud",
};

export type AgentLlmProvider = "groq" | "openrouter" | "near";
