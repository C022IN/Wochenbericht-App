import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const AUTH_ACCESS_COOKIE = "wb_at";
export const AUTH_REFRESH_COOKIE = "wb_rt";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
};

type SupabaseAuthSessionResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: SupabaseAuthUser;
};

export type AuthUser = {
  id: string;
  email?: string | null;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function getLocalFallbackUserId() {
  return process.env.APP_DEFAULT_USER_ID?.trim() || "00000000-0000-0000-0000-000000000000";
}

function getSupabaseAuthConfig() {
  const url = process.env.SUPABASE_URL?.trim()?.replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

export function isSupabaseAuthEnabled() {
  if (process.env.AUTH_DISABLED === "1") return false;
  return Boolean(getSupabaseAuthConfig());
}

function getCookieSecureFlag() {
  return process.env.NODE_ENV === "production";
}

async function supabaseAuthJson<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getSupabaseAuthConfig();
  if (!config) {
    throw new AuthError("Supabase auth is not configured.", 500);
  }

  const res = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.anonKey,
      ...(init?.headers ?? {})
    }
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof parsed === "object" &&
      parsed &&
      "msg" in parsed &&
      typeof (parsed as { msg?: unknown }).msg === "string"
        ? (parsed as { msg: string }).msg
        : typeof parsed === "object" &&
            parsed &&
            "message" in parsed &&
            typeof (parsed as { message?: unknown }).message === "string"
          ? (parsed as { message: string }).message
          : `Supabase auth request failed (${res.status})`;
    throw new AuthError(message, res.status);
  }

  return parsed as T;
}

function setSessionCookies(
  session: Required<Pick<SupabaseAuthSessionResponse, "access_token" | "refresh_token">> &
    Pick<SupabaseAuthSessionResponse, "expires_in">
) {
  const store = cookies();
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getCookieSecureFlag(),
    path: "/"
  };

  store.set(AUTH_ACCESS_COOKIE, session.access_token, {
    ...common,
    maxAge: typeof session.expires_in === "number" ? Math.max(60, session.expires_in) : 60 * 60
  });
  store.set(AUTH_REFRESH_COOKIE, session.refresh_token, {
    ...common,
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearSessionCookies() {
  const store = cookies();
  store.delete(AUTH_ACCESS_COOKIE);
  store.delete(AUTH_REFRESH_COOKIE);
}

function ensureSessionTokens(session: SupabaseAuthSessionResponse) {
  if (!session.access_token || !session.refresh_token) {
    throw new AuthError("Supabase did not return a session. Check email confirmation settings.", 400);
  }
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in
  };
}

export async function signInWithPassword(email: string, password: string) {
  const session = await supabaseAuthJson<SupabaseAuthSessionResponse>("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  setSessionCookies(ensureSessionTokens(session));
  return session.user ?? null;
}

export async function signUpWithPassword(email: string, password: string) {
  const session = await supabaseAuthJson<SupabaseAuthSessionResponse>("/auth/v1/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const hasSession = Boolean(session.access_token && session.refresh_token);
  if (hasSession) {
    setSessionCookies(ensureSessionTokens(session));
  }

  return { user: session.user ?? null, hasSession };
}

export async function getUserFromAccessToken(accessToken: string): Promise<AuthUser | null> {
  if (!isSupabaseAuthEnabled()) {
    return { id: getLocalFallbackUserId() };
  }

  const config = getSupabaseAuthConfig();
  if (!config) return null;

  const res = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!res.ok) return null;

  const user = (await res.json()) as SupabaseAuthUser;
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? null };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseAuthEnabled()) {
    return { id: getLocalFallbackUserId() };
  }

  const store = cookies();
  const accessToken = store.get(AUTH_ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  return getUserFromAccessToken(accessToken);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export async function getCurrentUserId() {
  const user = await requireCurrentUser();
  return user.id;
}

export async function requirePageUser(nextPath?: string) {
  const user = await getCurrentUser();
  if (!user) {
    const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${next}`);
  }
  return user;
}
