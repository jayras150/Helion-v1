import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";
import { updateSession } from "./lib/supabase/middleware";

// Server-safe Supabase check (do not import the "use client" supabase module
// into the edge middleware).
const supabaseEnabled = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Public static assets used by the sandboxed live-preview iframe.
  // The iframe runs in an opaque (sandboxed) origin and does not send auth
  // cookies, so these must always be served without authentication.
  if (pathname.startsWith("/vendor/")) {
    return NextResponse.next();
  }

  // Supabase mode: refresh the session and protect routes via Supabase.
  if (supabaseEnabled) {
    return updateSession(request);
  }

  // Check for required environment variables
  if (!process.env.AUTH_SECRET) {
    console.error(
      "❌ Missing AUTH_SECRET environment variable. Please check your .env file.",
    );
    return NextResponse.next(); // Let the app handle the error with better UI
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  if (!token) {
    // Allow API routes to proceed without authentication for anonymous chat creation
    if (pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    // Allow homepage for anonymous users
    if (pathname === "/") {
      return NextResponse.next();
    }

    // Redirect protected pages to login
    if (["/chats", "/projects"].some((path) => pathname.startsWith(path))) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Allow login and register pages
    if (["/login", "/register"].includes(pathname)) {
      return NextResponse.next();
    }

    // For any other protected routes, redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chats/:path*",
    "/projects/:path*",
    "/preview/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/login",
    "/register",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
