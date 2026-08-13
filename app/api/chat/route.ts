import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { streamText } from "ai";
import { getServerUser, type AppUser } from "@/lib/auth";
import { getModel, hasAiKey } from "@/lib/ai";
import {
  createChat,
  getChatById,
  getChatCountByUserId,
  getChatMessagesByChatId,
  insertChatMessage,
  updateChatMessageContent,
} from "@/lib/db/queries";
import { userEntitlements } from "@/lib/entitlements";
import { extractProjectFiles } from "@/lib/extract-files";
import { detectScopeFromPrompt, parseScopeTag } from "@/lib/scope";
import { buildChatSystemPrompt } from "@/lib/skills";

async function checkRateLimit(
  user: AppUser | null,
): Promise<Response | null> {
  // Require authentication
  if (!user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const chatCount = await getChatCountByUserId({
    userId: user.id,
    differenceInHours: 24,
  });

  if (chatCount >= userEntitlements.maxMessagesPerDay) {
    return NextResponse.json(
      {
        error:
          "You have exceeded your maximum number of messages for the day. Please try again later.",
      },
      { status: 429 },
    );
  }

  return null;
}

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/** Minimum extracted files required before a code-scoped reply is accepted. */
const MIN_CODE_FILES = 2;

/**
 * Hard cap on a single generation. Without this, a hung provider/model keeps
 * the request (and the client loader) spinning forever — the chat row gets
 * created + user message persisted, but no assistant reply ever lands. A
 * bounded timeout fails gracefully instead.
 */
const GENERATION_TIMEOUT_MS = 600_000; // 10 minutes

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
async function ensureCodeOutput(
  text: string,
  userMessage: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const scope = parseScopeTag(text) ?? detectScopeFromPrompt(userMessage);
  if (scope === "text") {
    return text;
  }
  const files = extractProjectFiles(text);
  const count = files ? Object.keys(files).length : 0;
  const minNeeded = scope === "backend" ? 1 : MIN_CODE_FILES;
  if (count >= minNeeded) {
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
          content:
            `The user asked for: ${userMessage}\n\nYour (incomplete) response was:\n${text}`,
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

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    const { message, chatId, streaming } = await request.json();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    if (!hasAiKey()) {
      return NextResponse.json(
        {
          error:
            "AI_API_KEY is not configured. Add your AI provider key to .env.local (see .env.example).",
        },
        { status: 500 },
      );
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const rateLimitResponse = await checkRateLimit(user);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Resolve the chat: continue an existing one or create a new one.
    let chat: { id: string; userId: string };
    if (chatId) {
      const existing = await getChatById(chatId);
      if (!existing || existing.userId !== user.id) {
        return NextResponse.json(
          { error: "Chat not found or access denied" },
          { status: 404 },
        );
      }
      chat = existing;
    } else {
      chat = await createChat({
        userId: user.id,
        title: message,
      });
    }

    // Persist the user message.
    await insertChatMessage({
      chatId: chat.id,
      role: "user",
      content: message,
    });

    // Build the conversation history for context (includes the new user message).
    const history = await getChatMessagesByChatId(chat.id);
    const messages: HistoryMessage[] = history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    // System prompt is editable from /admin/settings (DB), plus the enabled
    // AI skills (vendored SKILL.md) that match the user's message. When the
    // chat already contains a generated project, use the edit contract so the
    // model only outputs the files it changed (saves tokens on edit requests).
    const hasExistingProject = history.some(
      (m) => m.role === "assistant" && extractProjectFiles(m.content),
    );
    const system = await buildChatSystemPrompt(message, { hasExistingProject });

    // Abort the generation after the timeout so a hung provider/model can't
    // leave the client loader spinning forever.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

    const result = streamText({
      model: getModel(),
      system,
      messages,
      abortSignal: controller.signal,
      onFinish: async ({ text }) => {
        if (!text) {
          return;
        }
        const scope = parseScopeTag(text) ?? detectScopeFromPrompt(message);
        try {
          // Persist the raw reply IMMEDIATELY so the assistant message exists
          // in the DB even if the corrective pass below fails or the client
          // navigates away — otherwise a failed/long generation leaves the
          // chat with only the user message (looks broken).
          const inserted = await insertChatMessage({
            chatId: chat.id,
            role: "assistant",
            content: text,
            scope,
          });
          // Auto-correct plan-only responses, then upgrade the persisted text.
          const final = await ensureCodeOutput(
            text,
            message,
            controller.signal,
          );
          if (final && final !== text) {
            await updateChatMessageContent(
              inserted.id,
              final,
              parseScopeTag(final) ?? scope,
            );
          }
        } catch (error) {
          console.error("Failed to persist assistant message:", error);
        }
      },
    });

    if (streaming) {
      // The timer stays armed for the whole generation; if it fires after the
      // stream already finished, aborting a completed stream is a harmless
      // no-op. This guarantees a hung generation always terminates.
      const body = result.toTextStreamResponse().body;
      return new Response(body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Chat-Id": chat.id,
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    const fullText = await result.text;
    clearTimeout(timeoutId);
    let finalText = fullText;
    if (fullText) {
      // Auto-correct plan-only responses before persisting/returning.
      finalText = await ensureCodeOutput(fullText, message, controller.signal);
      await insertChatMessage({
        chatId: chat.id,
        role: "assistant",
        content: finalText,
        scope: parseScopeTag(finalText) ?? detectScopeFromPrompt(message),
      });
    }

    return NextResponse.json({
      id: chat.id,
      role: "assistant",
      content: finalText,
    });
  } catch (error) {
    console.error("AI API Error:", error);
    const timedOut =
      (error instanceof Error &&
        (error.name === "AbortError" ||
          /abort|timeout/i.test(error.message))) ||
      (typeof error === "object" &&
        error !== null &&
        (error as { name?: string }).name === "AbortError");
    return NextResponse.json(
      {
        error: timedOut
          ? "Generation timed out after 10 minutes. The AI provider may be overloaded — please try again."
          : "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: timedOut ? 504 : 500 },
    );
  }
}
