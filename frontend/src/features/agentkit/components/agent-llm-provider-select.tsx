"use client";

import { useAgentLlmProvider } from "../llm-provider/use-agent-llm-provider";
import { LLM_PROVIDER_LABELS, type AgentLlmProvider } from "../llm-provider/constants";
import { Select } from "@/components/arc/select/select";
import { toast } from "@/shared/lib/toast";

type AgentLlmProviderSelectProps = {
  variant?: "header" | "composer";
};

export function AgentLlmProviderSelect({ variant = "header" }: AgentLlmProviderSelectProps) {
  const { provider, setProvider, providers, loading } = useAgentLlmProvider();

  const handleChange = (value: string) => {
    if (value === provider) return;
    
    const newProvider = value as AgentLlmProvider;
    setProvider(newProvider);
    
    const label = LLM_PROVIDER_LABELS[newProvider] || newProvider;
    toast.success(`${label} activated`, {
      description: "Active for agent chat and analysis.",
    });
  };

  if (loading) {
    return (
      <div
        className={`h-8 rounded-md ring-1 ring-border ${
          variant ==="composer" ? "w-[200px]" : "w-[140px]"
        }`}
        style={{ background: "color-mix(in oklab, var(--foreground) 2.5%, transparent)" }}
      />
    );
  }

  return (
    <Select
      label="Model provider"
      value={provider}
      onValueChange={handleChange}
      options={providers.map((p) => ({ value: p.id, label: p.configured ? p.label : `${p.label} (not configured)`, disabled: !p.configured }))}
    />
  );
}
