import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import { getChatById, getChatMessagesByChatId } from "@/lib/db/queries";
import { mergeFilesFromMessages } from "@/lib/merge-files";

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

  // Merge project files across all assistant messages (newest overrides
  // oldest) so an edit-only reply (changed files) still yields the full
  // project for the standalone preview page.
  const messages = await getChatMessagesByChatId(chatId);
  const files = mergeFilesFromMessages(messages);

  if (!files) {
    return NextResponse.json({ error: "no_files" }, { status: 404 });
  }

  return NextResponse.json({ files });
}
