import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { deleteChat } from "@/lib/db/queries";

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
