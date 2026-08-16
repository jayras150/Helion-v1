"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/hooks/use-user";
import { Check, Copy, Edit3, Sparkles, Trash2 } from "lucide-react";
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
  id?: string;
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
  onEditMessage?: (index: number) => void;
  onDeleteMessage?: (index: number) => void;
}

/** Brand avatar for the HELION agent. */
function AgentAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm ring-1 ring-border">
      <Sparkles className="size-4" />
    </div>
  );
}

/** A branded, layered loader for the slower background generation path. */
function GenerationSpinner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full",
        compact ? "size-10" : "size-14",
      )}
      role="status"
      aria-label="Generating your app"
    >
      <div className="absolute inset-0 rounded-full bg-cyan-400/15 blur-lg" />
      <div className="absolute inset-0 animate-[spin_1.1s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,transparent_10deg,transparent_90deg,#22d3ee_180deg,#3b82f6_260deg,transparent_340deg)] p-[2px]">
        <div className="h-full w-full rounded-full bg-background/90" />
      </div>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-[0_0_20px_rgba(34,211,238,0.35)]",
          compact ? "size-5" : "size-7",
        )}
      >
        <Sparkles className={cn("animate-pulse", compact ? "size-3" : "size-4")} />
      </div>
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
  onEditMessage,
  onDeleteMessage,
}: ChatMessagesProps) {
  const streamingStartedRef = useRef(false);
  const { data: session } = useSession();
  const hasStreamingMessage = chatHistory.some((message) => message.isStreaming);

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
          {isLoading ? (
            <div className="py-8">
              <div className="mx-auto flex w-full max-w-2xl items-center gap-4 rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_12px_45px_-20px_rgba(34,211,238,0.55)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#0c1a3a]/85">
                <GenerationSpinner />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    Building your app
                    <span className="inline-flex gap-0.5" aria-hidden="true">
                      <span className="size-1 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.3s]" />
                      <span className="size-1 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.15s]" />
                      <span className="size-1 animate-bounce rounded-full bg-blue-500" />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    HELION is turning your idea into a working interface.
                  </p>
                </div>
              </div>
            </div>
          ) : (
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
          )}
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
            <MessageContent from={msg.type} className={msg.type === "user" ? "bg-gradient-to-br from-cyan-500 via-sky-500 to-blue-600 shadow-[0_8px_25px_-12px_rgba(14,165,233,0.9)]" : undefined}>
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
            {msg.type === "user" && !msg.isStreaming ? (
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm transition hover:border-cyan-400 hover:text-cyan-600"
                  onClick={() => {
                    void navigator.clipboard?.writeText(msg.content);
                  }}
                  title="Copy message"
                >
                  <Copy className="size-3" /> Copy
                </button>
                <button type="button" className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm transition hover:border-cyan-400 hover:text-cyan-600" onClick={() => onEditMessage?.(index)} title="Edit message">
                  <Edit3 className="size-3" /> Edit
                </button>
                <button type="button" className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow-sm transition hover:border-red-400 hover:text-red-600" onClick={() => onDeleteMessage?.(index)} title="Delete message">
                  <Trash2 className="size-3" /> Delete
                </button>
              </div>
            ) : null}
          </Message>
        ))}
        {isLoading && !hasStreamingMessage && chatHistory.length === 1 && chatHistory[0].type === "user" ? (
          <div className="py-8">
            <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/80 bg-white/90 p-6 shadow-[0_12px_45px_-20px_rgba(34,211,238,0.55)] backdrop-blur-xl dark:border-white/[0.1] dark:bg-[#0c1a3a]/85">
              <div className="flex items-center gap-4">
                <GenerationSpinner />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    Building your app
                    <span className="inline-flex gap-0.5" aria-hidden="true">
                      <span className="size-1 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.3s]" />
                      <span className="size-1 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.15s]" />
                      <span className="size-1 animate-bounce rounded-full bg-blue-500" />
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    HELION is turning your idea into a working interface.
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-2.5" aria-hidden="true">
                <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full w-2/5 animate-[shimmer_1.8s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
                </div>
                <div className="h-2 w-5/6 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full w-1/2 animate-[shimmer_2.1s_ease-in-out_infinite_200ms] rounded-full bg-gradient-to-r from-transparent via-sky-400 to-transparent" />
                </div>
                <div className="h-2 w-3/4 overflow-hidden rounded-full bg-muted/40">
                  <div className="h-full w-2/5 animate-[shimmer_1.6s_ease-in-out_infinite_400ms] rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        ) : isLoading && !hasStreamingMessage ? (
          <div className="flex items-center justify-center gap-3 py-5 text-xs text-muted-foreground">
            <GenerationSpinner compact />
            <span>HELION is generating…</span>
          </div>
        ) : null}
      </ConversationContent>
    </Conversation>
  );
}
