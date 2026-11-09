"use client";

import { Avatar } from "@/components/arc/avatar/avatar";
import { Panel, PanelContent } from "@/shared/components/panel/panel";
import { Badge } from "@/components/arc/badge/badge";
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
          outline
          title={detail}
          className="border-success/30 bg-success/10 text-success text-xs"
        >
          Model TEE verified · {attestation.model}
        </Badge>
      );
    case "gateway_verified":
      return (
        <Badge
          outline
          title={detail}
          className="border-warning/30 bg-warning/10 text-warning text-xs"
        >
          Gateway verified · {attestation.model}
        </Badge>
      );
    case "unverified":
      return (
        <Badge
          outline
          title={detail}
          className="border-danger/30 bg-danger/10 text-danger text-xs"
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
        <Badge outline className="text-xs">
          {message.content}
        </Badge>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", !isAgent && "flex-row-reverse")}>
      <Avatar size="sm" className="shrink-0" name={isAgent ? "Agent" : "You"} />

      <div className="flex-1 space-y-2 max-w-2xl">
        <Panel className={cn(
          !isAgent && "bg-accent/10 border-accent/20"
        )}>
          <PanelContent className="p-4">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </PanelContent>
        </Panel>

        {/* Agent Thinking (collapsible) */}
        {message.metadata?.thinking && (
          <ThinkingBlock thinking={message.metadata.thinking} />
        )}

        {/* Actions Taken */}
        {message.metadata?.actions && message.metadata.actions.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.metadata.actions.map((action, idx) => (
              <Badge key={idx} outline className="text-xs">
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
