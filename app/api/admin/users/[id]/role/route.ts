import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAdminUser, setUserRole } from "@/lib/db/queries";

/**
 * PATCH /api/admin/users/[id]/role  { role: "admin" | "user" }
 * Promotes/demotes a user. The last remaining admin cannot demote themselves.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const role = body.role;
  if (role !== "admin" && role !== "user") {
    return NextResponse.json({ error: "Role must be 'admin' or 'user'" }, { status: 400 });
  }

  // Prevent self-demotion when you're the last admin.
  if (id === admin.id && role === "user") {
    const target = await getAdminUser(id);
    if (target?.role === "admin") {
      return NextResponse.json(
        { error: "You are the last admin — demote another user first before demoting yourself." },
        { status: 400 },
      );
    }
  }

  await setUserRole(id, role);
  return NextResponse.json({ ok: true, id, role });
}
