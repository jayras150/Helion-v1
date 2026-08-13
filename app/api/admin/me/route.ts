import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

/** GET /api/admin/me → { isAdmin } — lets the client show/hide admin UI. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ isAdmin: false });
  }
  return NextResponse.json({ isAdmin: true, email: admin.email });
}
