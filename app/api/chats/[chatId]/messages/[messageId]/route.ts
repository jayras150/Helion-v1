import { type NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import {
  deleteChatMessage,
  getChatById,
  updateChatMessageContent,
} from "@/lib/db/queries";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const user = await getServerUser();
    const { chatId, messageId } = await params;
    const chat = await getChatById(chatId);
    if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!chat || chat.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const body = (await request.json()) as { content?: string };
    const content = body.content?.trim();
    if (!content) return NextResponse.json({ error: "Content is required" }, { status: 400 });
    await updateChatMessageContent(messageId, content);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const user = await getServerUser();
    const { chatId, messageId } = await params;
    const chat = await getChatById(chatId);
    if (!user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!chat || chat.userId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await deleteChatMessage({ messageId, chatId });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}