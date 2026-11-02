import type { AgentLlmProvider } from "./constants";

export type ProviderInfo = {
  id: AgentLlmProvider;
  label: string;
  configured: boolean;
};

const IDS = new Set<AgentLlmProvider>(["groq", "openrouter", "near"]);

export const FALLBACK_LLM_PROVIDERS: ProviderInfo[] = [
  { id: "groq", label: "Groq", configured: true },
  { id: "openrouter", label: "OpenRouter", configured: false },
  { id: "near", label: "NEAR AI Cloud", configured: false },
];

function isProvider(value: unknown): value is ProviderInfo {
  if (!value || typeof value !== "object") return false;
  const row = value as { id?: unknown; label?: unknown; configured?: unknown };
  return (
    typeof row.id === "string" &&
    IDS.has(row.id as AgentLlmProvider) &&
    typeof row.label === "string" &&
    typeof row.configured === "boolean"
  );
}

export function parseLlmProvidersPayload(
  status: number,
  data: unknown,
): { providers: ProviderInfo[]; defaultProvider: string | null } | null {
  if (status !== 200 || !data || typeof data !== "object") return null;
  const record = data as { default?: unknown; providers?: unknown };
  if (!Array.isArray(record.providers)) return null;
  const providers = record.providers.filter(isProvider);
  if (providers.length === 0) return null;
  return {
    providers,
    defaultProvider: typeof record.default === "string" ? record.default : null,
  };
}
