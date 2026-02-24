import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUserId } from "./auth";
import { getIsoWeekDates, getIsoWeeksInYear, splitWeekByMonth } from "./calendar";
import { appendQuery, getSupabaseConfig, postgrestEq, postgrestIn, postgrestRangeGte, postgrestRangeLte, supabaseRestJson } from "./supabase-rest";
import {
  EMPTY_DB,
  EMPTY_DAILY_LINE,
  EMPTY_PROFILE,
  type AppDb,
  type DailyEntry,
  type DailyLine,
  type UserProfile,
  type WeekSummary
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "wochenbericht-db.json");

const SUPABASE_PROFILES_TABLE = process.env.SUPABASE_PROFILES_TABLE?.trim() || "wochenbericht_profiles";
const SUPABASE_ENTRIES_TABLE = process.env.SUPABASE_ENTRIES_TABLE?.trim() || "wochenbericht_entries";

function isSupabaseDbEnabled() {
  if (process.env.DB_BACKEND?.trim() === "local") return false;
  return Boolean(getSupabaseConfig());
}

async function getScopedUserId() {
  if (!isSupabaseDbEnabled()) {
    return process.env.APP_DEFAULT_USER_ID?.trim() || "local-user";
  }
  return getCurrentUserId();
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function sanitizeLine(line: unknown) {
  const source = (line && typeof line === "object" ? line : {}) as Record<string, unknown>;
  const base = EMPTY_DAILY_LINE();
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(base).map(([key, fallback]) => {
        if (key === "id") {
          const raw = typeof source[key] === "string" ? source[key] : "";
          return [key, raw || randomUUID()];
        }
        const raw = source[key];
        return [key, typeof raw === "string" ? raw : fallback];
      })
    )
  };
}

function sanitizeEntry(date: string, entry: unknown): DailyEntry {
  const source = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
  const linesRaw = Array.isArray(source.lines) ? source.lines : [];
  const lines = linesRaw.map(sanitizeLine);

  return {
    date,
    arbeitsstaetteProjekte:
      typeof source.arbeitsstaetteProjekte === "string" ? source.arbeitsstaetteProjekte : "",
    artDerArbeit: typeof source.artDerArbeit === "string" ? source.artDerArbeit : "",
    lines,
    updatedAt: nowIso()
  };
}

function sanitizeProfile(profile: unknown): UserProfile {
  const source = (profile && typeof profile === "object" ? profile : {}) as Record<string, unknown>;
  return {
    name: typeof source.name === "string" ? source.name : "",
    vorname: typeof source.vorname === "string" ? source.vorname : "",
    defaultArbeitsstaetteProjekte:
      typeof source.defaultArbeitsstaetteProjekte === "string" ? source.defaultArbeitsstaetteProjekte : "",
    defaultArtDerArbeit: typeof source.defaultArtDerArbeit === "string" ? source.defaultArtDerArbeit : ""
  };
}

function hasMeaningfulLineData(line: DailyLine) {
  const hasExplicitStatusCode = (() => {
    const code = line.lohnType.trim().toUpperCase();
    return Boolean(code && code !== "S");
  })();

  return Boolean(
    line.siteNameOrt.trim() ||
      line.beginn.trim() ||
      line.ende.trim() ||
      line.pauseOverride.trim() ||
      line.dayHoursOverride.trim() ||
      hasExplicitStatusCode ||
      line.ausloese.trim() ||
      line.zulage.trim() ||
      line.projektnummer.trim() ||
      line.kabelschachtInfo.trim() ||
      line.smNr.trim() ||
      line.bauleiter.trim() ||
      line.arbeitskollege.trim()
  );
}

