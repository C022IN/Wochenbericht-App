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

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function supabaseRestJson<T>(
  path: string,
  init?: Omit<RequestInit, "headers"> & { headers?: HeadersInit }
): Promise<T> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const url = `${config.url}${path}`;
  const headers = buildHeaders(config, init?.headers);

  // Retry network errors and 5xx (e.g. a free-tier project resuming from auto-pause) a
  // couple of times before giving up, so a cold start is bridged rather than surfaced as a
  // hard error. 4xx responses are real client errors and are thrown immediately.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch (networkError) {
      if (attempt < MAX_ATTEMPTS - 1) {
        await delay(600 * (attempt + 1));
        continue;
      }
      throw networkError;
    }

    if (response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
      await delay(600 * (attempt + 1));
      continue;
    }

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
