import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ACCESS_COOKIE = "wb_at";
const REFRESH_COOKIE = "wb_rt";
const PUBLIC_PATHS = new Set(["/login"]);

async function tryRefreshSession(
  supabaseUrl: string,
  anonKey: string,
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_in?: number } | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!res.ok) return null;
    const session = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!session.access_token || !session.refresh_token) return null;
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (process.env.AUTH_DISABLED === "1") {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    return NextResponse.next();
  }

  // No access token — try a silent refresh before falling back to login redirect.
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    const newSession = await tryRefreshSession(supabaseUrl, anonKey, refreshToken);
    if (newSession) {
      // Redirect to the same URL so the new cookies are sent back to the browser
      // and are present on the subsequent request that server components can read.
      const response = NextResponse.redirect(request.url);
      const secure = process.env.NODE_ENV === "production";
      const common = { httpOnly: true, sameSite: "lax" as const, secure, path: "/" };
      response.cookies.set(ACCESS_COOKIE, newSession.access_token, {
        ...common,
        maxAge:
          typeof newSession.expires_in === "number" ? Math.max(60, newSession.expires_in) : 3600
      });
      response.cookies.set(REFRESH_COOKIE, newSession.refresh_token, {
        ...common,
        maxAge: 60 * 60 * 24 * 30
      });
      return response;
    }
    // Refresh failed — clear the stale refresh token cookie to avoid retry loops.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