async function readLocalDb(): Promise<AppDb> {
  await ensureDataDir();
  try {
    const raw = await readFile(DB_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<AppDb>;
    return {
      profile: {
        ...EMPTY_DB.profile,
        ...(parsed.profile ?? {})
      },
      entries: parsed.entries ?? {}
    };
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

async function writeLocalDb(db: AppDb) {
  await ensureDataDir();
  await writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

type SupabaseProfileRow = {
  user_id: string;
  payload: UserProfile;
  updated_at?: string;
};

type SupabaseEntryRow = {
  user_id: string;
  date: string;
  payload: DailyEntry;
  updated_at?: string;
};

async function getSupabaseProfileRow(userId: string): Promise<SupabaseProfileRow | null> {
  const path = appendQuery(`/rest/v1/${SUPABASE_PROFILES_TABLE}`, {
    select: "user_id,payload,updated_at",
    user_id: postgrestEq(userId),
    limit: "1"
  });
  const rows = await supabaseRestJson<SupabaseProfileRow[]>(path);
  return rows[0] ?? null;
}

async function upsertSupabaseProfile(userId: string, profile: UserProfile): Promise<UserProfile> {
  const rows = await supabaseRestJson<SupabaseProfileRow[]>(
    appendQuery(`/rest/v1/${SUPABASE_PROFILES_TABLE}`, {
      on_conflict: "user_id",
      select: "payload"
    }),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([
        {
          user_id: userId,
          payload: profile,
          updated_at: nowIso()
        }
      ])
    }
  );
  return sanitizeProfile(rows[0]?.payload ?? profile);
}

async function getSupabaseEntryRow(userId: string, date: string): Promise<SupabaseEntryRow | null> {
  const path = appendQuery(`/rest/v1/${SUPABASE_ENTRIES_TABLE}`, {
    select: "user_id,date,payload,updated_at",
    user_id: postgrestEq(userId),
    date: postgrestEq(date),
    limit: "1"
  });
  const rows = await supabaseRestJson<SupabaseEntryRow[]>(path);
  return rows[0] ?? null;
}

async function upsertSupabaseEntry(userId: string, date: string, entry: DailyEntry): Promise<DailyEntry> {
  const rows = await supabaseRestJson<SupabaseEntryRow[]>(
    appendQuery(`/rest/v1/${SUPABASE_ENTRIES_TABLE}`, {
      on_conflict: "user_id,date",
      select: "payload"
    }),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([
        {
          user_id: userId,
          date,
          payload: entry,
          updated_at: nowIso()
        }
      ])
    }
  );
  return sanitizeEntry(date, rows[0]?.payload ?? entry);
}

async function getSupabaseEntriesMapByDates(userId: string, dates: string[]) {
  if (dates.length === 0) return {} as Record<string, DailyEntry | null>;
  const path = appendQuery(`/rest/v1/${SUPABASE_ENTRIES_TABLE}`, {
    select: "date,payload",
    user_id: postgrestEq(userId),
    date: postgrestIn(dates)
  });
  const rows = await supabaseRestJson<Array<{ date: string; payload: DailyEntry }>>(path);
  const byDate = new Map(rows.map((row) => [row.date, sanitizeEntry(row.date, row.payload)]));
  return Object.fromEntries(dates.map((date) => [date, byDate.get(date) ?? null]));
}

async function listSupabaseEntriesForYear(userId: string, year: number) {
  const from = `${year - 1}-12-20`;
  const to = `${year + 1}-01-10`;
  // Build manually to keep duplicate "date" filters (gte/lte).
  const search = new URLSearchParams();
  search.set("select", "date,payload");
  search.set("user_id", postgrestEq(userId));
  search.append("date", postgrestRangeGte(from));
  search.append("date", postgrestRangeLte(to));
  const rows = await supabaseRestJson<Array<{ date: string; payload: DailyEntry }>>(
    `/rest/v1/${SUPABASE_ENTRIES_TABLE}?${search.toString()}`
  );
  return Object.fromEntries(rows.map((row) => [row.date, sanitizeEntry(row.date, row.payload)])) as Record<string, DailyEntry>;
}

export async function readDb(): Promise<AppDb> {
  // Exposed for compatibility; always reads local file backend.
  return readLocalDb();
}

export async function getProfile() {
  if (!isSupabaseDbEnabled()) {
    const db = await readLocalDb();
    return db.profile;
  }

  const userId = await getScopedUserId();
  const row = await getSupabaseProfileRow(userId);
  return row ? sanitizeProfile(row.payload) : structuredClone(EMPTY_PROFILE);
}

export async function saveProfile(profile: Partial<AppDb["profile"]>) {
  const currentProfile = await getProfile();
  const nextProfile = {
    ...currentProfile,
    name: typeof profile.name === "string" ? profile.name : currentProfile.name,
    vorname: typeof profile.vorname === "string" ? profile.vorname : currentProfile.vorname,
    defaultArbeitsstaetteProjekte:
      typeof profile.defaultArbeitsstaetteProjekte === "string"
        ? profile.defaultArbeitsstaetteProjekte
        : currentProfile.defaultArbeitsstaetteProjekte,
    defaultArtDerArbeit:
      typeof profile.defaultArtDerArbeit === "string"
        ? profile.defaultArtDerArbeit
        : currentProfile.defaultArtDerArbeit
  };

  if (!isSupabaseDbEnabled()) {
    const db = await readLocalDb();
    db.profile = nextProfile;
    await writeLocalDb(db);
    return db.profile;
  }

  return upsertSupabaseProfile(await getScopedUserId(), nextProfile);
}

export async function getEntry(date: string): Promise<DailyEntry | null> {
  if (!isSupabaseDbEnabled()) {
    const db = await readLocalDb();
    return db.entries[date] ?? null;
  }

  const row = await getSupabaseEntryRow(await getScopedUserId(), date);
  return row ? sanitizeEntry(date, row.payload) : null;
}

export async function saveEntry(date: string, entry: unknown): Promise<DailyEntry> {
  const sanitized = sanitizeEntry(date, entry);

  if (!isSupabaseDbEnabled()) {
    const db = await readLocalDb();
    db.entries[date] = sanitized;
    await writeLocalDb(db);
    return sanitized;
  }

  return upsertSupabaseEntry(await getScopedUserId(), date, sanitized);
}

export async function getEntriesByDates(dates: string[]) {
  if (!isSupabaseDbEnabled()) {
    const db = await readLocalDb();
    return Object.fromEntries(dates.map((d) => [d, db.entries[d] ?? null]));
  }

  return getSupabaseEntriesMapByDates(await getScopedUserId(), dates);
}

export async function getWeekSummary(year: number, kw: number): Promise<WeekSummary> {
  const dates = getIsoWeekDates(year, kw).map((d) => d.toISOString().slice(0, 10));
  const entries = await getEntriesByDates(dates);
  const filledDays = dates.filter((d) => {
    const entry = entries[d];
    return entry && entry.lines.some(hasMeaningfulLineData);
  }).length;

  const segments = splitWeekByMonth(getIsoWeekDates(year, kw));

  return {
    year,
    kw,
    dates,
    isMonthSplit: segments.length > 1,
    segments,
    filledDays,
    totalDaysWithEntries: Object.values(entries).filter(Boolean).length
  };
}

export async function listWeekSummaries(year: number): Promise<WeekSummary[]> {
  const entriesByDate = !isSupabaseDbEnabled()
    ? (await readLocalDb()).entries
    : await listSupabaseEntriesForYear(await getScopedUserId(), year);

  const weekCount = getIsoWeeksInYear(year);
  const results: WeekSummary[] = [];

  for (let kw = 1; kw <= weekCount; kw += 1) {
    const dates = getIsoWeekDates(year, kw).map((d) => d.toISOString().slice(0, 10));
    const filledDays = dates.filter((d) => {
      const entry = entriesByDate[d];
      return entry && entry.lines.some(hasMeaningfulLineData);
    }).length;
    const segments = splitWeekByMonth(getIsoWeekDates(year, kw));
    results.push({
      year,
      kw,
      dates,
      isMonthSplit: segments.length > 1,
      segments,
      filledDays,
      totalDaysWithEntries: dates.filter((d) => Boolean(entriesByDate[d])).length
    });
  }

  return results;
}
