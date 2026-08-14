import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { streamText } from "ai";
import { getServerUser, type AppUser } from "@/lib/auth";
import { getModel, hasAiKey } from "@/lib/ai";
import {
  createChat,
  getChatById,
  getChatCountByUserId,
  insertChatMessage,
  updateChatMessageContent,
} from "@/lib/db/queries";
import { userEntitlements } from "@/lib/entitlements";
import {
  buildGenerationContext,
  ensureCodeOutput,
  GENERATION_TIMEOUT_MS,
} from "@/lib/generate";
import { detectScopeFromPrompt, parseScopeTag } from "@/lib/scope";
import { buildChatSystemPrompt } from "@/lib/skills";
import { createJob, isUpstashConfigured } from "@/lib/upstash";

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

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    const { message, chatId, streaming, background } = await request.json();

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

    // Upstash Redis background mode: record a job and return immediately. The
    // client fires /api/chat/run, which generates server-side (and keeps going
    // even if the browser disconnects / goes idle), then polls for the reply.
    // Falls back to streaming when Upstash isn't configured.
    if (background && isUpstashConfigured()) {
      await createJob(chat.id);
      return new Response(JSON.stringify({ id: chat.id, background: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Chat-Id": chat.id,
          "X-Background": "1",
        },
      });
    }

    // Build the conversation context (history + edit-mode detection).
    const { messages, hasExistingProject } = await buildGenerationContext(
      chat.id,
    );

    // System prompt is editable from /admin/settings (DB), plus the enabled
    // AI skills (vendored SKILL.md) that match the user's message. When the
    // chat already contains a generated project, use the edit contract so the
    // model only outputs the files it changed (saves tokens on edit requests).
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
