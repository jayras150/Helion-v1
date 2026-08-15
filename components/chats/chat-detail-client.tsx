"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearPromptFromStorage,
  type ImageAttachment,
} from "@/components/ai-elements/prompt-input";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessages } from "@/components/chat/chat-messages";
import { BackendPanel } from "@/components/chat/backend-panel";
import { FilesSidebar } from "@/components/chat/files-sidebar";
import { PreviewPanel } from "@/components/chat/preview-panel";
import { AppShell } from "@/components/shared/app-shell";
import { useChat } from "@/hooks/use-chat";
import { useEventListener } from "@/hooks/use-event-listner";
import { extractProjectFiles } from "@/lib/extract-files";
import { mergeProjectContent } from "@/lib/merge-files";
import { parseScopeTag, type Scope } from "@/lib/scope";

export function ChatDetailClient() {
  const params = useParams();
  const chatId = params.chatId as string;
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [backendPanel, setBackendPanel] = useState<{
    files: Record<string, string>;
    scope: Scope;
    chatId: string;
    contentKey: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    message,
    setMessage,
    isLoading,
    setIsLoading,
    chatHistory,
    isLoadingChat,
    handleSendMessage,
    handleStreamingComplete,
    editUserMessage,
    deleteMessage,
  } = useChat(chatId);

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

  // Auto-open the preview after streaming completes (if the response contains
  // project files) — but not for backend-only projects. The streamed content
  // may be a plan-only reply that the server later auto-corrects; when that
  // happens the corrected code is what reaches Files / Preview.
  const handleStreamingDone = async (finalContent: string) => {
    const effective =
      (await handleStreamingComplete(finalContent)) ?? finalContent;
    const scope = parseScopeTag(effective);
    const files = extractProjectFiles(effective);
    if (files && scope !== "backend") {
      setIsPreviewOpen(true);
    }
  };

  // Auto-open the preview when a NEW finished assistant message with files
  // arrives. This covers Upstash background mode, where no stream fires
  // onComplete (so handleStreamingDone above never runs). Streaming mode also
  // hits this — harmless, it just opens the already-open preview. Pre-existing
  // messages (chat loaded from the DB) are never auto-opened.
  const chatReadyRef = useRef(false);
  const lastAssistantKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoadingChat) {
      return;
    }
    const finished = chatHistory.filter(
      (m) => m.type === "assistant" && !m.isStreaming && m.content,
    );
    const latest = finished[finished.length - 1];
    const key = latest
      ? `${latest.content.length}-${latest.content.slice(-40)}`
      : null;
    if (!chatReadyRef.current) {
      chatReadyRef.current = true;
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
  }, [chatHistory, isLoadingChat]);

  // Detect the latest backend/fullstack assistant message (from history or a
  // fresh stream) and surface an E2B backend panel for it. A contentKey keeps
  // the panel mounted without redeploying when unrelated history changes.
  useEffect(() => {
    if (isLoadingChat) {
      return;
    }
    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
      const msg = chatHistory[i];
      if (msg.type !== "assistant" || msg.isStreaming || !msg.content) {
        continue;
      }
      const scope = parseScopeTag(msg.content);
      if (scope !== "backend" && scope !== "fullstack") {
        continue;
      }
      const files = extractProjectFiles(msg.content);
      if (!files) {
        continue;
      }
      const contentKey = `${msg.content.length}-${msg.content.slice(-40)}`;
      setBackendPanel((prev) =>
        prev && prev.contentKey === contentKey
          ? prev
          : { files, scope, chatId, contentKey },
      );
      return;
    }
  }, [chatHistory, isLoadingChat, chatId]);

  // Wrapper function to handle attachments
  const handleSubmitWithAttachments = (
    e: React.FormEvent<HTMLFormElement>,
    attachmentUrls?: Array<{ url: string }>,
  ) => {
    // Clear sessionStorage immediately upon submission
    clearPromptFromStorage();
    // Clear attachments after sending
    setAttachments([]);
    return handleSendMessage(e, attachmentUrls);
  };

  // Escape closes the full-screen preview
  useEventListener<Window, "keydown">("keydown", (event) => {
    if (event.key === "Escape" && isPreviewOpen) {
      setIsPreviewOpen(false);
    }
  });

  return (
    <AppShell
      headerProps={{
        onPreview: () => setIsPreviewOpen(true),
        previewActive: isPreviewOpen,
        previewDisabled: !previewSource,
        onOpenFiles: () => setIsFilesOpen(true),
        filesDisabled: !previewSource,
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <ChatMessages
          chatHistory={chatHistory}
          isLoading={isLoading}
          onStreamingComplete={handleStreamingDone}
          onEditMessage={(index) => void editUserMessage(index)}
          onDeleteMessage={(index) => void deleteMessage(index)}
        />

        {backendPanel ? (
          <BackendPanel
            files={backendPanel.files}
            scope={backendPanel.scope as "backend" | "fullstack"}
            chatId={backendPanel.chatId}
          />
        ) : null}

        <ChatInput
          message={message}
          setMessage={setMessage}
          onSubmit={handleSubmitWithAttachments}
          isLoading={isLoading}
          showSuggestions={false}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          textareaRef={textareaRef}
        />
      </div>

      {isPreviewOpen && (
        <PreviewPanel
          sourceCode={previewSource}
          onClose={() => setIsPreviewOpen(false)}
          chatId={chatId}
        />
      )}

      <FilesSidebar
        open={isFilesOpen}
        sourceCode={previewSource}
        onClose={() => setIsFilesOpen(false)}
      />
    </AppShell>
  );
}
