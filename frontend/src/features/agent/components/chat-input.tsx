"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { useState } from "react";
import { useSendMessage } from "../hooks/use-send-message";
import { AGENT_LIMITS } from "@/constants/agent";

interface ChatInputProps {
  sessionId: string | null;
}

export function ChatInput({ sessionId }: ChatInputProps) {
  const [input, setInput] = useState("");
  const sendMessage = useSendMessage(sessionId);

  const handleSend = () => {
    if (!input.trim() || !sessionId) return;

    sendMessage.mutate(
      { content: input },
      {
        onSuccess: () => {
          setInput("");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/10 p-4">
      <div className="max-w-3xl mx-auto flex gap-2">
        <Textarea
          placeholder="Describe your experiment goal..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="resize-none"
          rows={1}
          maxLength={AGENT_LIMITS.MAX_MESSAGE_LENGTH}
          disabled={!sessionId || sendMessage.isPending}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || !sessionId || sendMessage.isPending}
          size="icon"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      {input.length > AGENT_LIMITS.MAX_MESSAGE_LENGTH * 0.9 && (
        <div className="text-xs text-white/40 text-center mt-2">
          {input.length} / {AGENT_LIMITS.MAX_MESSAGE_LENGTH} characters
        </div>
      )}
    </div>
  );
}
