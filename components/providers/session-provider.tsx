"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { SupabaseSessionProvider } from "@/hooks/use-user";

interface SessionProviderProps {
  children: React.ReactNode;
}

/**
 * Wraps the app with both session providers. When Supabase Auth is configured
 * the Supabase provider is active; otherwise it stays inert and the NextAuth
 * provider drives the session. `useSession()` in `@/hooks/use-user` picks the
 * right one automatically.
 */
export function SessionProvider({ children }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider>
      <SupabaseSessionProvider>{children}</SupabaseSessionProvider>
    </NextAuthSessionProvider>
  );
}
