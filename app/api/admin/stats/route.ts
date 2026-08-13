import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAdminStats } from "@/lib/db/queries";

/** GET /api/admin/stats → platform-wide aggregates for the dashboard. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const stats = await getAdminStats();
  return NextResponse.json(stats);
}
