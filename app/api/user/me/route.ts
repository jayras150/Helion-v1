import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth";

/**
 * GET /api/user/me
 * Returns the signed-in app user ({ id, email, name, image, role }). Used by
 * the client to resolve the app-level user id / role on top of the Supabase
 * (or NextAuth) session.
 */
export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    role: user.role ?? "user",
  });
}
