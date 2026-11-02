"use client";

import { useAgentLlmProvider } from "../llm-provider/use-agent-llm-provider";
import { LLM_PROVIDER_LABELS, type AgentLlmProvider } from "../llm-provider/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

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
        className={`h-8 rounded-md ring-1 ring-white/10 ${
          variant === "composer" ? "w-[200px]" : "w-[140px]"
        }`}
        style={{ background: "rgba(255,255,255,0.025)" }}
      />
    );
  }

  return (
    <Select value={provider} onValueChange={handleChange}>
      <SelectTrigger
        className={`h-8 border-none ring-1 ring-white/10 bg-white/[0.025] text-white hover:bg-white/[0.04] ${
          variant === "composer" ? "w-[200px]" : "w-[140px]"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-400/70" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent
        className="border-white/10 bg-black/95 text-white"
        style={{ backdropFilter: "blur(12px)" }}
      >
        {providers.map((p) => (
          <SelectItem
            key={p.id}
            value={p.id}
            disabled={!p.configured}
            className={`${
              p.id === provider
                ? "bg-amber-500/15 text-amber-200"
                : "hover:bg-white/5"
            } ${!p.configured ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span>{p.label}</span>
              {!p.configured && (
                <span className="text-[10px] text-white/40">(not configured)</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
