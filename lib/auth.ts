import "server-only";
import { auth } from "@/app/(auth)/auth";
import { getOrCreateUserByEmail } from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";

/** Signed-in app user (id = app `users.id`, role from the app DB). */
export type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  role?: string;
};

/** True when Supabase Auth is configured (project URL + anon key present). */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * True when Google/GitHub sign-in should be offered.
 * With Supabase enabled that's always available (providers are toggled in the
 * Supabase dashboard); otherwise it depends on the legacy NextAuth OAuth env.
 */
export function oauthAvailable(): boolean {
  if (isSupabaseConfigured()) {
    return true;
  }
  return (
    Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) ||
    Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)
  );
}

/**
 * Resolve the signed-in app user.
 * - Supabase configured: derive from the Supabase session and ensure an app
 *   `users` row exists (keyed by email) so `id`/`role` come from the app DB.
 * - Otherwise fall back to the legacy NextAuth session.
 */
export async function getServerUser(): Promise<AppUser | null> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user: supabaseUser },
      error,
    } = await supabase.auth.getUser();
    if (error || !supabaseUser) {
      return null;
    }
    const metadata = supabaseUser.user_metadata as Record<string, unknown> | undefined;
    const appUser = await getOrCreateUserByEmail({
      email: supabaseUser.email ?? null,
      name:
        typeof metadata?.full_name === "string"
          ? metadata.full_name
          : typeof metadata?.name === "string"
            ? metadata.name
            : null,
      image:
        typeof metadata?.avatar_url === "string" ? metadata.avatar_url : null,
    });
    return {
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      image: appUser.image,
      role: appUser.role,
    };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    image: session.user.image ?? null,
    role: session.user.role,
  };
}

/** `getServerUser` that throws when there is no signed-in user. */
export async function getRequiredUser(): Promise<AppUser> {
  const user = await getServerUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}
