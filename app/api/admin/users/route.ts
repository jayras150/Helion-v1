import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAdminUsers } from "@/lib/db/queries";

/** GET /api/admin/users → all users with chat counts. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const users = await getAdminUsers();
  return NextResponse.json({ users });
}
