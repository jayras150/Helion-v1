import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateAndPersistReply } from "@/lib/generate";

/**
 * Upstash QStash callback — runs the AI generation for a chat in the
 * background, independent of any browser connection.
 *
 * Triggered by `lib/upstash.ts` (`enqueueGeneration`). The request carries an
 * `Authorization: Bearer <QSTASH_TOKEN>` header set at publish time; we verify
 * it here so arbitrary callers can't burn API usage.
 *
 * Body: { chatId, userMessage }
 */
export async function POST(request: NextRequest) {
  // Verify the job was published by us (QStash forwards our custom header).
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.QSTASH_TOKEN ?? ""}`;
  if (!expected || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { chatId?: string; userMessage?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { chatId, userMessage } = body;
  if (!chatId || !userMessage) {
    return NextResponse.json(
      { error: "chatId and userMessage are required" },
      { status: 400 },
    );
  }

  try {
    const content = await generateAndPersistReply({ chatId, userMessage });
    return NextResponse.json({
      ok: true,
      contentLength: content?.length ?? 0,
    });
  } catch (error) {
    console.error("[chat/background] generation failed:", error);
    // Non-2xx → QStash retries (up to the retries count set on publish).
    return NextResponse.json(
      { error: "Background generation failed" },
      { status: 500 },
    );
  }
}
