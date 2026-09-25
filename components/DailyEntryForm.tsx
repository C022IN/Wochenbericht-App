"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { EMPTY_DAILY_LINE, type DailyEntry, type DailyLine, type DailyLineType } from "@/lib/types";
import { BAULEITER_LIST } from "@/lib/team";
import {
  ABSENCE_DAY_HOURS,
  computeBracketTotals,
  hasMeaningfulLineData,
  isAbsenceLohnType,
  isAbsenceProjektnummer
} from "@/lib/entry-utils";

function formatHours(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function previousIsoDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Day-specific fields cleared when copying a previous day (keep site/metadata, not the hours).
function templatizeLine(line: DailyEntry["lines"][number]) {
  return {
    ...line,
    id: makeLineId(),
    beginn: "",
    ende: "",
    pauseOverride: "",
    fahrzeit: "",
    dayHoursOverride: ""
  };
}

type EntryT = ReturnType<typeof useTranslations>;

type DayContext = {
  weekYear: number;
  weekKw: number;
};

function parseDecimalInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function autoPauseHoursFromGross(hours: number | null) {
  if (hours == null) return null;
  if (hours > 9.5) return 0.75;
  if (hours > 6) return 0.5;
  return 0;
}

function inferPauseFromNetHours(netHours: number | null) {
  if (netHours == null) return null;
  for (const pause of [0, 0.5, 0.75]) {
    const gross = netHours + pause;
    if (autoPauseHoursFromGross(gross) === pause) return pause;
  }
  return null;
}

function snapTimeToQuarter(value: string) {
  if (!value) return value;

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return value;
  }

  const totalMinutes = hours * 60 + minutes;
  const snappedMinutes = Math.min(23 * 60 + 45, Math.round(totalMinutes / 15) * 15);
  const snappedHours = Math.floor(snappedMinutes / 60);
  const snappedRemainder = snappedMinutes % 60;

  return `${String(snappedHours).padStart(2, "0")}:${String(snappedRemainder).padStart(2, "0")}`;
}

function pausePlaceholderForLine(line: DailyEntry["lines"][number], t: EntryT) {
  if (line.pauseOverride.trim()) return t("pauseAutoEmpty");

  const netHours = parseDecimalInput(line.dayHoursOverride);
  const inferredPause = inferPauseFromNetHours(netHours);
  if (inferredPause == null) return t("pauseAutoEmpty");
  if (inferredPause <= 0) return t("pauseAutoZero");
  return t("pauseAutoValue", { value: String(inferredPause).replace(".", ",") });
}

// AXIANS (Kickuth, 03.09.2026): the old projects 8212/8221 are no longer recorded — only the
// current project numbers. The former "alt" entries (P.0659633.1.01, P.0653304.1.01) were removed
// and the "NEU"/"alt" distinction dropped.
const KNOWN_PROJEKTNUMMERN: { code: string; label: string }[] = [
  { code: "P.0923220.1.01", label: "PTI 21/25" },
  { code: "P.0923209.1.01", label: "PTI 13/14" },
  { code: "G.014182.806.00", label: "Intern / Besprechung" },
  { code: "G.014182.796.00", label: "Schulung" },
  { code: "G.014182.801.00", label: "Jahresauftakt" },
  { code: "G.014182.811.01", label: "Werkzeugwartung" },
  { code: "G.014182.827.00", label: "Feiertag" },
  { code: "G.014182.838.00", label: "Krank" },
  { code: "G.014182.840.00", label: "Urlaub" },
];

const SITE_PROJ_RULES: { keywords: string[]; code: string }[] = [
  { keywords: ["urlaub"], code: "G.014182.840.00" },
  { keywords: ["krank"], code: "G.014182.838.00" },
  { keywords: ["feiertag", "fronleichnam", "weihnacht", "neujahr", "ostern", "pfingst", "maifeiertag", "tag der deutschen"], code: "G.014182.827.00" },
  { keywords: ["besprechung", "meeting", "toolbox", "jahresauftakt"], code: "G.014182.806.00" },
  { keywords: ["schulung", "ztv"], code: "G.014182.796.00" },
  { keywords: ["werkzeug"], code: "G.014182.811.01" },
];

