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

/**
 * The hours that actually feed the Excel Gesamtstunden: only arbeitszeit lines with a
 * Beginn/Ende bracket contribute (identical rule to the exporters' O/P formulas).
 * `gesamt` = sum of gross bracket hours (incl. pause); `netto` = minus pause.
 */
export function computeBracketTotals(lines: DailyLine[]): { gesamt: number; netto: number } {
  let gesamt = 0;
  let netto = 0;
  for (const line of lines) {
    if (line.lineType !== "arbeitszeit") continue;
    const start = parseHhMm(line.beginn);
    const end = parseHhMm(line.ende);
    if (start === null || end === null) continue;
    let gross = (end - start) / 60;
    if (gross < 0) gross += 24; // crosses midnight
    const explicit = parseNum(line.pauseOverride);
    const pause = explicit !== null ? explicit : autoPauseHours(gross);
    gesamt += gross;
    netto += gross - pause;
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
