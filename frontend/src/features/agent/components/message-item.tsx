"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ThinkingBlock } from "./thinking-block";
import type { AttestationSummary, Message } from "../types";

interface MessageItemProps {
  message: Message;
}

export function AttestationBadge({ attestation }: { attestation: AttestationSummary }) {
  const detail = `Model: ${attestation.model} | Signature: ${attestation.signature_kind} | Rounds: ${attestation.rounds}${
    attestation.request_id ? ` | Request ID: ${attestation.request_id}` : ""
  }`;
  switch (attestation.status) {
    case "model_tee_verified":
      return (
        <Badge
          variant="outline"
          title={detail}
          className="border-emerald-400/30 bg-emerald-500/10 text-emerald-300 text-[11px]"
        >
          Model TEE verified · {attestation.model}
        </Badge>
      );
    case "gateway_verified":
      return (
        <Badge
          variant="outline"
          title={detail}
          className="border-amber-400/30 bg-amber-500/10 text-amber-300 text-[11px]"
        >
          Gateway verified · {attestation.model}
        </Badge>
      );
    case "unverified":
      return (
        <Badge
          variant="outline"
          title={detail}
          className="border-rose-400/30 bg-rose-500/10 text-rose-300 text-[11px]"
        >
          Unverified · {attestation.model}
        </Badge>
      );
    default: {
      const _exhaustive: never = attestation.status;
      return _exhaustive;
    }
  }
}

export function MessageItem({ message }: MessageItemProps) {
  const isAgent = message.role === "agent";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <Badge variant="outline" className="text-xs">
          {message.content}
        </Badge>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", !isAgent && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback>
          {isAgent ? "🤖" : "👤"}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 space-y-2 max-w-2xl">
        <Card className={cn(
          !isAgent && "bg-indigo-500/10 border-indigo-500/20"
        )}>
          <CardContent className="p-4">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </CardContent>
        </Card>

        {/* Agent Thinking (collapsible) */}
        {message.metadata?.thinking && (
          <ThinkingBlock thinking={message.metadata.thinking} />
        )}

        {/* Actions Taken */}
        {message.metadata?.actions && message.metadata.actions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.metadata.actions.map((action, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                Ran: {action}
              </Badge>
            ))}
          </div>
        )}

        {/* Private Inference Attestation */}
        {(message.attestation ?? message.metadata?.attestation) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            <AttestationBadge attestation={(message.attestation ?? message.metadata?.attestation)!} />
          </div>
        )}
      </div>
    </div>
  );
}