const LOHN_PROJ_MAP: Record<string, string> = {
  U: "G.014182.840.00",
  F: "G.014182.827.00",
  K: "G.014182.838.00",
};

// AXIANS (Buchwald, 14.09.2026): Urlaub/Krank/Feiertag are full days and now carry "8" (hours)
// in the weekday column instead of a letter as before. The codes and the hours value live in
// lib/entry-utils so the form, the totals and both exporters cannot drift apart.
type LinePatch = Partial<DailyLine>;

/**
 * Applies the full-day-absence rules to a patch before it is merged into a line.
 *
 * Urlaub/Krank/Feiertag rows must carry "8" hours, otherwise the day drops out of the weekly
 * total — the exporters and the in-app totals only count an absence row when it has hours. A line
 * becomes an absence either by wage type (U/K/F) or by the project number it is given, so both
 * paths have to fill the hours in. Switching back away from an absence undoes exactly what this
 * form filled in, so a row the user changed back to normal work stops counting as a full day.
 */
function applyAbsenceRules(line: DailyLine, patch: LinePatch): void {
  const nextLohnType = typeof patch.lohnType === "string" ? patch.lohnType.trim().toUpperCase() : null;
  const wasAbsence = isAbsenceLohnType(line.lohnType);
  const becomesAbsenceLohn = nextLohnType !== null && isAbsenceLohnType(nextLohnType);
  const picksAbsenceProj = typeof patch.projektnummer === "string" && isAbsenceProjektnummer(patch.projektnummer);
  const dayHoursUntouched = patch.dayHoursOverride === undefined;

  if ((becomesAbsenceLohn || picksAbsenceProj) && dayHoursUntouched && !line.dayHoursOverride.trim()) {
    patch.dayHoursOverride = ABSENCE_DAY_HOURS;
    return;
  }

  if (nextLohnType !== null && wasAbsence && !becomesAbsenceLohn && !picksAbsenceProj) {
    const autoFilledProj = LOHN_PROJ_MAP[line.lohnType.trim().toUpperCase()];
    if (autoFilledProj && line.projektnummer.trim() === autoFilledProj && typeof patch.projektnummer !== "string") {
      patch.projektnummer = "";
    }
    if (dayHoursUntouched && line.dayHoursOverride.trim() === ABSENCE_DAY_HOURS) {
      patch.dayHoursOverride = "";
    }
  }
}

function suggestProjektnummer(siteNameOrt: string, lohnType: string): string {
  if (LOHN_PROJ_MAP[lohnType]) return LOHN_PROJ_MAP[lohnType];
  const lower = siteNameOrt.trim().toLowerCase();
  if (!lower) return "";
  for (const rule of SITE_PROJ_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.code;
  }
  return "P.0923220.1.01";
}

const CUSTOM_SENTINEL = "__custom__";


const TEAM_KOLLEGEN = [
  "Alekseev Alik",
  "Anjeo Collin Ambani",
  "Auer Andreas",
  "Aumuller Stefan Lorenz",
  "Bayer Thomas",
  "Berger Maurice",
  "Bohme Siegfried",
  "Brauer Beatrix",
  "Buchwald Laura",
  "Dauer Katja",
  "Hartmann Michael",
  "Hoffmann Albin",
  "Imhof Nicole",
  "Jutersonke Ronny",
  "Kerling Stefan",
  "Kickuth Joster",
  "Kickuth Thorsten",
  "Kindermann Henry",
  "Kindermann Maik",
  "Kolesov Wladimir",
  "Kruger Ronny",
  "Menzke Helmut",
  "Nikol Peter",
  "Pieper Marcus",
  "Pohl Martin",
  "Reichenbach Ronny",
  "Rinderlin Barbara",
  "Rosner Sebastian",
  "Rothel Markus",
  "Sauer Michael",
  "Schmitt Beate",
  "Schmitz Dennis",
  "Schrempf Volker",
  "Seidel Christian",
  "Seidel Fabian",
  "Singer Peter",
  "Sommer Christian",
  "Sontea Constantin",
  "Stark Hannes",
  "Tremel Frank",
  "Varga Gabriel",
  "Wagner Sergej",
  "Walther Sven",
  "Wirth Thomas",
];

