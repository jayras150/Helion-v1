import { type NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import {
  createChat,
  getChatById,
  getChatMessagesByChatId,
  insertChatMessage,
} from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  try {
    const user = await getServerUser();
    const { chatId } = await request.json();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 },
      );
    }

    const chat = await getChatById(chatId);

    if (!chat || chat.userId !== user.id) {
      return NextResponse.json(
        { error: "Chat not found or access denied" },
        { status: 404 },
      );
    }

    const messages = await getChatMessagesByChatId(chatId);

    // Create a local copy of the chat with its messages.
    const forkedChat = await createChat({
      userId: user.id,
      title: `${chat.title || "Chat"} (copy)`,
    });

    for (const msg of messages) {
      await insertChatMessage({
        chatId: forkedChat.id,
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    return NextResponse.json({ id: forkedChat.id });
  } catch (error) {
    console.error("Error forking chat:", error);
    return NextResponse.json({ error: "Failed to fork chat" }, { status: 500 });
  }
}
