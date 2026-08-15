import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Receiver } from "@upstash/qstash";
import { getChatById } from "@/lib/db/queries";
import { generateAndPersistReply } from "@/lib/generate";
import { finishJob, claimJob } from "@/lib/upstash";

export async function POST(request: NextRequest) {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey || !nextKey) return NextResponse.json({ error: "QStash signing keys are not configured" }, { status: 503 });
  const body = await request.text();
  try {
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    await receiver.verify({ signature: request.headers.get("Upstash-Signature") ?? "", body, url: request.url });
  } catch {
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  }
  const { chatId } = JSON.parse(body) as { chatId?: string };
  if (!chatId || !(await getChatById(chatId))) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  if (!(await claimJob(chatId))) return NextResponse.json({ ok: true, alreadyRunning: true });
  try {
    await generateAndPersistReply({ chatId });
    await finishJob(chatId, "done");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[qstash] generation failed:", error);
    await finishJob(chatId, "failed");
    throw error;
  }
}