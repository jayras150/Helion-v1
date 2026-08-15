import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import { useStreaming } from "@/contexts/streaming-context";
import { extractProjectFiles } from "@/lib/extract-files";
import {
  pollForCorrectedMessage,
  pollForNewAssistantMessage,
} from "@/lib/poll-corrected-message";
import { parseScopeTag } from "@/lib/scope";
import type { Chat, ChatMessage } from "@/types/chat";

/**
 * Fetches chat details and updates SWR cache.
 */
async function fetchAndCacheChatDetails(chatId: string): Promise<void> {
  try {
    const response = await fetch(`/api/chats/${chatId}`);
    if (response.ok) {
      const chatDetails = await response.json();
      mutate(`/api/chats/${chatId}`, chatDetails, false);
    } else {
      mutate(`/api/chats/${chatId}`, { id: chatId }, false);
    }
  } catch (error) {
    console.error("Error fetching chat details:", error);
    mutate(`/api/chats/${chatId}`, { id: chatId }, false);
  }
}

/**
 * Parses error response and returns appropriate error message.
 */
async function parseErrorResponse(
  response: Response,
): Promise<{ message: string; code?: string }> {
  const defaultMessage =
    "Sorry, there was an error processing your message. Please try again.";
  const rateLimitMessage =
    "You have exceeded your maximum number of messages for the day. Please try again later.";

  try {
    const errorData = await response.json();
    const code = errorData.code as string | undefined;

    if (errorData.message) {
      return { message: errorData.message, code };
    }
    if (errorData.error) {
      return { message: errorData.error, code };
    }
    if (response.status === 429) {
      return { message: rateLimitMessage, code };
    }
  } catch {
    if (response.status === 429) {
      return { message: rateLimitMessage };
    }
  }
  return { message: defaultMessage };
}

/**
 * Custom hook for managing chat state and interactions.
 *
 * Handles:
 * - Fetching and caching chat data via SWR
 * - Sending messages with streaming support
 * - Managing chat history and streaming states
 * - Handoff from homepage streaming context
 *
 * @param chatId - The unique identifier of the chat
 * @returns Chat state and handler functions
 */
