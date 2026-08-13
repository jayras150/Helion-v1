import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAdminUserRow, setUserPassword } from "@/lib/db/queries";

/**
 * POST /api/admin/users/[id]/password  { password }
 * Admin password reset — gives the user a new password (works for OAuth
 * accounts too: they keep their provider AND gain password login).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await getAdminUserRow(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const password = body.password ?? "";
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  await setUserPassword(id, password);
  return NextResponse.json({ ok: true });
}
