import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  deleteChat,
  getChatById,
  getChatMessagesByChatId,
} from "@/lib/db/queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const session = await auth();
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required" },
        { status: 400 },
      );
    }

    const chat = await getChatById(chatId);

    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    }

    if (session?.user?.id && chat.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const messages = await getChatMessagesByChatId(chatId);

    return NextResponse.json({
      id: chat.id,
      object: "chat",
      name: chat.title,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messages: messages.map((msg) => ({
        id: msg.id,
        object: "message",
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching chat details:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch chat details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const session = await auth();
    const { chatId } = await params;

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

    await deleteChat({ chatId, userId: session.user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat:", error);
    return NextResponse.json(
      { error: "Failed to delete chat" },
      { status: 500 },
    );
  }
}
