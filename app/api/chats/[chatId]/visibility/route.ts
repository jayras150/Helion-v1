import { type NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";
import { getChatById } from "@/lib/db/queries";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  try {
    const user = await getServerUser();
    const { chatId } = await params;

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

    const { privacy } = await request.json();

    // Local chats are inherently private — accept the requested value
    // so the UI state stays consistent, but nothing is exposed publicly.
    const safePrivacy =
      privacy && ["public", "private", "team", "team-edit", "unlisted"].includes(privacy)
        ? privacy
        : "private";

    return NextResponse.json({ id: chat.id, privacy: safePrivacy });
  } catch (error) {
    console.error("Change Chat Visibility Error:", error);

    return NextResponse.json(
      {
        error: "Failed to change chat visibility",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
