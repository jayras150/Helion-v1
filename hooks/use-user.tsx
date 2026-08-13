"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  signOut as nextAuthSignOut,
  useSession as useNextAuthSession,
} from "next-auth/react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string;
};

export type SessionData = {
  user: SessionUser;
  expires?: string;
} | null;

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SupabaseSessionValue = {
  data: SessionData;
  status: SessionStatus;
  signOut: () => Promise<void>;
  update: () => Promise<void>;
};

const SupabaseSessionContext = createContext<SupabaseSessionValue>({
  data: null,
  status: "loading",
  signOut: async () => {},
  update: async () => {},
});

/**
 * Client session provider for the Supabase path. Listens to the Supabase auth
 * state and enriches the session with the app user (`id` + `role`) fetched from
 * the server DB via `/api/user/me`.
 */
export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [appUser, setAppUser] = useState<SessionUser | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const supabase = useMemo(
    () => (isSupabaseConfigured() ? createClient() : null),
    [],
  );

  useEffect(() => {
    if (!supabase) {
      setStatus("unauthenticated");
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setStatus(data.session?.user ? "authenticated" : "unauthenticated");
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
        setAppUser(null);
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  // Enrich with the app user (id + role) from the server DB.
  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    let active = true;
    fetch("/api/user/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.id) {
          setAppUser({
            id: d.id,
            email: d.email ?? undefined,
            name: d.name ?? undefined,
            image: d.image ?? undefined,
            role: d.role ?? undefined,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [status, refreshKey]);

  const value = useMemo<SupabaseSessionValue>(
    () => ({
      data: appUser ? { user: appUser } : null,
      status,
      signOut: async () => {
        await supabase?.auth.signOut();
        setAppUser(null);
        setStatus("unauthenticated");
        if (typeof window !== "undefined") {
          window.location.href = "/";
        }
      },
      update: async () => {
        setRefreshKey((k) => k + 1);
      },
    }),
    [appUser, status, supabase],
  );

  return (
    <SupabaseSessionContext.Provider value={value}>
      {children}
    </SupabaseSessionContext.Provider>
  );
}

/**
 * Unified client session hook. Supabase-first, falls back to NextAuth when
 * Supabase is not configured. Returns `{ data, status, update }` with the same
 * shape as `next-auth/react`'s `useSession`.
 */
export function useSession(): {
  data: SessionData;
  status: SessionStatus;
  update: () => Promise<void>;
} {
  const supabaseValue = useContext(SupabaseSessionContext);
  const nextAuth = useNextAuthSession();

  if (isSupabaseConfigured()) {
    return {
      data: supabaseValue.data,
      status: supabaseValue.status,
      update: supabaseValue.update,
    };
  }
  return {
    data: nextAuth.data as SessionData,
    status: nextAuth.status as SessionStatus,
    update: async () => {
      await nextAuth.update();
    },
  };
}

/** Unified sign out (Supabase or NextAuth). */
export function signOut(): Promise<void> | void {
  if (isSupabaseConfigured()) {
    const client = createClient();
    return client.auth.signOut().then(() => {
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    });
  }
  return nextAuthSignOut({ callbackUrl: "/", redirect: true });
}
