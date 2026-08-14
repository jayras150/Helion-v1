"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-user";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  clearPromptFromStorage,
  createImageAttachment,
  createImageAttachmentFromStored,
  type ImageAttachment,
  loadPromptFromStorage,
  PromptInput,
  PromptInputImageButton,
  PromptInputImagePreview,
  PromptInputMicButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  savePromptToStorage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessages } from "@/components/chat/chat-messages";
import { BackendPanel } from "@/components/chat/backend-panel";
import { FilesSidebar } from "@/components/chat/files-sidebar";
import { PreviewPanel } from "@/components/chat/preview-panel";
import { AppHeader } from "@/components/shared/app-header";
import { extractProjectFiles } from "@/lib/extract-files";
import { mergeProjectContent } from "@/lib/merge-files";
import {
  pollForCorrectedMessage,
  pollForNewAssistantMessage,
} from "@/lib/poll-corrected-message";
import { parseScopeTag, type Scope } from "@/lib/scope";

// Component that uses useSearchParams - needs to be wrapped in Suspense
function SearchParamsHandler({ onReset }: { onReset: () => void }) {
  const searchParams = useSearchParams();

  // Reset UI when reset parameter is present
  useEffect(() => {
    const reset = searchParams.get("reset");
    if (reset === "true") {
      onReset();

      // Remove the reset parameter from URL without triggering navigation
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("reset");
      window.history.replaceState({}, "", newUrl.pathname);
    }
  }, [searchParams, onReset]);

  return null;
}

