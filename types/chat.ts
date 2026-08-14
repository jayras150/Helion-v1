/**
 * Chat-related types for use-chat hook
 */
export interface Chat {
  id: string;
  demo?: string;
  url?: string;
  messages?: ChatMessageData[];
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatMessage {
  type: "user" | "assistant";
  content: string;
  id?: string;
  isStreaming?: boolean;
  stream?: ReadableStream<Uint8Array> | null;
}

export interface ChatData {
  id?: string;
  webUrl?: string;
  url?: string;
  object?: string;
}

/**
 * Image attachment types for prompt input
 */
export interface ImageAttachment {
  id: string;
  file: File;
  preview: string;
  dataUrl?: string;
}

export interface StoredImageAttachment {
  id: string;
  fileName: string;
  dataUrl: string;
  preview: string;
}

export interface StoredPromptData {
  message: string;
  attachments: StoredImageAttachment[];
}
