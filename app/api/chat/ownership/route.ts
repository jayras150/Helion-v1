import { type NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";

// Local chats are owned directly via the `chats.user_id` column,
// so this endpoint is no longer needed. Kept as a no-op for
// backward compatibility with older clients.
export async function POST(_request: NextRequest) {
  const user = await getServerUser();

  if (!user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  return NextResponse.json({ success: true });
}
