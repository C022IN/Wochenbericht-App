import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUserId, requireCurrentUser } from "./auth";
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

type ScopedUserIdentity = {
  id: string;
  email: string | null;
};

async function getScopedUserIdentity(): Promise<ScopedUserIdentity> {
  if (!isSupabaseDbEnabled()) {
    return {
      id: process.env.APP_DEFAULT_USER_ID?.trim() || "local-user",
      email: process.env.APP_DEFAULT_USER_EMAIL?.trim() || null
    };
  }

  const user = await requireCurrentUser();
  return {
    id: user.id,
    email: typeof user.email === "string" && user.email.trim() ? user.email.trim() : null
  };
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

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getEmailLocalPart(email?: string | null) {
  const trimmed = normalizeOptionalText(email);
  if (!trimmed) return "";
  const localPart = trimmed.split("@", 1)[0]?.split("+", 1)[0]?.trim() ?? "";
  return localPart;
}

function capitalizeNamePart(value: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function deriveProfileNamesFromEmail(email?: string | null) {
  const localPart = getEmailLocalPart(email);
  if (!localPart) {
    return { vorname: "", name: "" };
  }

  const dotParts = localPart
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  const toWords = (value: string) =>
    value
      .split(/[-_]+/g)
      .map((part) => part.trim())
      .filter(Boolean)
      .map(capitalizeNamePart);

  if (dotParts.length <= 1) {
    return {
      vorname: toWords(dotParts[0] ?? "").join(" ").trim(),
      name: ""
    };
  }

  return {
    vorname: toWords(dotParts.slice(0, -1).join("-")).join(" ").trim(),
    name: toWords(dotParts[dotParts.length - 1]).join(" ").trim()
  };
}

function buildSupabaseProfileColumns(profile: UserProfile, email?: string | null) {
  const normalizedEmail = normalizeOptionalText(email);
  const firstName = normalizeOptionalText(profile.vorname);
  const lastName = normalizeOptionalText(profile.name);
  const username = normalizeOptionalText(getEmailLocalPart(normalizedEmail));
  const displayName = normalizeOptionalText([firstName, lastName].filter(Boolean).join(" "));

  return {
    email: normalizedEmail,
    username,
    first_name: firstName,
    last_name: lastName,
    display_name: displayName
  };
}

function profileFromSupabaseRow(row: SupabaseProfileRow, authEmail?: string | null): UserProfile {
  const payload = sanitizeProfile(row.payload);
  const emailFallback = row.email ?? authEmail ?? null;
  const derivedNames = deriveProfileNamesFromEmail(emailFallback);
  const firstNameFallback = normalizeOptionalText(row.first_name) ?? normalizeOptionalText(derivedNames.vorname) ?? "";
  const lastNameFallback = normalizeOptionalText(row.last_name) ?? normalizeOptionalText(derivedNames.name) ?? "";

  return sanitizeProfile({
    ...payload,
    vorname: payload.vorname || firstNameFallback,
    name: payload.name || lastNameFallback
  });
}

function createInitialProfileFromEmail(email?: string | null): UserProfile {
  const derived = deriveProfileNamesFromEmail(email);
  return sanitizeProfile({
    ...EMPTY_PROFILE,
    vorname: derived.vorname,
    name: derived.name
  });
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
  email?: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  created_at?: string;
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
    select: "user_id,email,username,first_name,last_name,display_name,payload,created_at,updated_at",
    user_id: postgrestEq(userId),
    limit: "1"
  });
  const rows = await supabaseRestJson<SupabaseProfileRow[]>(path);
  return rows[0] ?? null;
}

async function upsertSupabaseProfile(identity: ScopedUserIdentity, profile: UserProfile): Promise<UserProfile> {
  const columns = buildSupabaseProfileColumns(profile, identity.email);
  const rows = await supabaseRestJson<SupabaseProfileRow[]>(
    appendQuery(`/rest/v1/${SUPABASE_PROFILES_TABLE}`, {
      on_conflict: "user_id",
      select: "user_id,email,username,first_name,last_name,display_name,payload,created_at,updated_at"
    }),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify([
        {
          user_id: identity.id,
          ...columns,
          payload: profile,
          updated_at: nowIso()
        }
      ])
    }
  );

  const fallbackRow: SupabaseProfileRow = {
    user_id: identity.id,
    payload: profile,
    ...columns
  };

  return profileFromSupabaseRow(rows[0] ?? fallbackRow, identity.email);
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

  const identity = await getScopedUserIdentity();
  const row = await getSupabaseProfileRow(identity.id);
  if (row) {
    return profileFromSupabaseRow(row, identity.email);
  }

  const initialProfile = createInitialProfileFromEmail(identity.email);
  return upsertSupabaseProfile(identity, initialProfile);
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

  return upsertSupabaseProfile(await getScopedUserIdentity(), nextProfile);
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
