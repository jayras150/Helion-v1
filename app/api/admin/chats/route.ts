import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAdminChats } from "@/lib/db/queries";

/** GET /api/admin/chats?userId=<id> → all chats (optionally per user). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = request.nextUrl.searchParams.get("userId") ?? undefined;
  const chats = await getAdminChats(userId);
  return NextResponse.json({ chats });
}
