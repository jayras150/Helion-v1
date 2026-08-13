import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";

// Local chats are owned directly via the `chats.user_id` column,
// so this endpoint is no longer needed. Kept as a no-op for
// backward compatibility with older clients.
export async function POST(_request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  return NextResponse.json({ success: true });
}
