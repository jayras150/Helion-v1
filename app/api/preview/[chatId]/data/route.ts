import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import { getChatById, getChatMessagesByChatId } from "@/lib/db/queries";
import { extractProjectFiles } from "@/lib/extract-files";

/**
 * GET /api/preview/[chatId]/data
 *
 * Returns the generated project files for a chat. Used by the full-screen
 * preview page (`/preview/[chatId]`) to bundle the app client-side — the
 * same proven esbuild-wasm pipeline the in-chat preview uses.
 *
 * Auth + ownership enforced here.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const user = await getServerUser();
  if (!user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { chatId } = await params;
  const chat = await getChatById(chatId);
  if (!chat || chat.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Latest assistant message that contains project files.
  const messages = await getChatMessagesByChatId(chatId);
  let files: Record<string, string> | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.content) {
      continue;
    }
    const extracted = extractProjectFiles(msg.content);
    if (extracted) {
      files = extracted;
      break;
    }
  }

  if (!files) {
    return NextResponse.json({ error: "no_files" }, { status: 404 });
  }

  return NextResponse.json({ files });
}
