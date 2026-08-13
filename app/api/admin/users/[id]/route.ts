import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import {
  countAdminUsers,
  deleteUserAccount,
  getAdminUserRow,
  updateUserProfile,
} from "@/lib/db/queries";

/**
 * PATCH  /api/admin/users/[id]  { name?, email? }
 * DELETE /api/admin/users/[id]
 * Updates a user's profile, or deletes the account (with all chats).
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
  const target = await getAdminUserRow(id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: { name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 255) : undefined;
  const email =
    typeof body.email === "string" ? body.email.trim().slice(0, 64) : undefined;

  if (email === "") {
    return NextResponse.json(
      { error: "Email cannot be empty." },
      { status: 400 },
    );
  }
  if (name === "") {
    return NextResponse.json(
      { error: "Name cannot be empty." },
      { status: 400 },
    );
  }

  await updateUserProfile({ userId: id, name, email });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
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

  if (id === admin.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account from here." },
      { status: 400 },
    );
  }

  // Never delete the last admin — the platform would lock itself out.
  if (target.role === "admin") {
    const admins = await countAdminUsers();
    if (admins <= 1) {
      return NextResponse.json(
        { error: "This user is the last admin — make another user an admin first." },
        { status: 400 },
      );
    }
  }

  await deleteUserAccount(id);
  return NextResponse.json({ ok: true });
}