function ProjektnummerField({ value, onChange, t }: { value: string; onChange: (v: string) => void; t: EntryT }) {
  const isKnown = KNOWN_PROJEKTNUMMERN.some((p) => p.code === value);
  const [customMode, setCustomMode] = useState(() => value !== "" && !KNOWN_PROJEKTNUMMERN.some((p) => p.code === value));

  const selectValue = customMode ? CUSTOM_SENTINEL : value;

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(v);
    }
  }

  // If parent resets value to a known code (e.g. line init), exit custom mode
  if (!customMode && !isKnown && value !== "") {
    setCustomMode(true);
  }
  if (customMode && isKnown) {
    setCustomMode(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <select value={selectValue} onChange={handleSelectChange}>
        <option value="">{t("projNone")}</option>
        {KNOWN_PROJEKTNUMMERN.map((p) => (
          <option key={p.code} value={p.code}>
            {p.label} — {p.code}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>{t("projOther")}</option>
      </select>
      {customMode && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("projOtherPlaceholder")}
        />
      )}
    </div>
  );
}

function SimpleDropdownField({
  value,
  onChange,
  options,
  placeholder,
  noneLabel,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  noneLabel?: string;
  t: EntryT;
}) {
  const resolvedNoneLabel = noneLabel ?? t("projNone");
  const isKnown = options.includes(value);
  const [customMode, setCustomMode] = useState(() => value !== "" && !options.includes(value));

  const selectValue = customMode ? CUSTOM_SENTINEL : value;

  if (!customMode && !isKnown && value !== "") setCustomMode(true);
  if (customMode && isKnown) setCustomMode(false);

  function handleSelectChange(e: ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(v);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <select value={selectValue} onChange={handleSelectChange}>
        <option value="">{resolvedNoneLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>{t("dropdownOther")}</option>
      </select>
      {customMode && (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

function makeLineId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createBlankLine(defaultBauleiter = "") {
  return { ...EMPTY_DAILY_LINE(), id: makeLineId(), bauleiter: defaultBauleiter };
}

function normalizeEntry(
  date: string,
  initial: DailyEntry | null,
  defaults: { proj: string; arbeit: string; bauleiter: string }
): DailyEntry {
  if (!initial) {
    return {
      date,
      arbeitsstaetteProjekte: defaults.proj,
      artDerArbeit: defaults.arbeit,
      lines: [createBlankLine(defaults.bauleiter)],
      updatedAt: new Date().toISOString()
    };
  }

  const lines = initial.lines.length
    ? initial.lines.map((line) => {
        const normalizedLineType: DailyLineType = line.lineType === "baustelle" ? "baustelle" : "arbeitszeit";
        return {
          ...EMPTY_DAILY_LINE(),
          ...line,
          id: line.id || makeLineId(),
          lineType: normalizedLineType
        };
      })
    : [createBlankLine(defaults.bauleiter)];

  return { ...initial, date, lines };
}

export function DailyEntryForm({
  date,
  initialEntry,
  defaults,
  weekContext
}: {
  date: string;
  initialEntry: DailyEntry | null;
  defaults: { proj: string; arbeit: string; bauleiter: string };
  weekContext: DayContext;
}) {
  const t = useTranslations("entry");
  const tc = useTranslations("common");
  const [entry, setEntry] = useState(() => normalizeEntry(date, initialEntry, defaults));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [copyingPrev, setCopyingPrev] = useState(false);
  const firstRunRef = useRef(true);
  // Holds the latest payload that has NOT yet been persisted, so a pending debounced
  // change can be flushed when the user navigates away / closes the tab (bug: lost edits).
  const dirtyRef = useRef<string | null>(null);
  const latestPayload = useMemo(() => JSON.stringify(entry), [entry]);

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }

    dirtyRef.current = latestPayload;
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      setError("");
      try {
        const res = await fetch(`/api/entries/${encodeURIComponent(date)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: latestPayload
        });
        let data: { error?: string } | null = null;
        try {
          data = (await res.json()) as { error?: string };
        } catch {
          data = null;
        }
        if (!res.ok) throw new Error(data?.error || t("saveError"));

        if (dirtyRef.current === latestPayload) dirtyRef.current = null;
        startTransition(() => {
          setSaveState("saved");
        });
        window.setTimeout(() => setSaveState("idle"), 1200);
      } catch (e) {
        setSaveState("error");
        const message = e instanceof Error ? e.message : t("saveError");
        setError(message === "Failed to fetch" ? t("saveErrorUnreachable") : message);
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [date, latestPayload, t]);

  // Flush any pending (debounced-but-unsaved) change on unmount / tab close, so leaving a
  // day within the 650ms debounce window does not drop the edit. `keepalive` lets the PUT
  // complete during navigation/unload. Bound to `date` so it always targets the right day.
  useEffect(() => {
    const flush = () => {
      const payload = dirtyRef.current;
      if (!payload) return;
      dirtyRef.current = null;
      try {
        fetch(`/api/entries/${encodeURIComponent(date)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true
        }).catch(() => {});
      } catch {
        // best-effort; nothing more we can do during unload
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [date]);

  function updateLine(index: number, patch: Partial<(typeof entry.lines)[number]>) {
    const normalizedPatch = { ...patch };
    if (typeof normalizedPatch.beginn === "string") {
      normalizedPatch.beginn = snapTimeToQuarter(normalizedPatch.beginn);
    }
    if (typeof normalizedPatch.ende === "string") {
      normalizedPatch.ende = snapTimeToQuarter(normalizedPatch.ende);
    }
    if (typeof normalizedPatch.dayHoursOverride === "string" && normalizedPatch.dayHoursOverride.trim().toLowerCase() === "x") {
      normalizedPatch.dayHoursOverride = "x";
    }

    setEntry((prev) => {
      const currentLine = prev.lines[index];
      // Auto-fill projektnummer when lohnType changes and projektnummer is still empty
      if (typeof normalizedPatch.lohnType === "string" && !currentLine.projektnummer && !normalizedPatch.projektnummer) {
        const suggested = suggestProjektnummer(currentLine.siteNameOrt, normalizedPatch.lohnType);
        if (suggested) normalizedPatch.projektnummer = suggested;
      }
      // Urlaub/Krank/Feiertag → full day with "8" hours (new AXIANS rule).
      applyAbsenceRules(currentLine, normalizedPatch);
      return {
        ...prev,
        lines: prev.lines.map((line, i) => (i === index ? { ...line, ...normalizedPatch } : line))
      };
    });
  }

  function autoFillProjOnSiteBlur(index: number, siteNameOrt: string) {
    setEntry((prev) => {
      const line = prev.lines[index];
      const suggested = suggestProjektnummer(siteNameOrt, line.lohnType);
      const patch: LinePatch = {};
      if (!line.projektnummer && suggested) patch.projektnummer = suggested;
      // A Urlaub/Krank/Feiertag site is a full day — but only when that project number is actually
      // applied to this row. If the user kept their own (non-absence) project number, the "8" must
      // not be written, or Excel would show hours the weekly total deliberately ignores.
      const resultingProj = patch.projektnummer ?? line.projektnummer;
      if (isAbsenceProjektnummer(resultingProj) && !line.dayHoursOverride.trim()) {
        patch.dayHoursOverride = ABSENCE_DAY_HOURS;
      }
      if (Object.keys(patch).length === 0) return prev;
      return {
        ...prev,
        lines: prev.lines.map((l, i) => (i === index ? { ...l, ...patch } : l))
      };
    });
  }

  function addLine() {
    setEntry((prev) => ({
      ...prev,
      lines: [...prev.lines, { ...createBlankLine(defaults.bauleiter), lineType: "baustelle" }]
    }));
  }

  function removeLine(index: number) {
    setEntry((prev) => ({
      ...prev,
      lines:
        prev.lines.length <= 1
          ? [createBlankLine(defaults.bauleiter)]
          : prev.lines.filter((_, i) => i !== index)
    }));
  }

  function duplicateLine(index: number) {
    setEntry((prev) => {
      const src = prev.lines[index];
      if (!src) return prev;
      const copy = { ...src, id: makeLineId() };
      const lines = [...prev.lines];
      lines.splice(index + 1, 0, copy);
      return { ...prev, lines };
    });
  }

  // Pull the previous day's rows in as a template (site/metadata kept, hours cleared). Appends
  // to an already-filled day; replaces an empty one — never silently discards existing work.
  async function copyPreviousDay() {
    setCopyingPrev(true);
    setError("");
    try {
      const res = await fetch(`/api/entries/${encodeURIComponent(previousIsoDate(date))}`);
      const data = (await res.json().catch(() => null)) as { entry?: DailyEntry | null } | null;
      const prevLines = data?.entry?.lines?.filter(hasMeaningfulLineData) ?? [];
      if (!prevLines.length) {
        setError(t("copyPreviousEmpty"));
        return;
      }
      const copied = prevLines.map(templatizeLine);
      setEntry((prev) => {
        const hasContent = prev.lines.some(hasMeaningfulLineData);
        return { ...prev, lines: hasContent ? [...prev.lines, ...copied] : copied };
      });
    } catch {
      setError(t("copyPreviousFailed"));
    } finally {
      setCopyingPrev(false);
    }
  }

  function setLineType(index: number, lineType: DailyLineType) {
    if (lineType === "baustelle") {
      updateLine(index, {
        lineType,
        beginn: "",
        ende: "",
        pauseOverride: "",
        fahrzeit: ""
      });
      return;
    }

    updateLine(index, { lineType });
  }

  // Live day total using the exact rule the exporters use (arbeitszeit lines with an
  // E/F bracket) — lets the user sanity-check hours without opening the Excel.
  const dayTotals = useMemo(() => computeBracketTotals(entry.lines), [entry.lines]);

  return (
    <section className="grid" style={{ gap: "1rem" }}>
      <section className="card">
        <div className="toolbar spread">
          <div>
            <h2 style={{ marginBottom: "0.35rem" }}>{t("entryTitle", { date })}</h2>
            <div className="small">
              <Link href={`/week/${weekContext.weekYear}/${weekContext.weekKw}`}>{t("weekShort", { kw: weekContext.weekKw })}</Link>
            </div>
          </div>
          <div className="toolbar">
            {dayTotals.gesamt > 0 ? (
              <span className="pill" title={t("dayTotalHint")}>
                {t("dayTotal", {
                  gesamt: formatHours(dayTotals.gesamt),
                  netto: formatHours(dayTotals.netto)
                })}
              </span>
            ) : null}
            {saveState === "saving" ? <span className="pill">{tc("saving")}</span> : null}
            {saveState === "saved" ? <span className="pill ok">{tc("saved")}</span> : null}
            {saveState === "error" ? <span className="pill err">{tc("error")}</span> : null}
          </div>
        </div>

        <div className="field-grid" style={{ marginTop: "0.8rem" }}>
          <label>
            <span className="label-title">{t("workplaceProjects")}</span>
            <input
              value={entry.arbeitsstaetteProjekte}
              onChange={(e) => setEntry((prev) => ({ ...prev, arbeitsstaetteProjekte: e.target.value }))}
            />
          </label>
          <label>
            <span className="label-title">{t("typeOfWork")}</span>
            <input
              value={entry.artDerArbeit}
              onChange={(e) => setEntry((prev) => ({ ...prev, artDerArbeit: e.target.value }))}
            />
          </label>
        </div>

        <div className="toolbar" style={{ marginTop: "0.75rem" }}>
          <button className="btn primary" type="button" onClick={addLine}>
            {t("addRow")}
          </button>
          <button className="btn" type="button" onClick={copyPreviousDay} disabled={copyingPrev}>
            {t("copyPreviousDay")}
          </button>
        </div>

        {error ? <p className="status-text" style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>

      <section className="card">
        <h3>{t("workRows")}</h3>
        <div className="line-list">
          {entry.lines.map((line, index) => (
            <article className="line-card" key={line.id || index}>
              <header>
                <h4>{t("row", { n: index + 1 })}</h4>
                <div className="toolbar">
                  <button className="btn" type="button" onClick={() => duplicateLine(index)}>
                    {t("duplicateRow")}
                  </button>
                  <button className="btn" type="button" onClick={() => removeLine(index)}>
                    {t("remove")}
                  </button>
                </div>
              </header>

              <div className="line-grid">
                <label className="span-4">
                  <span className="label-title">{t("siteLocation")}</span>
                  <input
                    value={line.siteNameOrt}
                    onChange={(e) => updateLine(index, { siteNameOrt: e.target.value })}
                    onBlur={(e) => autoFillProjOnSiteBlur(index, e.target.value)}
                    placeholder={t("sitePlaceholder")}
                  />
                </label>
                <label className="span-2">
                  <span className="label-title">{t("rowType")}</span>
                  <select
                    value={line.lineType || "arbeitszeit"}
                    onChange={(e) => setLineType(index, e.target.value as DailyLineType)}
                  >
                    <option value="arbeitszeit">{t("rowTypeWork")}</option>
                    <option value="baustelle">{t("rowTypeSite")}</option>
                  </select>
                </label>

                {line.lineType !== "baustelle" ? (
                  <>
                    <label>
                      <span className="label-title">{t("start")}</span>
                      <input
                        type="time"
                        step={900}
                        value={line.beginn}
                        onChange={(e) => updateLine(index, { beginn: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="label-title">{t("end")}</span>
                      <input
                        type="time"
                        step={900}
                        value={line.ende}
                        onChange={(e) => updateLine(index, { ende: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="label-title">{t("pause")}</span>
                      <input
                        value={line.pauseOverride}
                        onChange={(e) => updateLine(index, { pauseOverride: e.target.value })}
                        placeholder={pausePlaceholderForLine(line, t)}
                      />
                    </label>
                    <label>
                      <span className="label-title">{t("fahrzeit")}</span>
                      <input
                        value={line.fahrzeit}
                        onChange={(e) => updateLine(index, { fahrzeit: e.target.value })}
                        placeholder={t("fahrzeitPlaceholder")}
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  <span className="label-title">{t("dayHours")}</span>
                  <input
                    value={line.dayHoursOverride}
                    onChange={(e) => updateLine(index, { dayHoursOverride: e.target.value })}
                    placeholder={t("dayHoursPlaceholder")}
                  />
                </label>
                <label>
                  <span className="label-title">{t("wageType")}</span>
                  <select value={line.lohnType} onChange={(e) => updateLine(index, { lohnType: e.target.value })}>
                    <option value="">-</option>
                    <option value="S">S</option>
                    <option value="L">L</option>
                    <option value="K">K</option>
                    <option value="U">U</option>
                    <option value="F">F</option>
                    <option value="UB">UB</option>
                  </select>
                </label>

                <label>
                  <span className="label-title">{t("allowance")}</span>
                  <select value={line.ausloese} onChange={(e) => updateLine(index, { ausloese: e.target.value })}>
                    <option value="">-</option>
                    <option value="NA">NA</option>
                    <option value="FA">FA</option>
                  </select>
                </label>
                <label>
                  <span className="label-title">{t("bonus")}</span>
                  <input value={line.zulage} onChange={(e) => updateLine(index, { zulage: e.target.value })} />
                </label>
                <label className="span-2">
                  <span className="label-title">{t("projectNumber")}</span>
                  <ProjektnummerField
                    value={line.projektnummer}
                    onChange={(v) => updateLine(index, { projektnummer: v })}
                    t={t}
                  />
                </label>
                <label className="span-2">
                  <span className="label-title">{t("cableShaft")}</span>
                  <input
                    value={line.kabelschachtInfo}
                    onChange={(e) => updateLine(index, { kabelschachtInfo: e.target.value })}
                  />
                </label>
                <label>
                  <span className="label-title">{t("smNr")}</span>
                  <input value={line.smNr} onChange={(e) => updateLine(index, { smNr: e.target.value })} />
                </label>
                <label className="span-3">
                  <span className="label-title">{t("siteManager")}</span>
                  <SimpleDropdownField
                    value={line.bauleiter}
                    onChange={(v) => updateLine(index, { bauleiter: v })}
                    options={BAULEITER_LIST}
                    placeholder={t("namePlaceholder")}
                    t={t}
                  />
                </label>
                <label className="span-3">
                  <span className="label-title">{t("colleague")}</span>
                  <SimpleDropdownField
                    value={line.arbeitskollege}
                    onChange={(v) => updateLine(index, { arbeitskollege: v })}
                    options={["allein", ...TEAM_KOLLEGEN]}
                    placeholder={t("namePlaceholder")}
                    noneLabel={t("colleagueNone")}
                    t={t}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
