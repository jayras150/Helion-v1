import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import { getChatById } from "@/lib/db/queries";
import { generateAndPersistReply } from "@/lib/generate";
import { claimJob, finishJob, getJobStatus, isUpstashConfigured } from "@/lib/upstash";

/** Returns the durable background job state so a refreshed browser can recover. */
export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const chatId = request.nextUrl.searchParams.get("chatId");
  if (!chatId) return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  const chat = await getChatById(chatId);
  if (!chat || chat.userId !== user.id) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  return NextResponse.json({ configured: isUpstashConfigured() || Boolean(process.env.QSTASH_TOKEN), status: (isUpstashConfigured() || process.env.QSTASH_TOKEN) ? await getJobStatus(chatId) : null });
}

/**
 * POST /api/chat/run
 * Body: { chatId }
 *
 * Runs the AI generation for a chat as a NON-streaming request. Because the
 * handler never streams back to the client, the serverless function keeps
 * executing server-side even when the browser disconnects / goes idle — the
 * assistant message is persisted to the DB regardless.
 *
 * A Redis job (see lib/upstash.ts) is claimed so the same chat is never
 * generated twice. Returns `{ ok, alreadyRunning }` — the client polls
 * `/api/chats/<id>` for the persisted reply.
 */
export async function POST(request: NextRequest) {
  const user = await getServerUser();
  if (!user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let body: { chatId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { chatId } = body;
  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  const chat = await getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return NextResponse.json(
      { error: "Chat not found or access denied" },
      { status: 404 },
    );
  }

  const claimed = await claimJob(chatId);
  if (!claimed) {
    // Already processing or finished — nothing to do.
    return NextResponse.json({ ok: true, alreadyRunning: true });
  }

  try {
    const content = await generateAndPersistReply({ chatId });
    await finishJob(chatId, "done");
    return NextResponse.json({
      ok: true,
      contentLength: content?.length ?? 0,
    });
  } catch (error) {
    console.error("[chat/run] generation failed:", error);
    await finishJob(chatId, "failed");
    return NextResponse.json(
      { error: "Background generation failed" },
      { status: 500 },
    );
  }
}