export function useChat(chatId: string) {
  const router = useRouter();
  const { handoff, clearHandoff } = useStreaming();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const recoveryKeyRef = useRef<string | null>(null);

  const getStreamingBodyOrThrow = useCallback(async (response: Response) => {
    if (!response.ok) {
      const errorPayload = await parseErrorResponse(response);
      throw new Error(errorPayload.message);
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    return response.body;
  }, []);

  // Use SWR to fetch chat data
  const { data: currentChat, isLoading: isLoadingChat } = useSWR<Chat>(
    chatId ? `/api/chats/${chatId}` : null,
    {
      onError: (error) => {
        const status = (error as { status?: number })?.status;
        if (status === 404 || status === 403) {
          // Chat tidak ditemukan / bukan milik user — redirect balik ke home
          // tanpa membanjiri console (404 adalah kondisi yang wajar untuk
          // link chat yang sudah dihapus atau basi).
          router.push("/");
          return;
        }
        console.error("Error loading chat:", error);
        // Redirect to home if chat not found
        router.push("/");
      },
      onSuccess: (chat) => {
        // Update chat history with existing messages when chat loads
        // But skip if we have a handoff (streaming from homepage) to avoid duplicates
        if (
          chat.messages &&
          chatHistory.length === 0 &&
          !(handoff.chatId === chatId && handoff.stream)
        ) {
          setChatHistory(
            chat.messages.map((msg) => ({
              id: msg.id,
              type: msg.role,
              content: msg.content,
            })),
          );
        }
      },
    },
  );

  // Handle streaming from context (when redirected from homepage)
  useEffect(() => {
    if (handoff.chatId === chatId && handoff.stream && handoff.userMessage) {
      const userMessage = handoff.userMessage;

      // Add the user message to chat history
      setChatHistory((prev) => [
        ...prev,
        {
          type: "user",
          content: userMessage,
        },
      ]);

      // Start streaming the assistant response
      setIsStreaming(true);
      setChatHistory((prev) => [
        ...prev,
        {
          type: "assistant",
          content: "",
          isStreaming: true,
          stream: handoff.stream,
        },
      ]);

      // Clear the handoff immediately to prevent re-runs
      clearHandoff();
    }
  }, [chatId, handoff, clearHandoff]);

  // Background jobs live in Redis/DB, not in React memory. Recover the
  // loading state and resume polling when the user refreshes the browser.
  useEffect(() => {
    if (isLoadingChat || !currentChat?.messages?.length || handoff.stream) return;
    const messages = currentChat.messages;
    const last = messages[messages.length - 1];
    if (last.role !== "user") return;
    const key = `${chatId}:${last.id}`;
    if (recoveryKeyRef.current === key) return;
    recoveryKeyRef.current = key;

    let cancelled = false;
    const recover = async () => {
      try {
        const statusResponse = await fetch(`/api/chat/run?chatId=${encodeURIComponent(chatId)}`);
        if (!statusResponse.ok) return;
        const job = (await statusResponse.json()) as { configured?: boolean; status?: string | null };
        if (!job.configured || (job.status !== "pending" && job.status !== "processing")) {
          return;
        }

        setIsLoading(true);
        setIsStreaming(true);
        if (job.status === "pending") {
          void fetch("/api/chat/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId }),
          });
        }
        const reply = await pollForNewAssistantMessage(
          chatId,
          messages.map((message) => message.content).filter(Boolean),
        );
        if (cancelled) return;
        setIsStreaming(false);
        setIsLoading(false);
        if (reply) {
          setChatHistory((previous) => [...previous, { type: "assistant", content: reply }]);
          await fetchAndCacheChatDetails(chatId);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to recover background generation:", error);
          setIsStreaming(false);
          setIsLoading(false);
        }
      }
    };
    void recover();
    return () => { cancelled = true; };
  }, [chatId, currentChat, handoff.stream, isLoadingChat]);

  const handleSendMessage = useCallback(
    async (
      e: React.FormEvent<HTMLFormElement>,
      attachments?: Array<{ url: string }>,
    ) => {
      e.preventDefault();
      if (!message.trim() || isLoading || !chatId) {
        return;
      }

      const userMessage = message.trim();
      setMessage("");
      setIsLoading(true);
      setChatHistory((prev) => [
        ...prev,
        { type: "user", content: userMessage },
      ]);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMessage,
            chatId,
            streaming: true,
            // Keep the interactive chat on the low-latency streaming path.
            background: false,
            ...(attachments && attachments.length > 0 && { attachments }),
          }),
        });

        // Upstash Redis background mode: the server returns immediately with a
        // job; fire /api/chat/run (a non-streaming request that keeps running
        // server-side even if the browser closes), then poll for the reply.
        // Falls back to streaming when Upstash is unset.
        if (response.headers.get("X-Background") === "1") {
          const data = (await response.json().catch(() => ({}))) as {
            id?: string;
          };
          const bgChatId = data.id || chatId;
          setIsStreaming(true);
          if (response.headers.get("X-QStash") !== "1") {
            fetch("/api/chat/run", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chatId: bgChatId }),
            }).catch(() => {});
          }
          const knownContents = chatHistory
            .map((m) => m.content)
            .filter(Boolean);
          const reply = await pollForNewAssistantMessage(
            bgChatId,
            knownContents,
          );
          setIsStreaming(false);
          setIsLoading(false);
          if (reply) {
            setChatHistory((prev) => [
              ...prev,
              { type: "assistant", content: reply },
            ]);
            await fetchAndCacheChatDetails(bgChatId);
          }
          return;
        }

        const streamBody = await getStreamingBodyOrThrow(response);

        setIsStreaming(true);
        setChatHistory((prev) => [
          ...prev,
          {
            type: "assistant",
            content: "",
            isStreaming: true,
            stream: streamBody,
          },
        ]);
      } catch (error) {
        console.error("Error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Sorry, there was an error processing your message. Please try again.";
        setChatHistory((prev) => [
          ...prev,
          { type: "assistant", content: errorMessage },
        ]);
        setIsLoading(false);
      }
    },
    [message, isLoading, chatId, chatHistory, getStreamingBodyOrThrow],
  );

  const handleStreamingComplete = useCallback(
    async (finalContent: string): Promise<string> => {
      setIsStreaming(false);
      setIsLoading(false);

      // Refresh current chat details
      await fetchAndCacheChatDetails(chatId);

      // Update chat history with the final content
      setChatHistory((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        if (lastIndex >= 0 && updated[lastIndex].isStreaming) {
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: finalContent,
            isStreaming: false,
            stream: undefined,
          };
        }
        return updated;
      });

      // The server auto-corrects plan-only responses in onFinish (after the
      // stream already went out) and persists the real code to the DB. When
      // the streamed reply carries no code, poll for the corrected message so
      // Files / Preview show the actual files.
      const scope = parseScopeTag(finalContent);
      const files = extractProjectFiles(finalContent);
      if (!files && scope && scope !== "text") {
        const knownContents = [
          ...chatHistory.map((m) => m.content).filter(Boolean),
          finalContent,
        ];
        const corrected = await pollForCorrectedMessage(chatId, knownContents);
        if (corrected) {
          setChatHistory((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].type === "assistant") {
              updated[lastIndex] = {
                ...updated[lastIndex],
                content: corrected,
                isStreaming: false,
                stream: undefined,
              };
            }
            return updated;
          });
          return corrected;
        }
      }

      return finalContent;
    },
    // chatHistory is intentionally included so `knownContents` reflects the
    // latest history when the correction poll runs.
    [chatId, chatHistory],
  );

  const editUserMessage = useCallback(
    async (index: number) => {
      const target = chatHistory[index];
      if (!target || target.type !== "user") return;
      setMessage(target.content);
      setChatHistory((prev) => prev.slice(0, index));
      if (target.id) {
        await fetch(`/api/chats/${chatId}/messages/${target.id}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    },
    [chatHistory, chatId],
  );

  const deleteMessage = useCallback(
    async (index: number) => {
      const target = chatHistory[index];
      if (!target) return;
      setChatHistory((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
      if (target.id) {
        await fetch(`/api/chats/${chatId}/messages/${target.id}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    },
    [chatHistory, chatId],
  );

  return {
    message,
    setMessage,
    currentChat,
    isLoading,
    setIsLoading,
    isStreaming,
    chatHistory,
    isLoadingChat,
    handleSendMessage,
    handleStreamingComplete,
    editUserMessage,
    deleteMessage,
  };
}
