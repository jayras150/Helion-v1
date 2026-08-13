import { type NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import {
  getChatMessagesByChatId,
  getChatsByUserId,
} from "@/lib/db/queries";

export async function GET(_request: NextRequest) {
  try {
    const user = await getServerUser();

    if (!user?.id) {
      return NextResponse.json({ data: [] });
    }

    const chats = await getChatsByUserId(user.id);

    const data = await Promise.all(
      chats.map(async (chat) => {
        const messages = await getChatMessagesByChatId(chat.id);
        const firstUserMessage = messages.find((m) => m.role === "user");
        return {
          id: chat.id,
          object: "chat",
          name: chat.title || firstUserMessage?.content || "New chat",
          createdAt: chat.createdAt.toISOString(),
          updatedAt: chat.updatedAt.toISOString(),
          messageCount: messages.length,
        };
      }),
    );

    return NextResponse.json({ object: "list", data });
  } catch (error) {
    console.error("Chats fetch error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch chats",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