export function HomeClient() {
  const { status } = useSession();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showChatInterface, setShowChatInterface] = useState(false);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    Array<{
      type: "user" | "assistant";
      content: string;
      isStreaming?: boolean;
      stream?: ReadableStream<Uint8Array> | null;
    }>
  >([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [backendState, setBackendState] = useState<{
    files: Record<string, string> | null;
    scope: Scope;
    chatId: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Latest finished assistant message → source code for the live preview.
  const previewSource = useMemo(() => {
    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
      const msg = chatHistory[i];
      if (msg.type === "assistant" && !msg.isStreaming && msg.content) {
        // Edit mode: merge the changed files from the latest reply on top of
        // the previous project so the preview / Files stay complete.
        for (let j = i - 1; j >= 0; j -= 1) {
          const prev = chatHistory[j];
          if (
            prev.type === "assistant" &&
            !prev.isStreaming &&
            prev.content &&
            extractProjectFiles(prev.content)
          ) {
            return mergeProjectContent(prev.content, msg.content);
          }
        }
        return msg.content;
      }
    }
    return null;
  }, [chatHistory]);

  // Auto-open the preview when a NEW finished assistant message with files
  // arrives. Covers Upstash background mode (no stream → onComplete never
  // fires); harmless for streaming mode (preview already open). Because the
  // home chat starts empty, the first render just primes the ref and never
  // auto-opens anything.
  const homeChatReadyRef = useRef(false);
  const lastAssistantKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const finished = chatHistory.filter(
      (m) => m.type === "assistant" && !m.isStreaming && m.content,
    );
    const latest = finished[finished.length - 1];
    const key = latest
      ? `${latest.content.length}-${latest.content.slice(-40)}`
      : null;
    if (!homeChatReadyRef.current) {
      homeChatReadyRef.current = true;
      lastAssistantKeyRef.current = key;
      return;
    }
    if (!latest || lastAssistantKeyRef.current === key) {
      return;
    }
    lastAssistantKeyRef.current = key;
    const scope = parseScopeTag(latest.content);
    if (extractProjectFiles(latest.content) && scope !== "backend") {
      setIsPreviewOpen(true);
    }
  }, [chatHistory]);

  const handleReset = () => {
    // Reset all chat-related state
    setShowChatInterface(false);
    setChatHistory([]);
    setCurrentChatId(null);
    setMessage("");
    setAttachments([]);
    setIsLoading(false);
    setIsPreviewOpen(false);
    setBackendState(null);

    // Clear any stored data
    clearPromptFromStorage();

    // Focus textarea after reset
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 0);
  };

  // Auto-focus the textarea on page load and restore from sessionStorage
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }

    // Restore prompt data from sessionStorage
    const storedData = loadPromptFromStorage();
    if (storedData) {
      setMessage(storedData.message);
      if (storedData.attachments.length > 0) {
        const restoredAttachments = storedData.attachments.map(
          createImageAttachmentFromStored,
        );
        setAttachments(restoredAttachments);
      }
    }
  }, []);

  // Save prompt data to sessionStorage whenever message or attachments change
  useEffect(() => {
    if (message.trim() || attachments.length > 0) {
      savePromptToStorage(message, attachments);
    } else {
      // Clear sessionStorage if both message and attachments are empty
      clearPromptFromStorage();
    }
  }, [message, attachments]);

  // Image attachment handlers
  const handleImageFiles = async (files: File[]) => {
    try {
      const newAttachments = await Promise.all(
        files.map((file) => createImageAttachment(file)),
      );
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (error) {
      console.error("Error processing image files:", error);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handleDragOver = () => {
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = () => {
    setIsDragOver(false);
  };

  const getErrorPayload = async (response: Response) => {
    let errorMessage =
      "Sorry, there was an error processing your message. Please try again.";
    let code: string | undefined;

    try {
      const errorData = await response.json();
      code = errorData.code;

      if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      } else if (response.status === 429) {
        errorMessage =
          "You have exceeded your maximum number of messages for the day. Please try again later.";
      }
    } catch (parseError) {
      console.error("Error parsing error response:", parseError);
      if (response.status === 429) {
        errorMessage =
          "You have exceeded your maximum number of messages for the day. Please try again later.";
      }
    }
    return { message: errorMessage, code };
  };

  const getStreamingBodyOrThrow = async (
    response: Response,
  ): Promise<ReadableStream<Uint8Array>> => {
    if (!response.ok) {
      const errorPayload = await getErrorPayload(response);
      throw new Error(errorPayload.message);
    }

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    return response.body;
  };

  const ensureAuthenticated = async () => {
    if (status !== "authenticated") {
      router.push("/login?callbackUrl=/");
      return false;
    }

    return true;
  };

  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim() || isLoading) {
      return;
    }

    const canSend = await ensureAuthenticated();
    if (!canSend) {
      return;
    }

    const userMessage = message.trim();
    const currentAttachments = [...attachments];

    // Clear sessionStorage immediately upon submission
    clearPromptFromStorage();

    setMessage("");
    setAttachments([]);

    // Immediately show chat interface and add user message
    setShowChatInterface(true);
    setChatHistory([
      {
        type: "user",
        content: userMessage,
      },
    ]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          streaming: true,
          background: true,
          attachments: currentAttachments.map((att) => ({ url: att.dataUrl })),
        }),
      });

      // Upstash Redis background mode: the server returns immediately with a
      // job; fire /api/chat/run (non-streaming request that keeps running
      // server-side even if the browser closes), then poll for the reply.
      // Falls back to streaming when Upstash is unset.
      if (response.headers.get("X-Background") === "1") {
        const data = (await response.json().catch(() => ({}))) as {
          id?: string;
        };
        const bgChatId =
          data.id || response.headers.get("X-Chat-Id") || currentChatId;
        if (!bgChatId) {
          setIsLoading(false);
          return;
        }
        if (bgChatId && !currentChatId) {
          setCurrentChatId(bgChatId);
          window.history.pushState(null, "", `/chats/${bgChatId}`);
        }
        fetch("/api/chat/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: bgChatId }),
        }).catch(() => {});
        const knownContents = chatHistory
          .map((m) => m.content)
          .filter(Boolean);
        const reply = await pollForNewAssistantMessage(
          bgChatId,
          knownContents,
        );
        setIsLoading(false);
        if (reply) {
          setChatHistory((prev) => [
            ...prev,
            { type: "assistant", content: reply },
          ]);
        }
        return;
      }

      const chatId = response.headers.get("X-Chat-Id");
      const streamBody = await getStreamingBodyOrThrow(response);

      setIsLoading(false);

      // Register the new chat (id comes from the response header).
      if (chatId && !currentChatId) {
        setCurrentChatId(chatId);
        window.history.pushState(null, "", `/chats/${chatId}`);
      }

      // Add streaming assistant response
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
      console.error("Error creating chat:", error);
      setIsLoading(false);

      // Use the specific error message if available, otherwise fall back to generic message
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Sorry, there was an error processing your message. Please try again.";

      setChatHistory((prev) => [
        ...prev,
        {
          type: "assistant",
          content: errorMessage,
        },
      ]);
    }
  };

  const handleStreamingComplete = async (finalContent: string) => {
    setIsLoading(false);

    // Update chat history with final content
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

    // Resolve scope + files: backend/fullstack → E2B sandbox panel,
    // frontend/fullstack → local preview.
    const scope = parseScopeTag(finalContent);
    let files = extractProjectFiles(finalContent);

    // The server auto-corrects plan-only responses in onFinish (after the
    // stream already went out) and persists the real code to the DB. Poll for
    // the corrected message so Files / Preview show the actual files.
    if (!files && currentChatId && scope && scope !== "text") {
      const knownContents = [
        ...chatHistory.map((m) => m.content).filter(Boolean),
        finalContent,
      ];
      const corrected = await pollForCorrectedMessage(
        currentChatId,
        knownContents,
      );
      if (corrected) {
        files = extractProjectFiles(corrected);
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
      }
    }

    if (files && scope !== "backend") {
      setIsPreviewOpen(true);
    }

    if (
      files &&
      currentChatId &&
      (scope === "backend" || scope === "fullstack")
    ) {
      setBackendState({ files, scope, chatId: currentChatId });
    }
  };

  const handleChatSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!message.trim() || isLoading || !currentChatId) {
      return;
    }

    const canSend = await ensureAuthenticated();
    if (!canSend) {
      return;
    }

    const userMessage = message.trim();
    setMessage("");
    setIsLoading(true);

    // Add user message to chat history
    setChatHistory((prev) => [...prev, { type: "user", content: userMessage }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
          chatId: currentChatId,
          streaming: true,
        }),
      });

      const streamBody = await getStreamingBodyOrThrow(response);

      setIsLoading(false);

      // Add streaming response
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

      // Use the specific error message if available, otherwise fall back to generic message
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Sorry, there was an error processing your message. Please try again.";

      setChatHistory((prev) => [
        ...prev,
        {
          type: "assistant",
          content: errorMessage,
        },
      ]);
      setIsLoading(false);
    }
  };

  if (showChatInterface) {
    return (
      <div className="flex h-dvh flex-col bg-gray-50 dark:bg-transparent">
        {/* Handle search params with Suspense boundary */}
        <Suspense fallback={null}>
          <SearchParamsHandler onReset={handleReset} />
        </Suspense>

        <AppHeader
          onPreview={() => setIsPreviewOpen(true)}
          previewActive={isPreviewOpen}
          previewDisabled={!previewSource}
          onOpenFiles={() => setIsFilesOpen(true)}
          filesDisabled={!previewSource}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <ChatMessages
            chatHistory={chatHistory}
            isLoading={isLoading}
            onStreamingComplete={handleStreamingComplete}
            onStreamingStarted={() => setIsLoading(false)}
          />

          {backendState ? (
            <BackendPanel
              files={backendState.files}
              scope={backendState.scope as "backend" | "fullstack"}
              chatId={backendState.chatId}
            />
          ) : null}

          <ChatInput
            message={message}
            setMessage={setMessage}
            onSubmit={handleChatSendMessage}
            isLoading={isLoading}
            showSuggestions={false}
          />
        </div>

        {isPreviewOpen && (
          <PreviewPanel
            sourceCode={previewSource}
            onClose={() => setIsPreviewOpen(false)}
            chatId={currentChatId}
          />
        )}

        <FilesSidebar
          open={isFilesOpen}
          sourceCode={previewSource}
          onClose={() => setIsFilesOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 dark:bg-transparent">
      {/* Handle search params with Suspense boundary */}
      <Suspense fallback={null}>
        <SearchParamsHandler onReset={handleReset} />
      </Suspense>

      <AppHeader />

      {/* Main Content */}
      <div className="flex flex-1 items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 font-bold text-4xl text-gray-900 dark:text-white">
              What can we build together?
            </h2>
          </div>

          {/* Prompt Input */}
          <div className="mx-auto max-w-2xl">
            <PromptInput
              onSubmit={handleSendMessage}
              className="relative w-full"
              onImageDrop={handleImageFiles}
              isDragOver={isDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <PromptInputImagePreview
                attachments={attachments}
                onRemove={handleRemoveAttachment}
              />
              <PromptInputTextarea
                ref={textareaRef}
                onChange={(e) => setMessage(e.target.value)}
                value={message}
                placeholder="Describe what you want to build..."
                className="min-h-20 text-base"
                disabled={isLoading}
              />
              <PromptInputToolbar>
                <PromptInputTools>
                  <PromptInputImageButton
                    onImageSelect={handleImageFiles}
                    disabled={isLoading}
                  />
                </PromptInputTools>
                <PromptInputTools>
                  <PromptInputMicButton
                    onTranscript={(transcript) => {
                      setMessage((prev) =>
                        (prev + (prev ? " " : "") + transcript).slice(0, 2000),
                      );
                    }}
                    onError={(error) => {
                      console.error("Speech recognition error:", error);
                    }}
                    disabled={isLoading}
                  />
                  <PromptInputSubmit
                    disabled={!message.trim() || isLoading}
                    status={isLoading ? "streaming" : "ready"}
                  />
                </PromptInputTools>
              </PromptInputToolbar>
            </PromptInput>
          </div>

          {/* Suggestions */}
          <div className="mx-auto mt-4 max-w-2xl">
            <Suggestions>
              <Suggestion
                onClick={() => {
                  setMessage("Landing page");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="Landing page"
              />
              <Suggestion
                onClick={() => {
                  setMessage("Todo app");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="Todo app"
              />
              <Suggestion
                onClick={() => {
                  setMessage("Dashboard");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="Dashboard"
              />
              <Suggestion
                onClick={() => {
                  setMessage("Blog");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="Blog"
              />
              <Suggestion
                onClick={() => {
                  setMessage("E-commerce");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="E-commerce"
              />
              <Suggestion
                onClick={() => {
                  setMessage("Portfolio");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="Portfolio"
              />
              <Suggestion
                onClick={() => {
                  setMessage("Chat app");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="Chat app"
              />
              <Suggestion
                onClick={() => {
                  setMessage("Calculator");
                  // Submit after setting message
                  setTimeout(() => {
                    const form = textareaRef.current?.form;
                    if (form) {
                      form.requestSubmit();
                    }
                  }, 0);
                }}
                suggestion="Calculator"
              />
            </Suggestions>
          </div>

          {/* Footer */}
          <div className="mt-16 text-center text-muted-foreground text-sm">
            <p>
              Powered by your own{" "}
              <span className="text-foreground">AI provider</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
