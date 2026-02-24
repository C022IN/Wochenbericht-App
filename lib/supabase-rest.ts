type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url: stripTrailingSlash(url), serviceRoleKey };
}

function buildHeaders(config: SupabaseConfig, extra?: HeadersInit) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    ...extra
  };
}

export async function supabaseRestJson<T>(
  path: string,
  init?: Omit<RequestInit, "headers"> & { headers?: HeadersInit }
): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: buildHeaders(config, init?.headers)
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "message" in parsed && typeof (parsed as { message?: unknown }).message === "string"
        ? (parsed as { message: string }).message
        : `Supabase request failed (${response.status})`;
    throw new Error(message);
  }

  return parsed as T;
}

export function postgrestIn(values: string[]) {
  return `in.(${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

export function postgrestEq(value: string) {
  return `eq.${value}`;
}

export function postgrestRangeGte(value: string) {
  return `gte.${value}`;
}

export function postgrestRangeLte(value: string) {
  return `lte.${value}`;
}

export function appendQuery(path: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value.length > 0) {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}
