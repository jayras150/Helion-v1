import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createChat,
  getChatById,
  getChatMessagesByChatId,
  insertChatMessage,
} from "@/lib/db/queries";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const { chatId } = await request.json();

    if (!session?.user?.id) {
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

    if (!chat || chat.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Chat not found or access denied" },
        { status: 404 },
      );
    }

    const messages = await getChatMessagesByChatId(chatId);

    // Create a local copy of the chat with its messages.
    const forkedChat = await createChat({
      userId: session.user.id,
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
