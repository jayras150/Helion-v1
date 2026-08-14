import "server-only";
import { streamText } from "ai";
import { getModel } from "@/lib/ai";
import { extractProjectFiles } from "@/lib/extract-files";
import {
  getChatMessagesByChatId,
  insertChatMessage,
} from "@/lib/db/queries";
import { detectScopeFromPrompt, parseScopeTag } from "@/lib/scope";
import { buildChatSystemPrompt } from "@/lib/skills";

/** Minimum extracted files required before a code-scoped reply is accepted. */
const MIN_CODE_FILES = 2;

/**
 * Hard cap on a single generation. Without this, a hung provider/model keeps
 * the request (and the client loader) spinning forever.
 */
export const GENERATION_TIMEOUT_MS = 600_000; // 10 minutes

const CORRECTIVE_SYSTEM = `You are HELION, an expert full-stack engineer.
Your previous answer was ONLY a plan/outline — the user needs the ACTUAL code.
Output the COMPLETE source code of every file as fenced code blocks. Each
block must start with the file path (filename="..." attribute, or a // path
comment on the first code line). Do NOT include plans, summaries, or
verification steps — only the code files, starting with a scope tag
(<!-- scope:frontend|backend|fullstack|text -->).`;

/**
 * If the model replied with a plan/outline instead of actual code (too few
 * files extracted), ask it once more to output the real code. Falls back to
 * the original text if the correction also fails.
 */
export async function ensureCodeOutput(
  text: string,
  userMessage: string,
  abortSignal?: AbortSignal,
  hasExistingProject = false,
): Promise<string> {
  const scope = parseScopeTag(text) ?? detectScopeFromPrompt(userMessage);
  if (scope === "text") {
    return text;
  }
  const files = extractProjectFiles(text);
  const count = files ? Object.keys(files).length : 0;
  // Only auto-correct when the model produced NO files at all (true
  // plan-only / empty reply). If at least one file was emitted, treat it
  // as a valid reply (edit-mode allows single-file edits).
  if (count > 0) {
    return text;
  }

  console.warn(
    `[chat] plan-only response detected (scope=${scope}, files=${count}) — correcting…`,
  );
  try {
    const fix = await streamText({
      model: getModel(),
      system: CORRECTIVE_SYSTEM,
      abortSignal,
      messages: [
        {
          role: "user",
          content: `The user asked for: ${userMessage}\n\nYour (incomplete) response was:\n${text}`,
        },
      ],
    });
    const fixed = (await fix.text).trim();
    return fixed || text;
  } catch (error) {
    console.error("Code output correction failed:", error);
    return text;
  }
}

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Loads the persisted conversation for a chat and detects edit mode. */
export async function buildGenerationContext(chatId: string): Promise<{
  messages: HistoryMessage[];
  hasExistingProject: boolean;
}> {
  const history = await getChatMessagesByChatId(chatId);
  return {
    messages: history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    hasExistingProject: history.some(
      (m) => m.role === "assistant" && extractProjectFiles(m.content),
    ),
  };
}

/**
 * Runs a full generation for a chat and persists the assistant reply,
 * auto-correcting plan-only responses BEFORE persisting so the stored message
 * is always the final content (a background client polling the chat never sees
 * the raw plan-only draft).
 *
 * Used by the background job (/api/chat/run) so generation completes even when
 * the browser disconnected / went idle. Runs with its own 10-minute timeout.
 *
 * Returns the final (possibly corrected) reply text.
 */
export async function generateAndPersistReply({
  chatId,
  userMessage,
}: {
  chatId: string;
  userMessage?: string;
}): Promise<string> {
  const { messages, hasExistingProject } = await buildGenerationContext(chatId);
  const resolvedUserMessage =
    userMessage ??
    messages.filter((m) => m.role === "user").pop()?.content ??
    "";
  const system = await buildChatSystemPrompt(resolvedUserMessage, {
    hasExistingProject,
  });
  const scopeHint = detectScopeFromPrompt(resolvedUserMessage);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  try {
    const result = streamText({
      model: getModel(),
      system,
      messages,
      abortSignal: controller.signal,
    });
    const fullText = (await result.text).trim();
    if (!fullText) {
      return "";
    }
    const scope = parseScopeTag(fullText) ?? scopeHint;
    // Auto-correct plan-only responses, then persist the FINAL content once
    // (so a background client polling the chat only ever sees the corrected
    // reply, never the raw plan-only draft).
    const final = await ensureCodeOutput(
      fullText,
      resolvedUserMessage,
      controller.signal,
      hasExistingProject,
    );
    await insertChatMessage({
      chatId,
      role: "assistant",
      content: final,
      scope: parseScopeTag(final) ?? scope,
    });
    return final;
  } finally {
    clearTimeout(timeoutId);
  }
}
