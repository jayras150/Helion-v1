import "server-only";
import { getServerUser } from "@/lib/auth";
import {
  countAdminUsers,
  getAdminUser,
  setUserRole,
} from "@/lib/db/queries";

/**
 * Server-side admin guard.
 *
 * A user counts as admin when ANY of these hold:
 *  1. Their DB `role` is "admin".
 *  2. Their email is listed in `HELION_ADMIN_EMAILS` (comma-separated env) —
 *     this also persists the role in the DB.
 *  3. No admin exists yet AND `HELION_ADMIN_EMAILS` is unset → they are
 *     promoted (self-hosted bootstrap, mirrors "first user is admin").
 */
export type AdminUser = { id: string; email: string | null; name: string | null; role: string };

function adminEmailsFromEnv(): Set<string> {
  const raw = process.env.HELION_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function requireAdmin(): Promise<AdminUser | null> {
  const authUser = await getServerUser();
  const userId = authUser?.id;
  if (!userId) {
    return null;
  }

  const user = await getAdminUser(userId);
  if (!user) {
    return null;
  }

  if (user.role === "admin") {
    return user;
  }

  // Env-based grant (persists so the role survives restarts / JWT refresh).
  const envAdmins = adminEmailsFromEnv();
  if (user.email && envAdmins.has(user.email.toLowerCase())) {
    await setUserRole(user.id, "admin");
    return { ...user, role: "admin" };
  }

  // Bootstrap: no admins configured anywhere → whoever asks first becomes admin.
  if (envAdmins.size === 0) {
    const admins = await countAdminUsers();
    if (admins === 0) {
      await setUserRole(user.id, "admin");
      return { ...user, role: "admin" };
    }
  }

  return null;
}
