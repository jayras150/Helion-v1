import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase session-refresh middleware.
 *
 * NOTE: not yet enabled — meant to replace the auth check in `proxy.ts` when
 * migrating to Supabase Auth. Requires env: NEXT_PUBLIC_SUPABASE_URL +
 * NEXT_PUBLIC_SUPABASE_ANON_KEY.
 *
 * Run it from `proxy.ts`: export a `middleware` that calls `updateSession`,
 * and add the protected routes (e.g. /chats, /projects).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session if the token is close to expiring.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect routes: redirect to /login when not signed in.
  const protectedPaths = ["/chats", "/projects"];
  const isProtected = protectedPaths.some(
    (p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(`${p}/`),
  );
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
