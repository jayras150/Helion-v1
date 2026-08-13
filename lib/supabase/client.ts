"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase browser client (used inside client components).
 *
 * NOTE: not yet enabled — used when migrating from NextAuth to Supabase Auth.
 * Requires env: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
