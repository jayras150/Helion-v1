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
import { AppHeader } from "@/components/shared/app-header";
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

  // Auto-focus the textarea on page load
  useEffect(() => {
    if (textareaRef.current && !isLoadingChat) {
      textareaRef.current.focus();
    }
  }, [isLoadingChat]);

  return (
    <div className="flex h-dvh flex-col bg-gray-50 dark:bg-transparent">
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
          onStreamingComplete={handleStreamingDone}
          onStreamingStarted={() => setIsLoading(false)}
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
    </div>
  );
}
