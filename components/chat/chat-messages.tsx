"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/hooks/use-user";
import { Sparkles } from "lucide-react";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
import { MessageRenderer } from "@/components/message-renderer";
import { StreamingText } from "@/components/chat/streaming-text";
import { parseScopeTag, SCOPE_LABELS, type Scope } from "@/lib/scope";
import { cn } from "@/lib/utils";

interface ChatMessage {
  type: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  stream?: ReadableStream<Uint8Array> | null;
}

interface ChatMessagesProps {
  chatHistory: ChatMessage[];
  isLoading: boolean;
  onStreamingComplete: (finalContent: string) => void;
  onStreamingStarted?: () => void;
}

/** Brand avatar for the HELION agent. */
function AgentAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm ring-1 ring-border">
      <Sparkles className="size-4" />
    </div>
  );
}

function getInitials(name?: string | null) {
  if (!name) {
    return "YOU";
  }
  // For emails, use the local part before the "@".
  const base = name.includes("@") ? name.split("@")[0] : name;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return base.slice(0, 2).toUpperCase();
}

const SCOPE_BADGE_COLORS: Record<string, string> = {
  frontend:
    "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  backend:
    "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  fullstack:
    "border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

function ScopeBadge({ scope }: { scope: Scope | null }) {
  if (!scope || scope === "text") {
    return null;
  }
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        SCOPE_BADGE_COLORS[scope],
      )}
    >
      {SCOPE_LABELS[scope]}
    </span>
  );
}

export function ChatMessages({
  chatHistory,
  isLoading,
  onStreamingComplete,
  onStreamingStarted,
}: ChatMessagesProps) {
  const streamingStartedRef = useRef(false);
  const { data: session } = useSession();

  // Reset the streaming started flag when a new message starts loading
  useEffect(() => {
    if (isLoading) {
      streamingStartedRef.current = false;
    }
  }, [isLoading]);

  if (chatHistory.length === 0) {
    return (
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          <Message
            from="assistant"
            name="HELION"
            avatar={<AgentAvatar />}
            className="pt-10"
          >
            <MessageContent from="assistant">
              Hi! 👋 I&apos;m <b>HELION</b>, your AI frontend engineer. Tell me
              what you want to build — I&apos;ll create a complete project you
              can preview right away.
            </MessageContent>
          </Message>
        </ConversationContent>
      </Conversation>
    );
  }

  return (
    <Conversation>
      <ConversationContent className="mx-auto w-full max-w-3xl">
        {chatHistory.map((msg, index) => (
          <Message
            from={msg.type}
            key={`message-${index}-${msg.type}`}
            name={msg.type === "user" ? "You" : "HELION"}
            badge={
              msg.type === "assistant" ? (
                <ScopeBadge scope={parseScopeTag(msg.content)} />
              ) : undefined
            }
            avatar={
              msg.type === "user" ? (
                <MessageAvatar
                  name={getInitials(session?.user?.name ?? session?.user?.email)}
                  className="bg-muted text-muted-foreground"
                />
              ) : (
                <AgentAvatar />
              )
            }
          >
            <MessageContent from={msg.type}>
              {msg.isStreaming && msg.stream ? (
                <StreamingText
                  stream={msg.stream}
                  onComplete={onStreamingComplete}
                  onChunk={() => {
                    // Hide external loader once we start receiving content (only once)
                    if (onStreamingStarted && !streamingStartedRef.current) {
                      streamingStartedRef.current = true;
                      onStreamingStarted();
                    }
                  }}
                />
              ) : (
                <MessageRenderer
                  content={msg.content}
                  role={msg.type}
                  messageId={`msg-${index}`}
                />
              )}
            </MessageContent>
          </Message>
        ))}
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader size={16} className="text-gray-500 dark:text-gray-400" />
          </div>
        )}
      </ConversationContent>
    </Conversation>
  );
}
