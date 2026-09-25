import type { DailyEntry, DailyLine } from "./types";

export function hasMeaningfulLineData(line: DailyLine) {
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
      line.fahrzeit.trim() ||
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

function parseHhMm(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function parseNum(value: string): number | null {
  const n = parseFloat(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function autoPauseHours(gross: number): number {
  if (gross > 9.5) return 0.75;
  if (gross > 6) return 0.5;
  return 0;
}

/** Gross hours of a Beginn/Ende bracket; negative diffs wrap past midnight. */
function bracketGrossHours(startMinutes: number, endMinutes: number): number {
  const gross = (endMinutes - startMinutes) / 60;
  return gross < 0 ? gross + 24 : gross;
}

/** Pause that applies to a bracketed row: the typed override, else the template's auto-pause. */
function resolvePauseHours(line: DailyLine, gross: number): number {
  const explicit = parseNum(line.pauseOverride);
  return explicit !== null ? explicit : autoPauseHours(gross);
}

// Urlaub / Krank / Feiertag — full-day absences. They carry their logged day-hours (e.g. 8) and,
// unlike normal site rows, count toward the weekly total (both O and P, no pause deducted).
//
// Single source of truth for "this row is a full-day absence": the entry form, the in-app day/week
// totals and both exporters (ExcelJS + Python) have to agree, or the printed weekly Gesamtstunden
// silently diverges from what the app previews.
export const ABSENCE_DAY_HOURS = "8";
export const ABSENCE_PROJ_CODES = new Set(["G.014182.840.00", "G.014182.838.00", "G.014182.827.00"]);
export const ABSENCE_LOHN_TYPES = new Set(["U", "K", "F"]);

export function isAbsenceProjektnummer(value: string): boolean {
  return ABSENCE_PROJ_CODES.has(value.trim());
}

export function isAbsenceLohnType(value: string): boolean {
  return ABSENCE_LOHN_TYPES.has(value.trim().toUpperCase());
}

export function isAbsenceLine(line: DailyLine): boolean {
  return isAbsenceProjektnummer(line.projektnummer) || isAbsenceLohnType(line.lohnType);
}

/**
 * The hours that feed the Excel Gesamtstunden: arbeitszeit lines with a Beginn/Ende bracket
 * (identical rule to the exporters' O/P formulas), PLUS Urlaub/Krank/Feiertag absence rows,
 * which count their logged day-hours (e.g. 8) with no pause.
 * `gesamt` = incl. pause; `netto` = minus pause.
 */
export function computeBracketTotals(lines: DailyLine[]): { gesamt: number; netto: number } {
  let gesamt = 0;
  let netto = 0;
  for (const line of lines) {
    const start = parseHhMm(line.beginn);
    const end = parseHhMm(line.ende);
    if (line.lineType === "arbeitszeit" && start !== null && end !== null) {
      let gross = (end - start) / 60;
      if (gross < 0) gross += 24; // crosses midnight
      const explicit = parseNum(line.pauseOverride);
      const pause = explicit !== null ? explicit : autoPauseHours(gross);
      gesamt += gross;
      netto += gross - pause;
      continue;
    }
    // Absence day (no clock bracket): count the logged hours, e.g. 8 for a full Urlaub day.
    if (isAbsenceLine(line)) {
      const hours = parseNum(line.dayHoursOverride);
      if (hours !== null && hours > 0) {
        gesamt += hours;
        netto += hours;
      }
    }
  }
  return { gesamt: Math.round(gesamt * 100) / 100, netto: Math.round(netto * 100) / 100 };
}

export function countMeaningfulLines(entry: DailyEntry | null | undefined) {
  if (!entry) return 0;
  return entry.lines.filter(hasMeaningfulLineData).length;
}

export function entryHasMeaningfulContent(entry: DailyEntry | null | undefined) {
  return countMeaningfulLines(entry) > 0;
}
